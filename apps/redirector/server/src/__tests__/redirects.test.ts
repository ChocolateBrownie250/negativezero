import { describe, expect, it } from 'vitest';
import { createApp } from '../index.js';
import {
  generateSlug,
  isValidSlug,
  normalizeTarget,
  InvalidTargetError,
  SLUG_LENGTH,
} from '../lib/redirects.js';

// The protected management routes share the same session cookie the auth
// flow sets. The tests below exercise the unauthenticated surface (the
// public redirect + auth gating); slug/target logic is unit-tested directly.

describe('lib/redirects', () => {
  it('mints 16-char lowercase base36 slugs', () => {
    for (let i = 0; i < 50; i++) {
      const slug = generateSlug();
      expect(slug).toHaveLength(SLUG_LENGTH);
      expect(isValidSlug(slug)).toBe(true);
    }
  });

  it('rejects malformed slugs', () => {
    expect(isValidSlug('TOOSHORT')).toBe(false);
    expect(isValidSlug('uppercaseAAAAAAAA')).toBe(false);
    expect(isValidSlug('has-a-dash000000')).toBe(false);
    expect(isValidSlug('a'.repeat(17))).toBe(false);
  });

  it('normalizes bare hostnames to https', () => {
    expect(normalizeTarget('example.com')).toBe('https://example.com/');
    expect(normalizeTarget('  example.com/path  ')).toBe('https://example.com/path');
    expect(normalizeTarget('http://example.com')).toBe('http://example.com/');
    expect(normalizeTarget('example.com:8080/p')).toBe('https://example.com:8080/p');
  });

  it('accepts a bare host carrying userinfo (default https)', () => {
    expect(normalizeTarget('user:pass@example.com/path')).toBe(
      'https://user:pass@example.com/path',
    );
  });

  it('rejects non-http(s) and empty targets', () => {
    expect(() => normalizeTarget('javascript:alert(1)')).toThrow(InvalidTargetError);
    expect(() => normalizeTarget('ftp://example.com')).toThrow(InvalidTargetError);
    expect(() => normalizeTarget('data:text/html,<x>')).toThrow(InvalidTargetError);
    expect(() => normalizeTarget('')).toThrow(InvalidTargetError);
    expect(() => normalizeTarget('a'.repeat(2049))).toThrow(InvalidTargetError);
  });
});

describe('public redirect', () => {
  it('302s a known hash to its target and counts the hit', async () => {
    const { db } = await import('../db.js');
    const now = Date.now();
    const slug = generateSlug();
    db.prepare(
      `INSERT INTO redirects (id, slug, target, title, hits, created_at, updated_at, last_used_at)
       VALUES (?, ?, ?, NULL, 0, ?, ?, NULL)`,
    ).run('test-id', slug, 'https://example.com/dest', now, now);

    const app = await createApp();
    const res = await app.inject({ method: 'GET', url: '/' + slug });
    await app.close();

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('https://example.com/dest');

    const row = db.prepare('SELECT hits FROM redirects WHERE slug = ?').get(slug) as {
      hits: number;
    };
    expect(row.hits).toBe(1);
  });

  it('404s an unknown but well-formed hash without redirecting', async () => {
    const app = await createApp();
    const res = await app.inject({ method: 'GET', url: '/' + 'a'.repeat(16) });
    await app.close();
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('does not let a non-hash path match the redirect route', async () => {
    const app = await createApp();
    const res = await app.inject({ method: 'GET', url: '/not-a-hash' });
    await app.close();
    // Whether it lands on the SPA fallback (client build present) or the
    // api-only JSON 404, it must never be a redirect — the /:slug route is
    // regex-constrained to the exact 16-char hash shape.
    expect(res.statusCode).not.toBe(302);
    expect(res.headers.location).toBeUndefined();
  });
});

describe('management api auth', () => {
  it('rejects unauthenticated list', async () => {
    const app = await createApp();
    const res = await app.inject({ method: 'GET', url: '/api/redirects' });
    await app.close();
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthorized' });
  });

  it('rejects unauthenticated create', async () => {
    const app = await createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/redirects',
      payload: { target: 'https://example.com' },
    });
    await app.close();
    expect(res.statusCode).toBe(401);
  });
});
