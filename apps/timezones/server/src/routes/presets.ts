import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { db, rowToApi, type PresetRow } from '../db.js';
import { accountId } from '../middleware/auth.js';
import { parseSelection, cleanName, InvalidSelectionError } from '../lib/presets.js';

const MAX_PRESETS = 100;

// requireAuth gates this scope, so a session always exists here; the throw is
// purely defensive (and yields a 500 rather than a mis-scoped read/write).
async function requireAccount(req: FastifyRequest): Promise<string> {
  const id = await accountId(req);
  if (!id) throw new Error('no account id on a protected route');
  return id;
}

export default async function presetRoutes(app: FastifyInstance) {
  app.get('/presets', async (req) => {
    const acc = await requireAccount(req);
    const rows = db
      .prepare('SELECT * FROM presets WHERE account_id = ? ORDER BY created_at DESC')
      .all(acc) as PresetRow[];
    return { presets: rows.map(rowToApi) };
  });

  app.post('/presets', async (req, reply) => {
    const acc = await requireAccount(req);
    const body = (req.body ?? {}) as { name?: unknown; selection?: unknown };

    let name: string;
    let selection;
    try {
      name = cleanName(body.name);
      selection = parseSelection(body.selection);
    } catch (err) {
      if (err instanceof InvalidSelectionError) {
        return reply.code(400).send({ error: 'validation', field: err.message });
      }
      throw err;
    }

    const { n } = db
      .prepare('SELECT COUNT(*) AS n FROM presets WHERE account_id = ?')
      .get(acc) as { n: number };
    if (n >= MAX_PRESETS) {
      return reply.code(409).send({ error: 'too_many', limit: MAX_PRESETS });
    }

    const now = Date.now();
    const id = randomUUID();
    db.prepare(
      `INSERT INTO presets (id, account_id, name, selection, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, acc, name, JSON.stringify(selection), now, now);

    const row = db.prepare('SELECT * FROM presets WHERE id = ?').get(id) as PresetRow;
    return reply.code(201).send({ preset: rowToApi(row) });
  });

  // Scoped delete: the account_id predicate makes one account's id useless
  // against another's presets (a foreign id simply 404s).
  app.delete('/presets/:id', async (req, reply) => {
    const acc = await requireAccount(req);
    const { id } = req.params as { id: string };
    const row = db
      .prepare('SELECT id FROM presets WHERE id = ? AND account_id = ?')
      .get(id, acc) as { id: string } | undefined;
    if (!row) return reply.code(404).send({ error: 'not_found' });
    db.prepare('DELETE FROM presets WHERE id = ?').run(id);
    return { ok: true };
  });

  // Scoped fetch: like delete, a foreign id is indistinguishable from a missing
  // one (404) — no cross-account existence oracle.
  app.get('/presets/:id', async (req, reply) => {
    const acc = await requireAccount(req);
    const { id } = req.params as { id: string };
    const row = db
      .prepare('SELECT * FROM presets WHERE id = ? AND account_id = ?')
      .get(id, acc) as PresetRow | undefined;
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return { preset: rowToApi(row) };
  });

  // Partial update of name and/or selection. Validation mirrors POST
  // (cleanName / parseSelection). Account-scoped, so an unknown or foreign id
  // 404s before any write. Either field may be omitted to leave it unchanged.
  app.patch('/presets/:id', async (req, reply) => {
    const acc = await requireAccount(req);
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { name?: unknown; selection?: unknown };

    const row = db
      .prepare('SELECT * FROM presets WHERE id = ? AND account_id = ?')
      .get(id, acc) as PresetRow | undefined;
    if (!row) return reply.code(404).send({ error: 'not_found' });

    let name = row.name;
    let selectionJson = row.selection;
    try {
      if (body.name !== undefined) name = cleanName(body.name);
      if (body.selection !== undefined) {
        selectionJson = JSON.stringify(parseSelection(body.selection));
      }
    } catch (err) {
      if (err instanceof InvalidSelectionError) {
        return reply.code(400).send({ error: 'validation', field: err.message });
      }
      throw err;
    }

    const now = Date.now();
    db.prepare(
      'UPDATE presets SET name = ?, selection = ?, updated_at = ? WHERE id = ? AND account_id = ?',
    ).run(name, selectionJson, now, id, acc);

    const updated = db.prepare('SELECT * FROM presets WHERE id = ?').get(id) as PresetRow;
    return { preset: rowToApi(updated) };
  });
}
