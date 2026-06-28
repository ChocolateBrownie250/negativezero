import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import secureSession from '@fastify/secure-session';

// Config + db read env at import time, so set everything before importing them.
process.env.SESSION_SECRET = '0'.repeat(64);
process.env.SETUP_CODE_HASH = 'unused-in-these-tests';
process.env.SSO_SESSION_SECRET = 'test-sso-secret';
process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'admin-codes-test-'));

const SSO_SECRET = 'test-sso-secret';

const accounts = await import('../lib/accounts.js');
const sso = await import('../lib/ssoSession.js');
const { config } = await import('../config.js');
const { requireAuth } = await import('../middleware/auth.js');
const { default: codeRoutes } = await import('./codes.js');
const { default: accountRoutes } = await import('./accounts.js');

// Build an app that mirrors index.ts: secure-session + cookie, with the code +
// account routes mounted behind the requireAuth onRequest hook under /api.
// This is the real auth-gating wiring, so the 401/403 behaviour matches prod.
async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(fastifyCookie);
  await app.register(secureSession, {
    key: config.sessionSecret,
    cookieName: 'session',
    cookie: { path: '/', httpOnly: true, secure: false, sameSite: 'lax' },
  });
  await app.register(
    async (instance) => {
      instance.addHook('onRequest', requireAuth);
      instance.register(codeRoutes);
      instance.register(accountRoutes);
    },
    { prefix: '/api' },
  );
  await app.ready();
  return app;
}

// Mint a real apex SSO cookie for `accountId`. resolveAccount() verifies it and
// adopts it into the session, so this exercises the genuine auth path.
async function ssoCookie(accountId: string, name = accountId): Promise<string> {
  const token = await sso.mintSsoSession(SSO_SECRET, { sub: accountId, name });
  return `nz_session=${encodeURIComponent(token)}`;
}

test('GET /api/codes/services is 401 without a session', async () => {
  const app = await buildApp();
  const res = await app.inject({ method: 'GET', url: '/api/codes/services' });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error, 'unauthorized');
  await app.close();
});

test('GET /api/codes/services returns the gated services for the owner', async () => {
  accounts.ensureOwnerAccount();
  const app = await buildApp();
  const res = await app.inject({
    method: 'GET',
    url: '/api/codes/services',
    headers: { cookie: await ssoCookie(accounts.OWNER_ACCOUNT_ID, 'Owner') },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().services, [...accounts.GATED_SERVICES]);
  await app.close();
});

test('a non-admin friend account is forbidden (403) on a protected route', async () => {
  // A friend with a non-admin grant authenticates fine but is not an admin.
  accounts.createAccount({ id: 'codes-friend', name: 'Friend', services: ['tts'] });
  const app = await buildApp();
  const res = await app.inject({
    method: 'GET',
    url: '/api/codes/services',
    headers: { cookie: await ssoCookie('codes-friend', 'Friend') },
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().error, 'forbidden');
  await app.close();
});

test('an account granted admin reaches the protected route', async () => {
  accounts.createAccount({ id: 'codes-admin', name: 'AdminFriend', services: ['admin'] });
  const app = await buildApp();
  const res = await app.inject({
    method: 'GET',
    url: '/api/codes/services',
    headers: { cookie: await ssoCookie('codes-admin', 'AdminFriend') },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().services, [...accounts.GATED_SERVICES]);
  await app.close();
});

test('a disabled account is rejected (session_revoked) on a protected route', async () => {
  accounts.createAccount({ id: 'codes-disabled', name: 'Disabled', services: ['admin'] });
  accounts.setAccountStatus('codes-disabled', 'disabled');
  const app = await buildApp();
  const res = await app.inject({
    method: 'GET',
    url: '/api/codes/services',
    headers: { cookie: await ssoCookie('codes-disabled', 'Disabled') },
  });
  // disabled → authorize() returns 'reauth' → 401 session_revoked.
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error, 'session_revoked');
  await app.close();
});

test('an invalid/forged SSO cookie is treated as unauthenticated (401)', async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: 'GET',
    url: '/api/codes/services',
    headers: { cookie: 'nz_session=not-a-real-jwt' },
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error, 'unauthorized');
  await app.close();
});

test('POST /api/codes/generate rejects an empty/invalid service list (400)', async () => {
  accounts.ensureOwnerAccount();
  const app = await buildApp();
  const res = await app.inject({
    method: 'POST',
    url: '/api/codes/generate',
    headers: { cookie: await ssoCookie(accounts.OWNER_ACCOUNT_ID, 'Owner') },
    payload: { services: ['not-a-real-service'] },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, 'validation');
  await app.close();
});

test('POST /api/codes/generate mints a code for a valid service', async () => {
  accounts.ensureOwnerAccount();
  const app = await buildApp();
  const res = await app.inject({
    method: 'POST',
    url: '/api/codes/generate',
    headers: { cookie: await ssoCookie(accounts.OWNER_ACCOUNT_ID, 'Owner') },
    payload: { services: ['tts'], name: 'Test Friend' },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.deepEqual(body.services, ['tts']);
  assert.equal(body.name, 'Test Friend');
  assert.match(body.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await app.close();
});

test('GET /api/accounts lists accounts for an authorized admin', async () => {
  accounts.ensureOwnerAccount();
  const app = await buildApp();
  const res = await app.inject({
    method: 'GET',
    url: '/api/accounts',
    headers: { cookie: await ssoCookie(accounts.OWNER_ACCOUNT_ID, 'Owner') },
  });
  assert.equal(res.statusCode, 200);
  const owner = res.json().accounts.find((a: { id: string }) => a.id === accounts.OWNER_ACCOUNT_ID);
  assert.ok(owner, 'owner is listed');
  assert.equal(owner.isOwner, true);
  await app.close();
});

test('POST /api/accounts/:id/status refuses to mutate the owner (409)', async () => {
  accounts.ensureOwnerAccount();
  const app = await buildApp();
  const res = await app.inject({
    method: 'POST',
    url: `/api/accounts/${accounts.OWNER_ACCOUNT_ID}/status`,
    headers: { cookie: await ssoCookie(accounts.OWNER_ACCOUNT_ID, 'Owner') },
    payload: { status: 'disabled' },
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.json().error, 'owner_immutable');
  await app.close();
});
