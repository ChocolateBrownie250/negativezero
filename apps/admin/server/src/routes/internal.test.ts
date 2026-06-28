import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';

// Config + db read env at import time, so set everything before importing them.
// SSO_SESSION_SECRET doubles as the internal bearer (config.ssoSecret).
process.env.SESSION_SECRET = '0'.repeat(64);
process.env.SETUP_CODE_HASH = 'unused-in-these-tests';
process.env.SSO_SESSION_SECRET = 'test-sso-secret';
process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'admin-internal-test-'));

const BEARER = 'test-sso-secret';

const accounts = await import('../lib/accounts.js');
const apiTokens = await import('../lib/apiTokens.js');
const { default: internalRoutes } = await import('./internal.js');

// Build a minimal app exposing just the internal routes, mirroring how
// index.ts mounts them at the /api prefix. The internal authz endpoint is
// bearer-guarded inside the handler and is NOT behind requireAuth, so no
// session plumbing is needed here.
async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(internalRoutes, { prefix: '/api' });
  await app.ready();
  return app;
}

function authzUrl(params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return `/api/internal/authz${qs ? `?${qs}` : ''}`;
}

test('internal authz: 401 without a bearer token', async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: 'GET',
    url: authzUrl({ account: accounts.OWNER_ACCOUNT_ID, service: 'tts' }),
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error, 'unauthorized');
  await app.close();
});

test('internal authz: 401 with the wrong bearer token', async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: 'GET',
    url: authzUrl({ account: accounts.OWNER_ACCOUNT_ID, service: 'tts' }),
    headers: { authorization: 'Bearer not-the-secret' },
  });
  assert.equal(res.statusCode, 401);
  await app.close();
});

test('internal authz: 400 when account or service is missing', async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: 'GET',
    url: authzUrl({ account: accounts.OWNER_ACCOUNT_ID }),
    headers: { authorization: `Bearer ${BEARER}` },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, 'validation');
  await app.close();
});

test('internal authz: owner is allowed for any gated service', async () => {
  accounts.ensureOwnerAccount();
  const app = await buildApp();
  const res = await app.inject({
    method: 'GET',
    url: authzUrl({ account: accounts.OWNER_ACCOUNT_ID, service: 'tts' }),
    headers: { authorization: `Bearer ${BEARER}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.decision, 'allow');
  assert.equal(body.allowed, true);
  assert.equal(body.status, 'active');
  assert.equal(body.name, 'Owner');
  await app.close();
});

test('internal authz: unknown account → reauth (not allowed)', async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: 'GET',
    url: authzUrl({ account: 'ghost', service: 'tts' }),
    headers: { authorization: `Bearer ${BEARER}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.decision, 'reauth');
  assert.equal(body.allowed, false);
  assert.equal(body.status, 'missing');
  await app.close();
});

test('internal authz: a granted service allows, an ungranted one denies', async () => {
  accounts.createAccount({ id: 'authz-friend', name: 'AuthzFriend', services: ['tts'] });
  const app = await buildApp();

  const allowed = await app.inject({
    method: 'GET',
    url: authzUrl({ account: 'authz-friend', service: 'tts' }),
    headers: { authorization: `Bearer ${BEARER}` },
  });
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.json().decision, 'allow');

  const denied = await app.inject({
    method: 'GET',
    url: authzUrl({ account: 'authz-friend', service: 'bookmark-manager' }),
    headers: { authorization: `Bearer ${BEARER}` },
  });
  assert.equal(denied.statusCode, 200);
  assert.equal(denied.json().decision, 'deny');
  assert.equal(denied.json().allowed, false);

  await app.close();
});

test('internal authz: a stale iat after a re-grant forces reauth', async () => {
  accounts.createAccount({ id: 'authz-stale', name: 'Stale', services: ['tts'] });
  // Revoke then re-grant: sessions issued before the re-grant must re-auth.
  accounts.setServiceAccess('authz-stale', 'tts', false);
  accounts.setServiceAccess('authz-stale', 'tts', true);
  const app = await buildApp();

  const oldIatSeconds = Math.floor((Date.now() - 60_000) / 1000);
  const res = await app.inject({
    method: 'GET',
    url: authzUrl({ account: 'authz-stale', service: 'tts', iat: String(oldIatSeconds) }),
    headers: { authorization: `Bearer ${BEARER}` },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().decision, 'reauth');
  await app.close();
});

test('internal authz: a revoked api token (jti) is rejected before the grant check', async () => {
  accounts.createAccount({ id: 'authz-tok', name: 'Tok', services: ['tts'] });
  const { id: jti } = await apiTokens.mintApiToken({
    accountId: 'authz-tok',
    name: 'Tok',
    service: 'tts',
    label: null,
    secret: BEARER,
  });
  apiTokens.revokeApiToken('authz-tok', jti);
  const app = await buildApp();

  const res = await app.inject({
    method: 'GET',
    url: authzUrl({ account: 'authz-tok', service: 'tts', jti }),
    headers: { authorization: `Bearer ${BEARER}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.decision, 'reauth');
  assert.equal(body.allowed, false);
  assert.equal(body.status, 'token_revoked');
  await app.close();
});

test('internal authz: an active api token (jti) passes through to the grant check', async () => {
  accounts.createAccount({ id: 'authz-tok2', name: 'Tok2', services: ['tts'] });
  const { id: jti } = await apiTokens.mintApiToken({
    accountId: 'authz-tok2',
    name: 'Tok2',
    service: 'tts',
    label: null,
    secret: BEARER,
  });
  const app = await buildApp();

  const res = await app.inject({
    method: 'GET',
    url: authzUrl({ account: 'authz-tok2', service: 'tts', jti }),
    headers: { authorization: `Bearer ${BEARER}` },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().decision, 'allow');
  await app.close();
});
