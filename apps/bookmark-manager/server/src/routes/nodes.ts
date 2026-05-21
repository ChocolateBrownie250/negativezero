import type { FastifyInstance } from 'fastify';
import { db, rowToApi, type ApiNode, type DbNodeRow } from '../db.js';
import { newId } from '../lib/ids.js';
import { fetchMetadata, BlockedTargetError, normalizeUrl } from '../lib/fetcher.js';
import { encryptString, encryptNullable } from '../lib/crypto.js';

const ROOT = 'root';

function getRow(id: string): DbNodeRow | undefined {
  return db.prepare('SELECT * FROM nodes WHERE id = ?').get(id) as DbNodeRow | undefined;
}

function isFolder(row: DbNodeRow | undefined): boolean {
  return !!row && row.type === 'folder';
}

function getDescendantIds(id: string): string[] {
  const out: string[] = [];
  const stack = [id];
  const stmt = db.prepare('SELECT id FROM nodes WHERE parent_id = ?');
  while (stack.length) {
    const cur = stack.pop()!;
    const kids = stmt.all(cur) as { id: string }[];
    for (const k of kids) {
      out.push(k.id);
      stack.push(k.id);
    }
  }
  return out;
}

function isDescendantOf(maybeChildId: string, ancestorId: string): boolean {
  if (maybeChildId === ancestorId) return true;
  const descendants = getDescendantIds(ancestorId);
  return descendants.includes(maybeChildId);
}

function reseqSiblings(parentId: string): void {
  const rows = db
    .prepare('SELECT id FROM nodes WHERE parent_id = ? ORDER BY position ASC, created_at ASC')
    .all(parentId) as { id: string }[];
  const upd = db.prepare('UPDATE nodes SET position = ? WHERE id = ?');
  const tx = db.transaction(() => {
    rows.forEach((r, i) => upd.run(i, r.id));
  });
  tx();
}

function nextPosition(parentId: string): number {
  const row = db
    .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM nodes WHERE parent_id = ?')
    .get(parentId) as { pos: number };
  return row.pos;
}

function hostOf(urlStr: string): string {
  try {
    return new URL(urlStr).hostname;
  } catch {
    return urlStr;
  }
}

