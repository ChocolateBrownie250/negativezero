import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../index.js';
import { isValidSlug, SLUG_LENGTH } from '../lib/redirects.js';

// The authenticated management CRUD (GET/POST/PATCH/DELETE /api/redirects) is
// gated by requireAuth, which lets a request through when the per-service
// @fastify/secure-session carries `userId === 'owner'` — exactly what the
// passkey login flow sets (routes/auth.ts). We reproduce that here by minting
// an owner session cookie with the plugin's own encode helper (the same code
// path the app uses to write the cookie), so these tests exercise the real
// auth surface rather than bypassing it.
//
// There is a single "owner"; redirects are not partitioned by a user column,
// so "owner-scoped" here means "only reachable once authenticated" — the 401
// gating is covered in redirects.test.ts; below we drive the CRUD itself.

// `@fastify/secure-session` decorates the instance with create/encode helpers.
type SessionApp = FastifyInstance & {
  createSecureSession: (data: Record<string, unknown>) => unknown;
  encodeSecureSession: (session: unknown) => string;
};

// Encode the `session` cookie value an authenticated owner would carry. We pass
// this via inject's `cookies` object (not a raw header) because the encrypted
// value contains a ';' separator that a single Cookie header would truncate.
function ownerSessionCookie(app: FastifyInstance): string {
  const sapp = app as SessionApp;
  const session = sapp.createSecureSession({ userId: 'owner' });
  return sapp.encodeSecureSession(session);
}

