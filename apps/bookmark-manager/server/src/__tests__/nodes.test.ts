import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// fetchMetadata is mocked because the route's SSRF guard does a real DNS
// lookup before the fetch and rejects unresolvable hosts with a 400 — and
// we don't want tests hitting the live internet. The mock returns the URL
// as-is, with no title/favicon, so the route exercises the same code paths
// it does when fetchMetadata fails on a real deploy.
vi.mock('../lib/fetcher.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/fetcher.js')>();
  return {
    ...actual,
    fetchMetadata: vi.fn(async (url: string) => ({
      title: null,
      faviconUrl: null,
      finalUrl: url,
    })),
  };
});

const { default: nodeRoutes } = await import('../routes/nodes.js');
const { db } = await import('../db.js');
const { decryptString } = await import('../lib/crypto.js');

let app: FastifyInstance;

beforeAll(async () => {
  // Bypasses requireAuth on purpose — these tests exercise route logic, not auth.
  app = Fastify();
  await app.register(nodeRoutes, { prefix: '/api' });
  await app.ready();
});

beforeEach(() => {
  db.prepare('DELETE FROM nodes WHERE id != ?').run('root');
});

async function createFolder(name: string, parentId = 'root') {
  const res = await app.inject({
    method: 'POST',
    url: '/api/nodes',
    payload: { type: 'folder', name, parentId },
  });
  expect(res.statusCode).toBe(201);
  return res.json().node as { id: string; name: string; parentId: string };
}

async function createBookmark(name: string, url: string, parentId = 'root') {
  const res = await app.inject({
    method: 'POST',
    url: '/api/nodes',
    payload: { type: 'bookmark', name, url, parentId },
  });
  expect(res.statusCode).toBe(201);
  return res.json().node as {
    id: string;
    name: string;
    url: string;
    parentId: string;
  };
}

function rawRowFromDb(id: string): { name: string; url: string | null } {
  return db.prepare('SELECT name, url FROM nodes WHERE id = ?').get(id) as {
    name: string;
    url: string | null;
  };
}

describe('PATCH /nodes/:id — regression suite for double-encryption', () => {
  it('move-only PATCH (parentId change) preserves name and url', async () => {
    const folder = await createFolder('Target');
    const bm = await createBookmark('My Site', 'https://nonexistent-test-host.example');

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/nodes/${bm.id}`,
      payload: { parentId: folder.id },
    });
    expect(patchRes.statusCode).toBe(200);
    const after = patchRes.json().node;
    expect(after.name).toBe('My Site');
    expect(after.url).toBe('https://nonexistent-test-host.example');
    expect(after.parentId).toBe(folder.id);
  });

  it('position-only PATCH preserves name and url', async () => {
    const bm = await createBookmark('Foo', 'https://nonexistent-test-host.example');
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/nodes/${bm.id}`,
      payload: { position: 5 },
    });
    expect(res.statusCode).toBe(200);
    const node = res.json().node;
    expect(node.name).toBe('Foo');
    expect(node.url).toBe('https://nonexistent-test-host.example');
  });

  it('rename-only PATCH updates name and preserves url', async () => {
    const bm = await createBookmark('Old', 'https://nonexistent-test-host.example');
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/nodes/${bm.id}`,
      payload: { name: 'New' },
    });
    expect(res.statusCode).toBe(200);
    const node = res.json().node;
    expect(node.name).toBe('New');
    expect(node.url).toBe('https://nonexistent-test-host.example');
  });

  it('url-only PATCH updates url and preserves name', async () => {
    const bm = await createBookmark('Keep', 'https://nonexistent-test-host.example');
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/nodes/${bm.id}`,
      payload: { url: 'https://another-test-host.example' },
    });
    expect(res.statusCode).toBe(200);
    const node = res.json().node;
    expect(node.name).toBe('Keep');
    expect(node.url).toBe('https://another-test-host.example');
  });

  it('subsequent GET /nodes returns plaintext after a move', async () => {
    const folder = await createFolder('Dest');
    const bm = await createBookmark('Mover', 'https://nonexistent-test-host.example');

    await app.inject({
      method: 'PATCH',
      url: `/api/nodes/${bm.id}`,
      payload: { parentId: folder.id },
    });

    const res = await app.inject({ method: 'GET', url: '/api/nodes' });
    expect(res.statusCode).toBe(200);
    const list = res.json().nodes as Array<{
      id: string;
      name: string;
      url?: string;
    }>;
    const fetched = list.find((n) => n.id === bm.id)!;
    expect(fetched.name).toBe('Mover');
    expect(fetched.name.startsWith('enc1:')).toBe(false);
    expect(fetched.url).toBe('https://nonexistent-test-host.example');
  });

  it('DB row is single-wrapped (one decryptString yields plaintext, not another enc1:)', async () => {
    const bm = await createBookmark('Inspect', 'https://nonexistent-test-host.example');

    // Move + reorder a few times — each PATCH triggered the bug previously.
    await app.inject({
      method: 'PATCH',
      url: `/api/nodes/${bm.id}`,
      payload: { position: 99 },
    });
    await app.inject({
      method: 'PATCH',
      url: `/api/nodes/${bm.id}`,
      payload: { position: 0 },
    });

    const row = rawRowFromDb(bm.id);
    expect(row.name.startsWith('enc1:')).toBe(true);
    expect(row.url?.startsWith('enc1:')).toBe(true);

    const nameDec = decryptString(row.name);
    const urlDec = decryptString(row.url!);
    expect(nameDec).toBe('Inspect');
    expect(urlDec).toBe('https://nonexistent-test-host.example');
    expect(nameDec.startsWith('enc1:')).toBe(false);
    expect(urlDec.startsWith('enc1:')).toBe(false);
  });
});
