import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { db, type PresentationRow } from '../db.js';

// 2 MB cap per stored document — generous for slide JSON, blunts abuse.
export const MAX_DOC_BYTES = 2_000_000;

// Light structural gate for stored documents: enough to reject garbage without
// blocking transient mid-edit states. The /presentation/validate endpoint does
// the full semantic check on demand.
function isStorableDocument(
  doc: unknown,
): doc is { version: number; scenes: unknown[]; title?: unknown } {
  return (
    !!doc &&
    typeof doc === 'object' &&
    (doc as { version?: unknown }).version === 1 &&
    Array.isArray((doc as { scenes?: unknown }).scenes)
  );
}

function deriveTitle(doc: { title?: unknown }, fallback: string): string {
  const t = typeof doc.title === 'string' ? doc.title.trim() : '';
  return t ? t.slice(0, 200) : fallback;
}

// Owner-scoped CRUD for saved presentations. Registered behind requireAuth, so
// req.ownerId is always set ('owner' for local passkey, or the SSO account id).
export default async function presentationsRoutes(app: FastifyInstance) {
  app.get('/presentations', async (req) => {
    const owner = req.ownerId ?? 'owner';
    const rows = db
      .prepare(
        'SELECT id, title, updated_at FROM presentations WHERE owner = ? ORDER BY updated_at DESC',
      )
      .all(owner) as Pick<PresentationRow, 'id' | 'title' | 'updated_at'>[];
    return {
      presentations: rows.map((r) => ({
        id: r.id,
        title: r.title,
        updatedAt: r.updated_at,
      })),
    };
  });

  app.post('/presentations', async (req, reply) => {
    const owner = req.ownerId ?? 'owner';
    const body = (req.body ?? {}) as { document?: unknown };
    const doc = body.document;
    if (!isStorableDocument(doc)) {
      return reply.code(400).send({ error: 'invalid_document' });
    }
    const json = JSON.stringify(doc);
    if (Buffer.byteLength(json, 'utf8') > MAX_DOC_BYTES) {
      return reply.code(413).send({ error: 'document_too_large' });
    }
    const id = randomUUID();
    const now = Date.now();
    const title = deriveTitle(doc, 'Untitled presentation');
    db.prepare(
      `INSERT INTO presentations (id, owner, title, document, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, owner, title, json, now, now);
    return reply.code(201).send({ id, title, updatedAt: now });
  });

  app.get('/presentations/:id', async (req, reply) => {
    const owner = req.ownerId ?? 'owner';
    const { id } = req.params as { id: string };
    const row = db
      .prepare('SELECT * FROM presentations WHERE id = ? AND owner = ?')
      .get(id, owner) as PresentationRow | undefined;
    if (!row) return reply.code(404).send({ error: 'not_found' });
    let document: unknown;
    try {
      document = JSON.parse(row.document);
    } catch {
      return reply.code(500).send({ error: 'corrupt_document' });
    }
    return { id: row.id, title: row.title, document, updatedAt: row.updated_at };
  });

  app.put('/presentations/:id', async (req, reply) => {
    const owner = req.ownerId ?? 'owner';
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { document?: unknown };
    const doc = body.document;
    if (!isStorableDocument(doc)) {
      return reply.code(400).send({ error: 'invalid_document' });
    }
    const json = JSON.stringify(doc);
    if (Buffer.byteLength(json, 'utf8') > MAX_DOC_BYTES) {
      return reply.code(413).send({ error: 'document_too_large' });
    }
    const exists = db
      .prepare('SELECT id FROM presentations WHERE id = ? AND owner = ?')
      .get(id, owner);
    if (!exists) return reply.code(404).send({ error: 'not_found' });
    const now = Date.now();
    const title = deriveTitle(doc, 'Untitled presentation');
    db.prepare(
      'UPDATE presentations SET title = ?, document = ?, updated_at = ? WHERE id = ? AND owner = ?',
    ).run(title, json, now, id, owner);
    return { ok: true, title, updatedAt: now };
  });

  app.delete('/presentations/:id', async (req, reply) => {
    const owner = req.ownerId ?? 'owner';
    const { id } = req.params as { id: string };
    const info = db
      .prepare('DELETE FROM presentations WHERE id = ? AND owner = ?')
      .run(id, owner);
    if (info.changes === 0) return reply.code(404).send({ error: 'not_found' });
    return { ok: true };
  });
}
