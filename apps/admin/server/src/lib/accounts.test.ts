import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Config + db read env at import time, so set everything before importing them.
process.env.SESSION_SECRET = '0'.repeat(64);
process.env.SETUP_CODE_HASH = 'unused-in-these-tests';
process.env.SSO_SESSION_SECRET = 'test-sso-secret';
process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'admin-test-'));

const accounts = await import('./accounts.js');
const sso = await import('./ssoSession.js');

test('ensureOwnerAccount seeds an owner with every gated service', () => {
  accounts.ensureOwnerAccount();
  const owner = accounts.getAccount(accounts.OWNER_ACCOUNT_ID);
  assert.ok(owner, 'owner account exists');
  assert.equal(owner!.is_owner, 1);
  for (const svc of accounts.GATED_SERVICES) {
    assert.equal(accounts.isAllowed(accounts.OWNER_ACCOUNT_ID, svc), true, `owner allowed ${svc}`);
  }
});

test('a friend account only has the services it was granted', () => {
  accounts.createAccount({ id: 'friend1', name: 'Friend', services: ['bookmark-manager'] });
  assert.equal(accounts.isAllowed('friend1', 'bookmark-manager'), true);
  assert.equal(accounts.isAllowed('friend1', 'tts'), false);
  assert.equal(accounts.isAllowed('friend1', 'admin'), false);
});

test('toggling a service grant takes effect', () => {
  accounts.setServiceAccess('friend1', 'tts', true);
  assert.equal(accounts.isAllowed('friend1', 'tts'), true);
  accounts.setServiceAccess('friend1', 'tts', false);
  assert.equal(accounts.isAllowed('friend1', 'tts'), false);
});

test('disabling an account revokes everything', () => {
  accounts.setAccountStatus('friend1', 'disabled');
  assert.equal(accounts.isAllowed('friend1', 'bookmark-manager'), false);
  accounts.setAccountStatus('friend1', 'active');
  assert.equal(accounts.isAllowed('friend1', 'bookmark-manager'), true);
});

test('unknown account is denied', () => {
  assert.equal(accounts.isAllowed('nope', 'bookmark-manager'), false);
});

test('deleteAccount removes the account and its grants', () => {
  accounts.createAccount({ id: 'temp', name: 'Temp', services: ['redirector'] });
  assert.equal(accounts.isAllowed('temp', 'redirector'), true);
  accounts.deleteAccount('temp');
  assert.equal(accounts.getAccount('temp'), undefined);
  assert.equal(accounts.isAllowed('temp', 'redirector'), false);
});

test('SSO mint/verify round-trips the account id', async () => {
  const secret = 'test-sso-secret';
  const token = await sso.mintSsoSession(secret, { sub: 'friend1', name: 'Friend' });
  const claims = await sso.verifySsoSession(token, secret);
  assert.ok(claims);
  assert.equal(claims!.sub, 'friend1');
  assert.equal(claims!.name, 'Friend');
});

test('SSO verify rejects a bad signature', async () => {
  const token = await sso.mintSsoSession('secret-a', { sub: 'friend1' });
  const claims = await sso.verifySsoSession(token, 'secret-b');
  assert.equal(claims, null);
});
