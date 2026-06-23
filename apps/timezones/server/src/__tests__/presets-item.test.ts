// Coverage for the per-item preset endpoints: GET /api/presets/:id and
// PATCH /api/presets/:id (update name / selection / home-zone).
//
// These routes were added in feat/timezones-preset-item-routes. They are
// registered inside the requireAuth scope in index.ts, so (unlike the earlier
// missing-route state) a cookie-less request now correctly 401s instead of
// falling through to the SPA catch-all 404. Validation mirrors the create
// route (parseSelection / cleanName); account-scoping matches delete (a foreign
// id is indistinguishable from a missing one → 404, no existence oracle).
//
// Harness is copied verbatim from presets.test.ts: vitest `forks` pool, the
// temp-sqlite + SSO-secret env wired up by setup.ts, and a jose-signed
// nz_session cookie minted below.
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

// Create a preset for `owner` and return its id (uses the implemented POST).
async function seedPreset(
  app: Awaited<ReturnType<typeof createApp>>,
  cookie: string,
  name = 'Standup',
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/presets',
    headers: { cookie },
    payload: { name, selection: SELECTION },
  });
  expect(res.statusCode).toBe(201);
  return res.json().preset.id as string;
}

describe('GET /api/presets/:id', () => {
  it("returns the owner's preset", async () => {
    const app = await createApp();
    const owner = await cookieFor('alice');
    const id = await seedPreset(app, owner);

    const res = await app.inject({
      method: 'GET',
      url: `/api/presets/${id}`,
      headers: { cookie: owner },
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json().preset.id).toBe(id);
    expect(res.json().preset.name).toBe('Standup');
    expect(res.json().preset.selection).toEqual(SELECTION);
  });

  it('401s without a cookie — the route is auth-gated (no bypass)', async () => {
    const app = await createApp();
    // No seed needed: requireAuth runs onRequest for the whole /api scope, so an
    // anonymous request never reaches the handler regardless of whether the id
    // exists. This pins the fix for the earlier missing-route auth bypass.
    const res = await app.inject({ method: 'GET', url: '/api/presets/whatever' });
    await app.close();

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthorized' });
  });

  it('404s an unknown id', async () => {
    const app = await createApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/presets/00000000-0000-0000-0000-000000000000',
      headers: { cookie: await cookieFor('alice') },
    });
    await app.close();
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });

  it("404s another owner's id (account scoping, not 403/leak)", async () => {
    const app = await createApp();
    const alice = await cookieFor('alice');
    const bob = await cookieFor('bob');
    const id = await seedPreset(app, alice);

    const res = await app.inject({
      method: 'GET',
      url: `/api/presets/${id}`,
      headers: { cookie: bob },
    });
    await app.close();
    // A foreign id must be indistinguishable from a missing one — no existence
    // oracle, same as the delete route.
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /api/presets/:id', () => {
  it('updates name, selection, and home zone', async () => {
    const app = await createApp();
    const owner = await cookieFor('alice');
    const id = await seedPreset(app, owner);

    const next = {
      zones: ['America/New_York', 'Europe/London', 'Asia/Tokyo'],
      home: 'Asia/Tokyo',
      work: [10, 19],
      fmt24: false,
    };
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/presets/${id}`,
      headers: { cookie: owner },
      payload: { name: '  Renamed  ', selection: next },
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json().preset.name).toBe('Renamed'); // trimmed, like create
    expect(res.json().preset.selection).toEqual(next);
    // updated_at should advance past (or equal) created_at.
    expect(res.json().preset.updatedAt).toBeGreaterThanOrEqual(res.json().preset.createdAt);
  });

  it('updates name only, leaving the selection unchanged', async () => {
    const app = await createApp();
    const owner = await cookieFor('alice');
    const id = await seedPreset(app, owner);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/presets/${id}`,
      headers: { cookie: owner },
      payload: { name: 'Just the name' },
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json().preset.name).toBe('Just the name');
    expect(res.json().preset.selection).toEqual(SELECTION); // untouched
  });

  it('rejects an empty zones list (400)', async () => {
    const app = await createApp();
    const owner = await cookieFor('alice');
    const id = await seedPreset(app, owner);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/presets/${id}`,
      headers: { cookie: owner },
      payload: { selection: { zones: [], home: 'X', work: [9, 18], fmt24: true } },
    });
    await app.close();
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe('zones');
  });

  it('rejects a home zone not in the selection (400)', async () => {
    const app = await createApp();
    const owner = await cookieFor('alice');
    const id = await seedPreset(app, owner);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/presets/${id}`,
      headers: { cookie: owner },
      payload: {
        selection: {
          zones: ['Europe/London'],
          home: 'America/New_York',
          work: [9, 18],
          fmt24: true,
        },
      },
    });
    await app.close();
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe('home');
  });

  it('404s an unknown id', async () => {
    const app = await createApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/presets/00000000-0000-0000-0000-000000000000',
      headers: { cookie: await cookieFor('alice') },
      payload: { name: 'Renamed', selection: SELECTION },
    });
    await app.close();
    expect(res.statusCode).toBe(404);
  });

  it("404s another owner's id (account scoping)", async () => {
    const app = await createApp();
    const alice = await cookieFor('alice');
    const bob = await cookieFor('bob');
    const id = await seedPreset(app, alice);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/presets/${id}`,
      headers: { cookie: bob },
      payload: { name: 'Hijacked', selection: SELECTION },
    });
    await app.close();
    expect(res.statusCode).toBe(404);
  });
});
