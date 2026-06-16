import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { db, rowToApi, type RedirectRow } from '../db.js';
import {
  generateSlug,
  normalizeTarget,
  InvalidTargetError,
} from '../lib/redirects.js';

function getRow(id: string): RedirectRow | undefined {
  return db.prepare('SELECT * FROM redirects WHERE id = ?').get(id) as
    | RedirectRow
    | undefined;
}

function slugTaken(slug: string): boolean {
  return !!db.prepare('SELECT 1 FROM redirects WHERE slug = ?').get(slug);
}

// The hash space (36^16) makes collisions astronomically unlikely, but the
// UNIQUE index is the real guarantee — retry on the vanishingly rare clash.
function uniqueSlug(): string {
  for (let i = 0; i < 8; i++) {
    const slug = generateSlug();
    if (!slugTaken(slug)) return slug;
  }
  throw new Error('could not mint a unique slug');
}

export default async function redirectRoutes(app: FastifyInstance) {
  app.get('/redirects', async () => {
    const rows = db
      .prepare('SELECT * FROM redirects ORDER BY created_at DESC')
      .all() as RedirectRow[];
    return { redirects: rows.map(rowToApi) };
  });

  app.post('/redirects', async (req, reply) => {
    const body = (req.body ?? {}) as { target?: unknown; title?: unknown };

    if (typeof body.target !== 'string' || !body.target.trim()) {
      return reply.code(400).send({ error: 'validation', field: 'target' });
    }
    let target: string;
    try {
      target = normalizeTarget(body.target);
    } catch (err) {
      if (err instanceof InvalidTargetError) {
        return reply.code(400).send({ error: 'invalid_target' });
      }
      throw err;
    }

    const title =
      typeof body.title === 'string' && body.title.trim()
        ? body.title.trim().slice(0, 120)
        : null;

    const now = Date.now();
    const id = randomUUID();
    const slug = uniqueSlug();
    db.prepare(
      `INSERT INTO redirects (id, slug, target, title, hits, created_at, updated_at, last_used_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, NULL)`,
    ).run(id, slug, target, title, now, now);

    return reply.code(201).send({ redirect: rowToApi(getRow(id)!) });
  });

  // Target and title are editable; the slug is the permalink and never changes.
  app.patch('/redirects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = getRow(id);
    if (!row) return reply.code(404).send({ error: 'not_found' });

    const body = (req.body ?? {}) as { target?: unknown; title?: unknown };
    let target = row.target;
    let title = row.title;

    if (typeof body.target === 'string') {
      try {
        target = normalizeTarget(body.target);
      } catch (err) {
        if (err instanceof InvalidTargetError) {
          return reply.code(400).send({ error: 'invalid_target' });
        }
        throw err;
      }
    }

    if (typeof body.title === 'string') {
      const t = body.title.trim();
      title = t ? t.slice(0, 120) : null;
    }

    db.prepare(
      `UPDATE redirects SET target = ?, title = ?, updated_at = ? WHERE id = ?`,
    ).run(target, title, Date.now(), id);

    return { redirect: rowToApi(getRow(id)!) };
  });

  app.delete('/redirects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!getRow(id)) return reply.code(404).send({ error: 'not_found' });
    db.prepare('DELETE FROM redirects WHERE id = ?').run(id);
    return { ok: true };
  });
}