describe('management api (authenticated owner)', () => {
  let app: FastifyInstance;
  let cookies: { session: string };
  // Track ids created through the API so each test cleans up after itself —
  // the sqlite db is a process-wide singleton shared with the other suites.
  const created: string[] = [];

  beforeEach(async () => {
    app = await createApp();
    cookies = { session: ownerSessionCookie(app) };
  });

  afterEach(async () => {
    const { db } = await import('../db.js');
    for (const id of created.splice(0)) {
      db.prepare('DELETE FROM redirects WHERE id = ?').run(id);
    }
    await app.close();
  });

  async function create(payload: Record<string, unknown>) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/redirects',
      cookies,
      payload,
    });
    if (res.statusCode === 201) created.push(res.json().redirect.id);
    return res;
  }

  describe('POST /api/redirects', () => {
    it('creates a redirect, minting a fresh slug and normalizing the target', async () => {
      const res = await create({ target: 'example.com/landing', title: '  Launch  ' });

      expect(res.statusCode).toBe(201);
      const { redirect } = res.json();
      expect(redirect.id).toBeTruthy();
      expect(redirect.slug).toHaveLength(SLUG_LENGTH);
      expect(isValidSlug(redirect.slug)).toBe(true);
      // Bare host → https with a trailing path; title is trimmed.
      expect(redirect.target).toBe('https://example.com/landing');
      expect(redirect.title).toBe('Launch');
      expect(redirect.hits).toBe(0);
      expect(redirect.lastUsedAt).toBeNull();
      expect(typeof redirect.createdAt).toBe('number');
    });

    it('defaults title to null when omitted or blank', async () => {
      const res = await create({ target: 'https://example.org', title: '   ' });
      expect(res.statusCode).toBe(201);
      expect(res.json().redirect.title).toBeNull();
    });

    it('mints distinct slugs for successive creates', async () => {
      const a = await create({ target: 'https://a.example.com' });
      const b = await create({ target: 'https://b.example.com' });
      expect(a.statusCode).toBe(201);
      expect(b.statusCode).toBe(201);
      expect(a.json().redirect.slug).not.toBe(b.json().redirect.slug);
    });

    it('400s when target is missing', async () => {
      const res = await create({ title: 'no target' });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: 'validation', field: 'target' });
    });

    it('400s on a non-http(s) target', async () => {
      const res = await create({ target: 'javascript:alert(1)' });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: 'invalid_target' });
    });
  });

  describe('GET /api/redirects', () => {
    it('lists created redirects, newest first, in API shape', async () => {
      const first = (await create({ target: 'https://first.example.com' })).json()
        .redirect;
      // created_at has ms granularity; ensure a strictly later timestamp so the
      // DESC ordering is deterministic.
      await new Promise((r) => setTimeout(r, 2));
      const second = (await create({ target: 'https://second.example.com' })).json()
        .redirect;

      const res = await app.inject({
        method: 'GET',
        url: '/api/redirects',
        cookies,
      });
      expect(res.statusCode).toBe(200);
      const { redirects } = res.json();
      expect(Array.isArray(redirects)).toBe(true);

      const ours = redirects.filter((r: { id: string }) =>
        [first.id, second.id].includes(r.id),
      );
      expect(ours.map((r: { id: string }) => r.id)).toEqual([second.id, first.id]);

      // API shape: camelCase keys, no raw snake_case leaking through.
      const sample = ours[0];
      expect(Object.keys(sample).sort()).toEqual(
        ['createdAt', 'hits', 'id', 'lastUsedAt', 'slug', 'target', 'title', 'updatedAt'].sort(),
      );
    });
  });

  describe('PATCH /api/redirects/:id', () => {
    it('updates the target (normalized) and bumps updated_at', async () => {
      const orig = (await create({ target: 'https://old.example.com', title: 'Old' }))
        .json().redirect;

      await new Promise((r) => setTimeout(r, 2));
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/redirects/${orig.id}`,
        cookies,
        payload: { target: 'new.example.com/path' },
      });

      expect(res.statusCode).toBe(200);
      const { redirect } = res.json();
      expect(redirect.target).toBe('https://new.example.com/path');
      // Slug is the permalink and must never change; title untouched.
      expect(redirect.slug).toBe(orig.slug);
      expect(redirect.title).toBe('Old');
      expect(redirect.updatedAt).toBeGreaterThan(orig.updatedAt);
    });

    it('updates the label and can clear it with a blank string', async () => {
      const orig = (await create({ target: 'https://label.example.com', title: 'Before' }))
        .json().redirect;

      const set = await app.inject({
        method: 'PATCH',
        url: `/api/redirects/${orig.id}`,
        cookies,
        payload: { title: '  After  ' },
      });
      expect(set.statusCode).toBe(200);
      expect(set.json().redirect.title).toBe('After');

      const clear = await app.inject({
        method: 'PATCH',
        url: `/api/redirects/${orig.id}`,
        cookies,
        payload: { title: '   ' },
      });
      expect(clear.statusCode).toBe(200);
      expect(clear.json().redirect.title).toBeNull();
    });

    it('400s on an invalid target without mutating the row', async () => {
      const orig = (await create({ target: 'https://keep.example.com' })).json().redirect;
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/redirects/${orig.id}`,
        cookies,
        payload: { target: 'ftp://nope.example.com' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: 'invalid_target' });

      const { db } = await import('../db.js');
      const row = db
        .prepare('SELECT target FROM redirects WHERE id = ?')
        .get(orig.id) as { target: string };
      expect(row.target).toBe('https://keep.example.com/');
    });

    it('404s on an unknown id', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/redirects/does-not-exist',
        cookies,
        payload: { target: 'https://example.com' },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'not_found' });
    });
  });

  describe('DELETE /api/redirects/:id', () => {
    it('deletes an existing redirect', async () => {
      const res201 = await create({ target: 'https://delete-me.example.com' });
      const { id } = res201.json().redirect;

      const del = await app.inject({
        method: 'DELETE',
        url: `/api/redirects/${id}`,
        cookies,
      });
      expect(del.statusCode).toBe(200);
      expect(del.json()).toEqual({ ok: true });

      const { db } = await import('../db.js');
      const row = db.prepare('SELECT 1 FROM redirects WHERE id = ?').get(id);
      expect(row).toBeUndefined();
      // Already gone; drop it from the cleanup list.
      created.splice(created.indexOf(id), 1);

      // A second delete of the now-missing id is a 404.
      const again = await app.inject({
        method: 'DELETE',
        url: `/api/redirects/${id}`,
        cookies,
      });
      expect(again.statusCode).toBe(404);
      expect(again.json()).toEqual({ error: 'not_found' });
    });

    it('404s on an unknown / foreign id', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/redirects/nonexistent-id',
        cookies,
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'not_found' });
    });
  });

  it('a minted owner cookie unlocks the gate the 401 tests hit', async () => {
    // Sanity check that the auth mechanism is genuine: same route, with vs
    // without the cookie, flips 401 → 200.
    const unauth = await app.inject({ method: 'GET', url: '/api/redirects' });
    expect(unauth.statusCode).toBe(401);

    const auth = await app.inject({
      method: 'GET',
      url: '/api/redirects',
      cookies,
    });
    expect(auth.statusCode).toBe(200);
  });
});
