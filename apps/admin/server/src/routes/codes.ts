import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { db, type GeneratedCodeRow } from '../db.js';
import { generateRegistrationCode } from '../lib/codes.js';
import { GATED_SERVICES, isGatedService } from '../lib/accounts.js';

export default async function codeRoutes(app: FastifyInstance) {
  // The services a setup code can grant access to.
  app.get('/codes/services', async () => ({ services: GATED_SERVICES }));

  app.post('/codes/generate', async (req, reply) => {
    const body = (req.body ?? {}) as {
      services?: unknown;
      service?: unknown; // legacy single-service form, still accepted
      name?: unknown;
      label?: unknown;
    };

    // Accept either `services: string[]` (new) or `service: string` (legacy).
    let services: string[] = [];
    if (Array.isArray(body.services)) {
      services = body.services.filter(isGatedService);
    } else if (isGatedService(body.service)) {
      services = [body.service];
    }
    if (services.length === 0) {
      return reply.code(400).send({ error: 'validation', field: 'services' });
    }
    // De-duplicate while preserving the canonical order.
    services = GATED_SERVICES.filter((s) => services.includes(s));

    const rawName = typeof body.name === 'string' ? body.name : body.label;
    const name =
      typeof rawName === 'string' && rawName.trim()
        ? rawName.trim().slice(0, 80)
        : null;

    const code = generateRegistrationCode();
    const hash = await bcrypt.hash(code, 12);

    const codeId = randomUUID();
    db.prepare(
      `INSERT INTO generated_codes
         (id, service, code_hash, label, created_at, granted_services, name)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      codeId,
      services[0], // keep `service` populated for backwards-compatible reads
      hash,
      name,
      Date.now(),
      JSON.stringify(services),
      name,
    );

    db.prepare(
      'INSERT INTO audit_log (ts, event, detail, ip) VALUES (?, ?, ?, ?)',
    ).run(
      Date.now(),
      'code_generate',
      `services=${services.join(',')} id=${codeId}`,
      req.ip ?? null,
    );

    return { services, name, code };
  });

  app.get('/codes/log', async () => {
    const rows = db
      .prepare(
        `SELECT id, service, label, created_at, granted_services, name, used_at, account_id
           FROM generated_codes
          ORDER BY created_at DESC
          LIMIT 100`,
      )
      .all() as GeneratedCodeRow[];
    return {
      codes: rows.map((r) => ({
        id: r.id,
        services: r.granted_services
          ? (JSON.parse(r.granted_services) as string[])
          : [r.service],
        name: r.name ?? r.label,
        createdAt: r.created_at,
        usedAt: r.used_at,
        accountId: r.account_id,
      })),
    };
  });
}
