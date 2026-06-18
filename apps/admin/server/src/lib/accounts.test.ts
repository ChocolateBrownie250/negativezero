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
const apiTokens = await import('./apiTokens.js');
const { jwtVerify } = await import('jose');

const TEST_SECRET = 'test-sso-secret';

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

test('authorize: owner is always allowed regardless of iat', () => {
  assert.equal(accounts.authorize(accounts.OWNER_ACCOUNT_ID, 'tts', 1), 'allow');
});

test('authorize: unknown account → reauth', () => {
  assert.equal(accounts.authorize('ghost', 'bookmark-manager', Date.now()), 'reauth');
});

test('authorize: instant deny on revoke, reauth on re-grant for old tokens', () => {
  accounts.createAccount({ id: 'rev1', name: 'Rev', services: ['bookmark-manager'] });
  const oldToken = Date.now() - 1000; // issued 1s ago
  assert.equal(accounts.authorize('rev1', 'bookmark-manager', oldToken), 'allow');

  // Revoke → the very next check denies immediately (no waiting).
  accounts.setServiceAccess('rev1', 'bookmark-manager', false);
  assert.equal(accounts.authorize('rev1', 'bookmark-manager', oldToken), 'deny');

  // Re-grant → the OLD session must re-auth; a freshly-issued token is allowed.
  accounts.setServiceAccess('rev1', 'bookmark-manager', true);
  assert.equal(accounts.authorize('rev1', 'bookmark-manager', oldToken), 'reauth');
  const freshToken = Date.now() + 5000;
  assert.equal(accounts.authorize('rev1', 'bookmark-manager', freshToken), 'allow');
});

test('authorize: a service the account never had → deny', () => {
  assert.equal(accounts.authorize('rev1', 'tts', Date.now() + 5000), 'deny');
});

test('authorize: disabling an account forces reauth for all sessions', () => {
  accounts.createAccount({ id: 'rev2', name: 'Rev2', services: ['tts'] });
  assert.equal(accounts.authorize('rev2', 'tts', Date.now() + 5000), 'allow');
  accounts.setAccountStatus('rev2', 'disabled');
  assert.equal(accounts.authorize('rev2', 'tts', Date.now() + 9999), 'reauth');
  // Re-enabling still forces a fresh login for pre-disable tokens.
  accounts.setAccountStatus('rev2', 'active');
  assert.equal(accounts.authorize('rev2', 'tts', 1), 'reauth');
});

test('api token: mint embeds account + jti and is verifiable', async () => {
  accounts.createAccount({ id: 'tok-acct', name: 'Tok', services: ['tts'] });
  const { id, token } = await apiTokens.mintApiToken({
    accountId: 'tok-acct',
    name: 'Tok',
    service: 'tts',
    label: 'shortcut',
    secret: TEST_SECRET,
  });
  const { payload } = await jwtVerify(token, new TextEncoder().encode(TEST_SECRET));
  assert.equal(payload.sub, 'tok-acct');
  assert.equal(payload.jti, id);
  assert.equal(payload.scope, 'api');
  assert.equal(payload.svc, 'tts');

  const list = apiTokens.listApiTokens('tok-acct');
  assert.equal(list.length, 1);
  assert.equal(list[0].revoked, false);
  assert.equal(apiTokens.apiTokenState(id), 'active');
});

test('api token: revoke flips state and is reflected in the list', async () => {
  const { id } = await apiTokens.mintApiToken({
    accountId: 'tok-acct',
    name: 'Tok',
    service: 'tts',
    label: null,
    secret: TEST_SECRET,
  });
  assert.equal(apiTokens.apiTokenState(id), 'active');
  assert.equal(apiTokens.revokeApiToken('tok-acct', id), true);
  assert.equal(apiTokens.apiTokenState(id), 'revoked');
  const revoked = apiTokens.listApiTokens('tok-acct').find((t) => t.id === id);
  assert.equal(revoked?.revoked, true);
  // Re-revoking is a no-op.
  assert.equal(apiTokens.revokeApiToken('tok-acct', id), false);
});

test('api token: unknown jti reports missing', () => {
  assert.equal(apiTokens.apiTokenState('does-not-exist'), 'missing');
});
