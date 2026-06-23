import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../index.js';
import { mintSsoSession } from '../lib/ssoSession.js';

// Minimal but structurally-valid stored document. isStorableDocument() in
// presentations.ts only requires version===1 and an array of scenes; the full
// semantic schema check lives on /presentation/validate, not on persistence.
function makeDocument(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    title: 'My Deck',
    scenes: [
      {
        id: 'opening',
        title: 'Opening',
        layout: 'viewport',
        elements: [],
      },
    ],
    ...overrides,
  };
}

// The platform's shared SSO secret in the test env (see setup.ts). Used both by
// mintSsoSession (sub: 'owner') and our own minting for a *different* owner.
const SSO_SECRET = 'test-sso-secret';

// mintSsoSession() hardcodes sub:'owner', so to exercise owner scoping we mint a
// second session for a distinct subject the same way it does internally. With
// ADMIN_AUTHZ_URL unset, authorizeService() returns 'allow' for any valid JWT.
async function mintSsoSessionFor(sub: string): Promise<string> {
  return new SignJWT({ sub, roles: ['owner'] })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(new TextEncoder().encode(SSO_SECRET));
}

let app: FastifyInstance;
let ownerCookie: string;

async function inject(args: {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  cookie?: string;
  payload?: unknown;
}) {
  return app.inject({
    method: args.method,
    url: args.url,
    headers: { cookie: `nz_session=${args.cookie ?? ownerCookie}` },
    payload: args.payload as object | undefined,
  });
}

beforeEach(async () => {
  app = await createApp();
  ownerCookie = await mintSsoSession(SSO_SECRET);
});

afterEach(async () => {
  await app.close();
});

