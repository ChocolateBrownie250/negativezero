// Coverage for the per-item preset endpoints: GET /api/presets/:id and
// PATCH /api/presets/:id (update name / selection / home-zone).
//
// IMPORTANT FINDING (documented in the PR body): as of this commit, NEITHER
// `GET /api/presets/:id` NOR `PATCH /api/presets/:id` is implemented in
// `src/routes/presets.ts`. Only GET /presets (list), POST /presets (create),
// and DELETE /presets/:id exist. Requests to the missing routes therefore fall
// straight through to the static `notFoundHandler` in `index.ts` and return a
// generic `404 { error: 'not_found' }` — *before* the auth gate, so even an
// anonymous (cookie-less) GET-by-id returns 404 rather than 401.
//
// Per the hardening-pass rules we MUST NOT touch production `src` to add the
// missing handlers. So this file does two things:
//   1. ACTIVE tests that pin the current (missing-route) contract, so the suite
//      stays green and any future accidental change to this surface is caught.
//   2. SKIPPED tests (`it.skip`) that encode the *intended* contract for these
//      endpoints. They are ready to be un-skipped the moment the routes land,
//      and they double as an executable spec for the bug write-up.
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

// ---------------------------------------------------------------------------
// Current contract: the per-item GET/PATCH routes are NOT registered, so every
// shape of request 404s via the catch-all not-found handler. These pin today's
// behaviour and stay green; flip them to the spec below once the routes exist.
// ---------------------------------------------------------------------------
describe('GET /api/presets/:id — current (unimplemented) contract', () => {
  it("404s the owner's own preset (route is not registered)", async () => {
    const app = await createApp();
    const owner = await cookieFor('owner-get');
    const id = await seedPreset(app, owner);

    const res = await app.inject({
      method: 'GET',
      url: `/api/presets/${id}`,
      headers: { cookie: owner },
    });
    await app.close();

    // BUG: should be 200 with the preset; route is missing → generic 404.
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });

  it('404s an unknown id', async () => {
    const app = await createApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/presets/does-not-exist',
      headers: { cookie: await cookieFor('owner-get') },
    });
    await app.close();
    expect(res.statusCode).toBe(404);
  });

  it('404s (not 401) without a cookie — the missing route bypasses the auth gate', async () => {
    const app = await createApp();
    const owner = await cookieFor('owner-get-anon');
    const id = await seedPreset(app, owner);

    const res = await app.inject({ method: 'GET', url: `/api/presets/${id}` });
    await app.close();

    // BUG: a registered, auth-gated route would 401 here. Because the route is
    // missing the request never reaches `requireAuth` and 404s instead. This is
    // the auth-bypass-on-missing-route footgun called out in the PR body.
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /api/presets/:id — current (unimplemented) contract', () => {
  it("404s a valid update to the owner's preset (route is not registered)", async () => {
    const app = await createApp();
    const owner = await cookieFor('owner-patch');
    const id = await seedPreset(app, owner);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/presets/${id}`,
      headers: { cookie: owner },
      payload: { name: 'Renamed', selection: SELECTION },
    });
    await app.close();

    // BUG: should be 200 with the updated preset; route is missing → 404.
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });

  it('404s an unknown id', async () => {
    const app = await createApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/presets/does-not-exist',
      headers: { cookie: await cookieFor('owner-patch') },
      payload: { name: 'Renamed' },
    });
    await app.close();
    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Intended contract (executable spec). SKIPPED until the routes are implemented
// in src/routes/presets.ts. Mirrors the validation rules already enforced by
// the create route (parseSelection / cleanName) and the account-scoping the
// delete route enforces (a foreign id is indistinguishable from a missing one
// → 404). Un-skip this block when the handlers land; no harness changes needed.
// ---------------------------------------------------------------------------
describe.skip('GET /api/presets/:id — intended contract', () => {
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

describe.skip('PATCH /api/presets/:id — intended contract', () => {
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
    // updated_at should advance past created_at.
    expect(res.json().preset.updatedAt).toBeGreaterThanOrEqual(res.json().preset.createdAt);
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
