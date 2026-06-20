import { describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { createApp } from '../index.js';

const SECRET = 'test-sso-secret-aaaaaaaaaaaaaaaaaaaa';

async function cookieFor(sub: string): Promise<string> {
  const jwt = await new SignJWT({ sub })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(SECRET));
  return `nz_session=${jwt}`;
}

const SELECTION = {
  zones: ['America/New_York', 'Europe/London'],
  home: 'America/New_York',
  work: [9, 18],
  fmt24: true,
};

describe('health', () => {
  it('is public', async () => {
    const app = await createApp();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    await app.close();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});

describe('auth gate', () => {
  it('401s /api/v1/me without a cookie', async () => {
    const app = await createApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/me' });
    await app.close();
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthorized' });
  });

  it('200s /api/v1/me with a valid SSO cookie', async () => {
    const app = await createApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie: await cookieFor('owner') },
    });
    await app.close();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('401s presets without a cookie', async () => {
    const app = await createApp();
    const res = await app.inject({ method: 'GET', url: '/api/presets' });
    await app.close();
    expect(res.statusCode).toBe(401);
  });
});

describe('presets CRUD + account scoping', () => {
  it('creates, lists, and scopes presets per account', async () => {
    const app = await createApp();
    const alice = await cookieFor('alice');
    const bob = await cookieFor('bob');

    const created = await app.inject({
      method: 'POST',
      url: '/api/presets',
      headers: { cookie: alice },
      payload: { name: '  Standup  ', selection: SELECTION },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().preset.name).toBe('Standup'); // trimmed
    expect(created.json().preset.selection).toEqual(SELECTION);
    const id = created.json().preset.id as string;

    const aliceList = await app.inject({
      method: 'GET',
      url: '/api/presets',
      headers: { cookie: alice },
    });
    expect(aliceList.json().presets).toHaveLength(1);

    // Bob must not see Alice's preset...
    const bobList = await app.inject({
      method: 'GET',
      url: '/api/presets',
      headers: { cookie: bob },
    });
    expect(bobList.json().presets).toHaveLength(0);

    // ...nor delete it (foreign id 404s).
    const bobDel = await app.inject({
      method: 'DELETE',
      url: `/api/presets/${id}`,
      headers: { cookie: bob },
    });
    expect(bobDel.statusCode).toBe(404);

    // Alice deletes her own.
    const aliceDel = await app.inject({
      method: 'DELETE',
      url: `/api/presets/${id}`,
      headers: { cookie: alice },
    });
    expect(aliceDel.statusCode).toBe(200);
    expect(aliceDel.json()).toEqual({ ok: true });

    await app.close();
  });

  it('rejects an invalid selection (empty zones)', async () => {
    const app = await createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/presets',
      headers: { cookie: await cookieFor('alice') },
      payload: { name: 'Bad', selection: { zones: [], home: 'X', work: [9, 18], fmt24: true } },
    });
    await app.close();
    expect(res.statusCode).toBe(400);
  });

  it('rejects a home zone not in the list', async () => {
    const app = await createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/presets',
      headers: { cookie: await cookieFor('alice') },
      payload: {
        name: 'Bad home',
        selection: { zones: ['Europe/London'], home: 'America/New_York', work: [9, 18], fmt24: true },
      },
    });
    await app.close();
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe('home');
  });
});