describe('presentations CRUD routes', () => {
  it('requires authentication', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/presentations',
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthorized' });
  });

  it('creates a presentation (201) and returns id + title', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/presentations',
      payload: { document: makeDocument({ title: 'Launch Plan' }) },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(typeof body.id).toBe('string');
    expect(body.id).not.toHaveLength(0);
    expect(body.title).toBe('Launch Plan');
    expect(typeof body.updatedAt).toBe('number');
  });

  it('derives a fallback title when the document omits one', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/presentations',
      payload: { document: makeDocument({ title: undefined }) },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().title).toBe('Untitled presentation');
  });

  it('lists the owner presentations', async () => {
    const first = await inject({
      method: 'POST',
      url: '/api/presentations',
      payload: { document: makeDocument({ title: 'Alpha' }) },
    });
    const second = await inject({
      method: 'POST',
      url: '/api/presentations',
      payload: { document: makeDocument({ title: 'Beta' }) },
    });
    const firstId = first.json().id;
    const secondId = second.json().id;

    const res = await inject({ method: 'GET', url: '/api/presentations' });
    expect(res.statusCode).toBe(200);

    const ids = res.json().presentations.map((p: { id: string }) => p.id);
    expect(ids).toContain(firstId);
    expect(ids).toContain(secondId);

    const titles = res.json().presentations.map((p: { title: string }) => p.title);
    expect(titles).toContain('Alpha');
    expect(titles).toContain('Beta');
  });

  it('gets a stored presentation, returning the full document', async () => {
    const document = makeDocument({ title: 'Detailed' });
    const created = await inject({
      method: 'POST',
      url: '/api/presentations',
      payload: { document },
    });
    const id = created.json().id;

    const res = await inject({ method: 'GET', url: `/api/presentations/${id}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(id);
    expect(body.title).toBe('Detailed');
    expect(body.document).toEqual(document);
    expect(typeof body.updatedAt).toBe('number');
  });

  it('returns 404 when getting an unknown id', async () => {
    const res = await inject({
      method: 'GET',
      url: '/api/presentations/does-not-exist',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });

  it('updates a presentation and persists the change', async () => {
    const created = await inject({
      method: 'POST',
      url: '/api/presentations',
      payload: { document: makeDocument({ title: 'Before' }) },
    });
    const id = created.json().id;

    const updatedDoc = makeDocument({ title: 'After' });
    const res = await inject({
      method: 'PUT',
      url: `/api/presentations/${id}`,
      payload: { document: updatedDoc },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, title: 'After' });

    const fetched = await inject({ method: 'GET', url: `/api/presentations/${id}` });
    expect(fetched.json().title).toBe('After');
    expect(fetched.json().document).toEqual(updatedDoc);
  });

  it('returns 404 when updating an unknown id', async () => {
    const res = await inject({
      method: 'PUT',
      url: '/api/presentations/does-not-exist',
      payload: { document: makeDocument() },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });

  it('deletes a presentation, then 404s on a repeat delete', async () => {
    const created = await inject({
      method: 'POST',
      url: '/api/presentations',
      payload: { document: makeDocument() },
    });
    const id = created.json().id;

    const del = await inject({ method: 'DELETE', url: `/api/presentations/${id}` });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ ok: true });

    // Gone now: a second delete reports not_found.
    const again = await inject({ method: 'DELETE', url: `/api/presentations/${id}` });
    expect(again.statusCode).toBe(404);
    expect(again.json()).toEqual({ error: 'not_found' });

    // And it no longer resolves on GET.
    const fetched = await inject({ method: 'GET', url: `/api/presentations/${id}` });
    expect(fetched.statusCode).toBe(404);
  });

  it('returns 404 when deleting an unknown id', async () => {
    const res = await inject({
      method: 'DELETE',
      url: '/api/presentations/does-not-exist',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });

  describe('owner scoping', () => {
    it("hides another owner's presentation from list/get/update/delete", async () => {
      // Owner A creates a presentation.
      const created = await inject({
        method: 'POST',
        url: '/api/presentations',
        payload: { document: makeDocument({ title: 'Private to A' }) },
      });
      expect(created.statusCode).toBe(201);
      const id = created.json().id;

      // Owner B is a distinct SSO subject.
      const otherCookie = await mintSsoSessionFor(`other-${Date.now()}`);

      // B cannot see A's presentation in their list.
      const list = await inject({
        method: 'GET',
        url: '/api/presentations',
        cookie: otherCookie,
      });
      expect(list.statusCode).toBe(200);
      const ids = list.json().presentations.map((p: { id: string }) => p.id);
      expect(ids).not.toContain(id);

      // B cannot GET it.
      const get = await inject({
        method: 'GET',
        url: `/api/presentations/${id}`,
        cookie: otherCookie,
      });
      expect(get.statusCode).toBe(404);

      // B cannot UPDATE it.
      const put = await inject({
        method: 'PUT',
        url: `/api/presentations/${id}`,
        cookie: otherCookie,
        payload: { document: makeDocument({ title: 'Hijacked' }) },
      });
      expect(put.statusCode).toBe(404);

      // B cannot DELETE it.
      const del = await inject({
        method: 'DELETE',
        url: `/api/presentations/${id}`,
        cookie: otherCookie,
      });
      expect(del.statusCode).toBe(404);

      // A still sees it intact and untouched.
      const ownerGet = await inject({ method: 'GET', url: `/api/presentations/${id}` });
      expect(ownerGet.statusCode).toBe(200);
      expect(ownerGet.json().title).toBe('Private to A');
    });
  });

  describe('validation', () => {
    it('rejects a document missing version (400)', async () => {
      const { version: _omit, ...noVersion } = makeDocument();
      const res = await inject({
        method: 'POST',
        url: '/api/presentations',
        payload: { document: noVersion },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: 'invalid_document' });
    });

    it('rejects a document missing scenes (400)', async () => {
      const { scenes: _omit, ...noScenes } = makeDocument();
      const res = await inject({
        method: 'POST',
        url: '/api/presentations',
        payload: { document: noScenes },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: 'invalid_document' });
    });

    it('rejects a missing document body (400)', async () => {
      const res = await inject({
        method: 'POST',
        url: '/api/presentations',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: 'invalid_document' });
    });

    // A document between Fastify's old 1 MiB default and the route's 2 MB cap.
    // This would have been rejected by the framework before the bodyLimit fix;
    // now it reaches the handler and is accepted.
    function docOfTextSize(textLen: number) {
      return makeDocument({
        scenes: [
          {
            id: 'big',
            title: 'Big',
            layout: 'viewport',
            elements: [
              {
                id: 'blob',
                type: 'body',
                frame: { x: 0, y: 0, width: 10, height: 10 },
                props: { text: 'x'.repeat(textLen) },
              },
            ],
          },
        ],
      });
    }

    it('accepts a 1–2 MB document (above the old 1 MiB default, under the cap)', async () => {
      const res = await inject({
        method: 'POST',
        url: '/api/presentations',
        payload: { document: docOfTextSize(1_500_000) },
      });
      expect(res.statusCode).toBe(201);
    });

    it('rejects an over-2MB document with the handler 413 (document_too_large)', async () => {
      // With bodyLimit derived from MAX_DOC_BYTES (2 MB + envelope headroom),
      // this 2.1 MB document now reaches the handler, so its own MAX_DOC_BYTES
      // check fires and returns the specific { error: 'document_too_large' }
      // body — not the generic framework 413.
      const res = await inject({
        method: 'POST',
        url: '/api/presentations',
        payload: { document: docOfTextSize(2_100_000) },
      });
      expect(res.statusCode).toBe(413);
      expect(res.json()).toEqual({ error: 'document_too_large' });
    });

    it('rejects an invalid document on update too (400)', async () => {
      const created = await inject({
        method: 'POST',
        url: '/api/presentations',
        payload: { document: makeDocument() },
      });
      const id = created.json().id;

      const res = await inject({
        method: 'PUT',
        url: `/api/presentations/${id}`,
        payload: { document: { version: 2, scenes: 'nope' } },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: 'invalid_document' });
    });
  });
});
