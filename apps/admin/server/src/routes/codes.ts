import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import type { FastifyInstance } from 'fastify';
import { db, type GeneratedCodeRow } from '../db.js';
import { generateRegistrationCode } from '../lib/codes.js';

// Whitelist of services the admin can issue codes for. Adding a service to
// the platform means adding it here too — otherwise the dropdown in the UI
// silently accepts any string, which is bad form for an admin tool.
const SERVICES = ['bookmark-manager', 'admin'] as const;
type Service = typeof SERVICES[number];

function isService(v: unknown): v is Service {
  return typeof v === 'string' && (SERVICES as readonly string[]).includes(v);
}

export default async function codeRoutes(app: FastifyInstance) {
  app.get('/codes/services', async () => ({ services: SERVICES }));

  app.post('/codes/generate', async (req, reply) => {
    const body = (req.body ?? {}) as { service?: unknown; label?: unknown };
    if (!isService(body.service)) {
      return reply.code(400).send({ error: 'validation', field: 'service' });
    }
    const label =
      typeof body.label === 'string' && body.label.trim()
        ? body.label.trim().slice(0, 80)
        : null;

    const code = generateRegistrationCode();
    const hash = await bcrypt.hash(code, 12);

    db.prepare(
      `INSERT INTO generated_codes (id, service, code_hash, label, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(randomUUID(), body.service, hash, label, Date.now());

    return { service: body.service, label, code, hash };
  });

  app.get('/codes/log', async () => {
    const rows = db
      .prepare(
        `SELECT id, service, label, created_at
           FROM generated_codes
          ORDER BY created_at DESC
          LIMIT 100`,
      )
      .all() as Pick<GeneratedCodeRow, 'id' | 'service' | 'label' | 'created_at'>[];
    return {
      codes: rows.map((r) => ({
        id: r.id,
        service: r.service,
        label: r.label,
        createdAt: r.created_at,
      })),
    };
  });
}
