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

function rawRowFromDb(id: string): {
  name: string;
  url: string | null;
  icon: string | null;
} {
  return db
    .prepare('SELECT name, url, icon FROM nodes WHERE id = ?')
    .get(id) as { name: string; url: string | null; icon: string | null };
}

function countNodes(): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM nodes').get() as { c: number }).c;
}

describe('POST /nodes — create', () => {
  it('creates a folder; returns plaintext name and 201 envelope', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/nodes',
      payload: { type: 'folder', name: 'Reading', parentId: 'root' },
    });
    expect(res.statusCode).toBe(201);
    const node = res.json().node;
    expect(node.type).toBe('folder');
    expect(node.name).toBe('Reading');
    expect(node.parentId).toBe('root');
    expect(typeof node.id).toBe('string');
    expect(node.position).toBe(0);

    // Stored encrypted at rest, returned plaintext to the API.
    const raw = rawRowFromDb(node.id);
    expect(raw.name.startsWith('enc1:')).toBe(true);
    expect(decryptString(raw.name)).toBe('Reading');
  });

  it('defaults parentId to root when omitted', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/nodes',
      payload: { type: 'folder', name: 'NoParent' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().node.parentId).toBe('root');
  });

  it('creates a bookmark with a url; both name and url stored encrypted, returned plaintext', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/nodes',
      payload: {
        type: 'bookmark',
        name: 'My Site',
        url: 'https://nonexistent-test-host.example',
        parentId: 'root',
      },
    });
    expect(res.statusCode).toBe(201);
    const node = res.json().node;
    expect(node.type).toBe('bookmark');
    expect(node.name).toBe('My Site');
    expect(node.url).toBe('https://nonexistent-test-host.example');

    const raw = rawRowFromDb(node.id);
    expect(raw.name.startsWith('enc1:')).toBe(true);
    expect(raw.url?.startsWith('enc1:')).toBe(true);
    expect(decryptString(raw.name)).toBe('My Site');
    expect(decryptString(raw.url!)).toBe('https://nonexistent-test-host.example');
  });

  it('falls back to host as the name when bookmark name is omitted', async () => {
    // fetchMetadata mock returns title: null, so finalName falls through to hostOf(finalUrl).
    const res = await app.inject({
      method: 'POST',
      url: '/api/nodes',
      payload: { type: 'bookmark', url: 'https://example.test/path' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().node.name).toBe('example.test');
  });

  it('assigns incrementing positions to siblings under the same parent', async () => {
    const a = await createFolder('A');
    const b = await createFolder('B');
    const c = await createFolder('C');
    expect(a.parentId).toBe('root');
    const positions = [a, b, c].map(
      (n) => (db.prepare('SELECT position FROM nodes WHERE id = ?').get(n.id) as { position: number }).position,
    );
    expect(positions).toEqual([0, 1, 2]);
  });

  it('rejects a missing/invalid type with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/nodes',
      payload: { name: 'x' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe('type');
  });

  it('rejects a folder with an empty name (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/nodes',
      payload: { type: 'folder', name: '   ' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe('name');
  });

  it('rejects a bookmark with no url (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/nodes',
      payload: { type: 'bookmark', name: 'x' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe('url');
  });

  it('rejects a non-http(s) url scheme (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/nodes',
      payload: { type: 'bookmark', url: 'ftp://example.test/file' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe('url');
  });

  it('404s when the parent does not exist', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/nodes',
      payload: { type: 'folder', name: 'Orphan', parentId: 'no-such-parent' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('parent_not_found');
  });

  it('400s when the parent is a bookmark (not a folder)', async () => {
    const bm = await createBookmark('Leaf', 'https://nonexistent-test-host.example');
    const res = await app.inject({
      method: 'POST',
      url: '/api/nodes',
      payload: { type: 'folder', name: 'Nope', parentId: bm.id },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe('parentId');
  });
});

describe('GET /nodes — list', () => {
  it('lists the owner tree (root + created nodes) with decrypted names', async () => {
    const folder = await createFolder('Tech');
    const bm = await createBookmark('Site', 'https://nonexistent-test-host.example', folder.id);

    const res = await app.inject({ method: 'GET', url: '/api/nodes' });
    expect(res.statusCode).toBe(200);
    const nodes = res.json().nodes as Array<{
      id: string;
      name: string;
      parentId: string | null;
      type: string;
      url?: string;
    }>;

    const ids = nodes.map((n) => n.id);
    expect(ids).toContain('root');
    expect(ids).toContain(folder.id);
    expect(ids).toContain(bm.id);

    const fetchedFolder = nodes.find((n) => n.id === folder.id)!;
    expect(fetchedFolder.name).toBe('Tech');
    expect(fetchedFolder.name.startsWith('enc1:')).toBe(false);

    const fetchedBm = nodes.find((n) => n.id === bm.id)!;
    expect(fetchedBm.parentId).toBe(folder.id);
    expect(fetchedBm.url).toBe('https://nonexistent-test-host.example');
  });

  it('returns just the root after a reset', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/nodes' });
    expect(res.statusCode).toBe(200);
    const nodes = res.json().nodes as Array<{ id: string }>;
    expect(nodes.map((n) => n.id)).toEqual(['root']);
  });
});

describe('DELETE /nodes/:id', () => {
  it('deletes a leaf node and returns it in deletedIds', async () => {
    const bm = await createBookmark('Bye', 'https://nonexistent-test-host.example');
    const res = await app.inject({ method: 'DELETE', url: `/api/nodes/${bm.id}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.deletedIds).toEqual([bm.id]);
    expect(db.prepare('SELECT id FROM nodes WHERE id = ?').get(bm.id)).toBeUndefined();
  });

  it('cascade-deletes the whole subtree; deletedIds lists every removed node', async () => {
    const parent = await createFolder('Parent');
    const child = await createFolder('Child', parent.id);
    const grandchild = await createBookmark('GC', 'https://nonexistent-test-host.example', child.id);

    const res = await app.inject({ method: 'DELETE', url: `/api/nodes/${parent.id}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    // deletedIds = [id, ...descendants] — order-independent set comparison.
    expect(new Set(body.deletedIds)).toEqual(new Set([parent.id, child.id, grandchild.id]));

    // SQLite ON DELETE CASCADE actually removes the children from the table.
    for (const id of [parent.id, child.id, grandchild.id]) {
      expect(db.prepare('SELECT id FROM nodes WHERE id = ?').get(id)).toBeUndefined();
    }
    // Only the root survives.
    expect(countNodes()).toBe(1);
  });

  it('refuses to delete the root (403)', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/nodes/root' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('cannot_delete_root');
    expect(db.prepare('SELECT id FROM nodes WHERE id = ?').get('root')).toBeTruthy();
  });

  it('404s deleting an unknown id', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/nodes/ghost' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('not_found');
  });

  it('re-sequences surviving siblings after a delete', async () => {
    const a = await createFolder('A');
    const b = await createFolder('B');
    const c = await createFolder('C');
    await app.inject({ method: 'DELETE', url: `/api/nodes/${b.id}` });

    const posA = (db.prepare('SELECT position FROM nodes WHERE id = ?').get(a.id) as { position: number }).position;
    const posC = (db.prepare('SELECT position FROM nodes WHERE id = ?').get(c.id) as { position: number }).position;
    // A stays 0, C compacts from 2 down to 1.
    expect(posA).toBe(0);
    expect(posC).toBe(1);
  });
});

describe('POST /nodes/clone — subtree copy', () => {
  it('deep-copies a folder subtree into a target parent; originals untouched', async () => {
    const src = await createFolder('Src');
    const childFolder = await createFolder('Inner', src.id);
    await createBookmark('Leaf', 'https://nonexistent-test-host.example', childFolder.id);
    const dest = await createFolder('Dest');

    const beforeCount = countNodes();

    const res = await app.inject({
      method: 'POST',
      url: '/api/nodes/clone',
      payload: { ids: [src.id], parentId: dest.id },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.newIds).toHaveLength(1);

    // The src subtree (3 nodes) was duplicated under dest.
    expect(countNodes()).toBe(beforeCount + 3);

    // The clone is a distinct node tree under dest, with the same shape & names.
    const list = (await app.inject({ method: 'GET', url: '/api/nodes' })).json().nodes as Array<{
      id: string;
      parentId: string | null;
      name: string;
      type: string;
      url?: string;
    }>;
    const newRoot = list.find((n) => n.id === body.newIds[0])!;
    expect(newRoot.parentId).toBe(dest.id);
    expect(newRoot.name).toBe('Src');
    expect(newRoot.id).not.toBe(src.id);

    const clonedInner = list.find((n) => n.parentId === newRoot.id)!;
    expect(clonedInner.name).toBe('Inner');
    expect(clonedInner.id).not.toBe(childFolder.id);

    const clonedLeaf = list.find((n) => n.parentId === clonedInner.id)!;
    expect(clonedLeaf.name).toBe('Leaf');
    expect(clonedLeaf.url).toBe('https://nonexistent-test-host.example');
  });

  it('copies the icon onto the clone (ciphertext verbatim, decrypts to same icon)', async () => {
    const src = await createFolder('IconSrc');
    // Set an icon via PATCH so the encrypted JSON is realistic.
    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/nodes/${src.id}`,
      payload: { icon: { bg: '#5b93f0', emoji: '🚀' } },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().node.icon).toEqual({ bg: '#5b93f0', emoji: '🚀' });

    const dest = await createFolder('IconDest');
    const res = await app.inject({
      method: 'POST',
      url: '/api/nodes/clone',
      payload: { ids: [src.id], parentId: dest.id },
    });
    const newId = res.json().newIds[0];

    const cloneIconRaw = rawRowFromDb(newId).icon;
    expect(cloneIconRaw).not.toBeNull();
    expect(cloneIconRaw!.startsWith('enc1:')).toBe(true);
    // Decrypted clone icon matches the source icon.
    expect(JSON.parse(decryptString(cloneIconRaw!))).toEqual({ bg: '#5b93f0', emoji: '🚀' });

    // And it's surfaced through the API as the parsed NodeIcon object.
    const list = (await app.inject({ method: 'GET', url: '/api/nodes' })).json().nodes as Array<{
      id: string;
      icon: unknown;
    }>;
    expect(list.find((n) => n.id === newId)!.icon).toEqual({ bg: '#5b93f0', emoji: '🚀' });
  });

  it('enforces the cycle guard: cloning a folder into its own descendant is skipped', async () => {
    const outer = await createFolder('Outer');
    const inner = await createFolder('Inner', outer.id);

    const before = countNodes();
    const res = await app.inject({
      method: 'POST',
      url: '/api/nodes/clone',
      payload: { ids: [outer.id], parentId: inner.id },
    });
    // Endpoint responds ok but silently skips the offending node (no new ids).
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    expect(res.json().newIds).toEqual([]);
    // Nothing was created — the descendant cycle was rejected.
    expect(countNodes()).toBe(before);
  });

  it('enforces the cycle guard: cloning a folder into itself is skipped', async () => {
    const f = await createFolder('Self');
    const before = countNodes();
    const res = await app.inject({
      method: 'POST',
      url: '/api/nodes/clone',
      payload: { ids: [f.id], parentId: f.id },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().newIds).toEqual([]);
    expect(countNodes()).toBe(before);
  });

  it('clones multiple ids in one call, appended at the end of the target', async () => {
    const a = await createBookmark('A', 'https://nonexistent-test-host.example');
    const b = await createBookmark('B', 'https://nonexistent-test-host.example');
    const dest = await createFolder('Dest');

    const res = await app.inject({
      method: 'POST',
      url: '/api/nodes/clone',
      payload: { ids: [a.id, b.id], parentId: dest.id },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().newIds).toHaveLength(2);

    const kids = db
      .prepare('SELECT id, position FROM nodes WHERE parent_id = ? ORDER BY position')
      .all(dest.id) as { id: string; position: number }[];
    expect(kids.map((k) => k.position)).toEqual([0, 1]);
  });

  it('rejects when the node-count cap (2000) would be exceeded', async () => {
    // Build a flat folder of 2000 children → cloning the folder copies 1 + 2000 = 2001 > 2000.
    const big = await createFolder('Big');
    const now = Date.now();
    const ins = db.prepare(
      `INSERT INTO nodes (id, parent_id, type, name, url, favicon_url, icon, position, created_at, updated_at)
       VALUES (?, ?, 'bookmark', ?, ?, NULL, NULL, ?, ?, ?)`,
    );
    const tx = db.transaction(() => {
      for (let i = 0; i < 2000; i++) {
        ins.run(`cap-${i}`, big.id, 'enc-name', 'enc-url', i, now, now);
      }
    });
    tx();
    const dest = await createFolder('CapDest');

    const before = countNodes();
    const res = await app.inject({
      method: 'POST',
      url: '/api/nodes/clone',
      payload: { ids: [big.id], parentId: dest.id },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('too_many_nodes');
    // Nothing was cloned.
    expect(countNodes()).toBe(before);
  });

  it('400s on an empty ids array', async () => {
    const dest = await createFolder('Dest');
    const res = await app.inject({
      method: 'POST',
      url: '/api/nodes/clone',
      payload: { ids: [], parentId: dest.id },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe('ids');
  });

  it('400s when parentId is missing', async () => {
    const a = await createFolder('A');
    const res = await app.inject({
      method: 'POST',
      url: '/api/nodes/clone',
      payload: { ids: [a.id] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe('parentId');
  });

  it('404s when the target parent does not exist', async () => {
    const a = await createFolder('A');
    const res = await app.inject({
      method: 'POST',
      url: '/api/nodes/clone',
      payload: { ids: [a.id], parentId: 'no-such-parent' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('parent_not_found');
  });
});

describe('PATCH /nodes/:id — icon validation', () => {
  async function patchIcon(id: string, icon: unknown) {
    return app.inject({ method: 'PATCH', url: `/api/nodes/${id}`, payload: { icon } });
  }

  it('accepts { bg, emoji } and round-trips through the API', async () => {
    const f = await createFolder('F');
    const res = await patchIcon(f.id, { bg: '#aabbcc', emoji: '📌' });
    expect(res.statusCode).toBe(200);
    expect(res.json().node.icon).toEqual({ bg: '#aabbcc', emoji: '📌' });
    // Stored encrypted.
    expect(rawRowFromDb(f.id).icon?.startsWith('enc1:')).toBe(true);
  });

  it('accepts { bg, lucide } with a valid slug', async () => {
    const f = await createFolder('F');
    const res = await patchIcon(f.id, { bg: '#001122', lucide: 'folder-open' });
    expect(res.statusCode).toBe(200);
    expect(res.json().node.icon).toEqual({ bg: '#001122', lucide: 'folder-open' });
  });

  it('accepts uppercase hex in bg', async () => {
    const f = await createFolder('F');
    const res = await patchIcon(f.id, { bg: '#FFEEDD', emoji: '🔥' });
    expect(res.statusCode).toBe(200);
    expect(res.json().node.icon).toEqual({ bg: '#FFEEDD', emoji: '🔥' });
  });

  it('clears the icon when icon is null', async () => {
    const f = await createFolder('F');
    await patchIcon(f.id, { bg: '#aabbcc', emoji: '📌' });
    const res = await patchIcon(f.id, null);
    expect(res.statusCode).toBe(200);
    expect(res.json().node.icon).toBeNull();
    expect(rawRowFromDb(f.id).icon).toBeNull();
  });

  it('rejects a bad hex bg (wrong length)', async () => {
    const f = await createFolder('F');
    const res = await patchIcon(f.id, { bg: '#fff', emoji: '📌' });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe('icon');
  });

  it('rejects a bg without the leading #', async () => {
    const f = await createFolder('F');
    const res = await patchIcon(f.id, { bg: 'aabbcc', emoji: '📌' });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe('icon');
  });

  it('rejects a bg with non-hex characters', async () => {
    const f = await createFolder('F');
    const res = await patchIcon(f.id, { bg: '#gggggg', emoji: '📌' });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe('icon');
  });

  it('rejects supplying both emoji and lucide', async () => {
    const f = await createFolder('F');
    const res = await patchIcon(f.id, { bg: '#aabbcc', emoji: '📌', lucide: 'star' });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe('icon');
  });

  it('rejects supplying neither emoji nor lucide', async () => {
    const f = await createFolder('F');
    const res = await patchIcon(f.id, { bg: '#aabbcc' });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe('icon');
  });

  it('rejects an over-long emoji (> 8 chars)', async () => {
    const f = await createFolder('F');
    // 9 ASCII chars exceeds the length <= 8 cap.
    const res = await patchIcon(f.id, { bg: '#aabbcc', emoji: 'abcdefghi' });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe('icon');
  });

  it('rejects a lucide slug with invalid characters', async () => {
    const f = await createFolder('F');
    const res = await patchIcon(f.id, { bg: '#aabbcc', lucide: 'Star_Icon' });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe('icon');
  });

  it('rejects a lucide slug longer than 32 chars', async () => {
    const f = await createFolder('F');
    const res = await patchIcon(f.id, { bg: '#aabbcc', lucide: 'a'.repeat(33) });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe('icon');
  });

  it('rejects a non-object icon value (e.g. a string)', async () => {
    const f = await createFolder('F');
    const res = await patchIcon(f.id, 'not-an-object');
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe('icon');
  });

  it('leaves the icon unchanged when icon is absent from the body', async () => {
    const f = await createFolder('F');
    await patchIcon(f.id, { bg: '#aabbcc', emoji: '📌' });
    // A rename PATCH with no icon key must not touch the icon.
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/nodes/${f.id}`,
      payload: { name: 'Renamed' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().node.name).toBe('Renamed');
    expect(res.json().node.icon).toEqual({ bg: '#aabbcc', emoji: '📌' });
  });
});