export default async function nodeRoutes(app: FastifyInstance) {
  app.get('/nodes', async () => {
    const rows = db
      .prepare('SELECT * FROM nodes ORDER BY parent_id, position')
      .all() as DbNodeRow[];
    const nodes: ApiNode[] = rows.map(rowToApi);
    return { nodes };
  });

  app.post('/nodes', async (req, reply) => {
    const body = req.body as
      | {
          type?: 'folder' | 'bookmark';
          parentId?: string;
          name?: string;
          url?: string;
        }
      | null;

    if (!body || (body.type !== 'folder' && body.type !== 'bookmark')) {
      return reply.code(400).send({ error: 'validation', field: 'type' });
    }

    const parentId = (body.parentId ?? ROOT).trim();
    if (!parentId) {
      return reply.code(400).send({ error: 'validation', field: 'parentId' });
    }
    const parent = getRow(parentId);
    if (!parent) return reply.code(404).send({ error: 'parent_not_found' });
    if (!isFolder(parent)) return reply.code(400).send({ error: 'validation', field: 'parentId' });

    const now = Date.now();
    const id = newId();

    if (body.type === 'folder') {
      const name = (body.name ?? '').trim();
      if (!name) return reply.code(400).send({ error: 'validation', field: 'name' });
      const position = nextPosition(parentId);
      db.prepare(
        `INSERT INTO nodes (id, parent_id, type, name, url, favicon_url, position, created_at, updated_at)
         VALUES (?, ?, 'folder', ?, NULL, NULL, ?, ?, ?)`,
      ).run(id, parentId, encryptString(name), position, now, now);
      const row = getRow(id)!;
      return reply.code(201).send({ node: rowToApi(row) });
    }

    // bookmark
    const rawUrl = (body.url ?? '').trim();
    if (!rawUrl) return reply.code(400).send({ error: 'validation', field: 'url' });
    let normalized: string;
    try {
      normalized = normalizeUrl(rawUrl);
      // validate URL constructs
      const u = new URL(normalized);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return reply.code(400).send({ error: 'validation', field: 'url' });
      }
    } catch {
      return reply.code(400).send({ error: 'validation', field: 'url' });
    }

    let title: string | null = null;
    let faviconUrl: string | null = null;
    let finalUrl = normalized;
    const wantTitle = !(body.name && body.name.trim());
    try {
      const meta = await fetchMetadata(normalized);
      finalUrl = meta.finalUrl;
      faviconUrl = meta.faviconUrl;
      if (wantTitle) title = meta.title;
    } catch (err) {
      if (err instanceof BlockedTargetError) {
        return reply.code(400).send({ error: 'blocked_target' });
      }
      // any other failure: keep going, fall through
    }

    const finalName =
      (body.name && body.name.trim()) || (title && title.trim()) || hostOf(finalUrl);
    const position = nextPosition(parentId);
    db.prepare(
      `INSERT INTO nodes (id, parent_id, type, name, url, favicon_url, position, created_at, updated_at)
       VALUES (?, ?, 'bookmark', ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      parentId,
      encryptString(finalName),
      encryptString(finalUrl),
      encryptNullable(faviconUrl),
      position,
      now,
      now,
    );

    return reply.code(201).send({ node: rowToApi(getRow(id)!) });
  });

  app.patch('/nodes/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!id) return reply.code(400).send({ error: 'validation', field: 'id' });
    const row = getRow(id);
    if (!row) return reply.code(404).send({ error: 'not_found' });
    if (id === ROOT) return reply.code(403).send({ error: 'cannot_modify_root' });

    const body = (req.body ?? {}) as {
      name?: unknown;
      url?: unknown;
      parentId?: unknown;
      position?: unknown;
    };

    // nameDb / urlDb are the already-encrypted values to write to the
    // database. They start as a pass-through of the DB row (which is
    // already encrypted) and are only re-encrypted from a fresh
    // plaintext if the PATCH body provides one. The previous
    // implementation always re-encrypted `row.name` even when the body
    // didn't supply a new name, which double-wrapped the ciphertext
    // (DB ended up holding `encryptString(encryptString(plaintext))`)
    // and made every move/reorder corrupt the row's display name on
    // the next read.
    let nameDb: string = row.name;
    let urlDb: string | null = row.url;
    let newParentId = row.parent_id;
    let newPosition = row.position;
    let parentChanged = false;

    if (typeof body.name === 'string') {
      const t = body.name.trim();
      if (!t) return reply.code(400).send({ error: 'validation', field: 'name' });
      nameDb = encryptString(t);
    }

    if (typeof body.url === 'string') {
      if (row.type !== 'bookmark') {
        return reply.code(400).send({ error: 'validation', field: 'url' });
      }
      const t = body.url.trim();
      if (!t) return reply.code(400).send({ error: 'validation', field: 'url' });
      try {
        const normalized = normalizeUrl(t);
        const u = new URL(normalized);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
          return reply.code(400).send({ error: 'validation', field: 'url' });
        }
        urlDb = encryptString(normalized);
      } catch {
        return reply.code(400).send({ error: 'validation', field: 'url' });
      }
    }

    if (typeof body.parentId === 'string' && body.parentId !== row.parent_id) {
      const pid = body.parentId;
      const parent = getRow(pid);
      if (!parent) return reply.code(404).send({ error: 'parent_not_found' });
      if (!isFolder(parent)) {
        return reply.code(400).send({ error: 'validation', field: 'parentId' });
      }
      if (row.type === 'folder' && isDescendantOf(pid, id)) {
        return reply.code(403).send({ error: 'cannot_move_into_descendant' });
      }
      newParentId = pid;
      parentChanged = true;
    }

    const now = Date.now();
    const positionGiven = typeof body.position === 'number';
    if (positionGiven) {
      newPosition = Math.max(0, Math.floor(body.position as number));
    }

    const tx = db.transaction(() => {
      const oldParent = row.parent_id;
      db.prepare(
        `UPDATE nodes
            SET name = ?, url = ?, parent_id = ?, position = ?, updated_at = ?
          WHERE id = ?`,
      ).run(nameDb, urlDb, newParentId, newPosition, now, id);

      // re-sequence: if parent changed, both old and new parent
      if (parentChanged && oldParent) reseqSiblings(oldParent);
      if (newParentId) reseqSiblings(newParentId);
    });
    tx();

    return { node: rowToApi(getRow(id)!) };
  });

  app.delete('/nodes/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (id === ROOT) return reply.code(403).send({ error: 'cannot_delete_root' });
    const row = getRow(id);
    if (!row) return reply.code(404).send({ error: 'not_found' });

    const descendants = getDescendantIds(id);
    const deletedIds = [id, ...descendants];
    const parentId = row.parent_id;

    const tx = db.transaction(() => {
      db.prepare('DELETE FROM nodes WHERE id = ?').run(id);
      if (parentId) reseqSiblings(parentId);
    });
    tx();

    return { ok: true, deletedIds };
  });

  // Atomic reorder of every child of a single folder. The client sends
  // the full new order (orderedIds) and the server writes positions
  // 0..n-1 in that exact order — no per-row PATCH races, no created_at
  // tiebreaker ambiguity that the regular PATCH path is subject to.
  // Validates: every supplied ID exists, all are children of parentId,
  // and the supplied list is exactly the set of children (no missing,
  // no extras).
  app.post('/nodes/reorder', async (req, reply) => {
    const body = (req.body ?? {}) as {
      parentId?: unknown;
      orderedIds?: unknown;
    };
    const parentId = body.parentId;
    const orderedIds = body.orderedIds;
    if (typeof parentId !== 'string' || !parentId.trim()) {
      return reply.code(400).send({ error: 'validation', field: 'parentId' });
    }
    if (
      !Array.isArray(orderedIds) ||
      orderedIds.some((x) => typeof x !== 'string' || !x.trim())
    ) {
      return reply.code(400).send({ error: 'validation', field: 'orderedIds' });
    }
    if (parentId !== ROOT && !getRow(parentId)) {
      return reply.code(404).send({ error: 'parent_not_found' });
    }

    // Pull the actual children of the parent and assert exact set match.
    const existingRows = db
      .prepare('SELECT id FROM nodes WHERE parent_id = ?')
      .all(parentId) as { id: string }[];
    const existing = new Set(existingRows.map((r) => r.id));
    if (existing.size !== orderedIds.length) {
      return reply
        .code(400)
        .send({ error: 'validation', field: 'orderedIds_count_mismatch' });
    }
    for (const id of orderedIds as string[]) {
      if (!existing.has(id)) {
        return reply
          .code(400)
          .send({ error: 'validation', field: 'orderedIds_unknown_id' });
      }
    }

    const upd = db.prepare('UPDATE nodes SET position = ? WHERE id = ?');
    const tx = db.transaction(() => {
      (orderedIds as string[]).forEach((id, i) => upd.run(i, id));
    });
    tx();
    return { ok: true };
  });
}
