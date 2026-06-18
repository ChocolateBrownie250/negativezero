import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import {
  OWNER_ACCOUNT_ID,
  deleteAccount,
  getAccount,
  isGatedService,
  listAccounts,
  setAccountStatus,
  setServiceAccess,
} from '../lib/accounts.js';

function audit(ip: string | null, event: string, detail: string): void {
  try {
    db.prepare(
      'INSERT INTO audit_log (ts, event, detail, ip) VALUES (?, ?, ?, ?)',
    ).run(Date.now(), event, detail, ip);
  } catch {
    // never break the request on an audit failure
  }
}

export default async function accountRoutes(app: FastifyInstance) {
  app.get('/accounts', async () => ({ accounts: listAccounts() }));

  // Toggle one service for one account.
  app.post('/accounts/:id/service', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { service?: unknown; enabled?: unknown };
    if (!isGatedService(body.service) || typeof body.enabled !== 'boolean') {
      return reply.code(400).send({ error: 'validation' });
    }
    const acct = getAccount(id);
    if (!acct) return reply.code(404).send({ error: 'not_found' });
    if (acct.is_owner === 1) {
      // The owner always has every service; refuse to create a false "off".
      return reply.code(409).send({ error: 'owner_immutable' });
    }
    setServiceAccess(id, body.service, body.enabled);
    audit(req.ip ?? null, 'account_service', `${id} ${body.service}=${body.enabled}`);
    return { ok: true };
  });

  // Enable / disable an account wholesale.
  app.post('/accounts/:id/status', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { status?: unknown };
    if (body.status !== 'active' && body.status !== 'disabled') {
      return reply.code(400).send({ error: 'validation' });
    }
    const acct = getAccount(id);
    if (!acct) return reply.code(404).send({ error: 'not_found' });
    if (acct.is_owner === 1) {
      return reply.code(409).send({ error: 'owner_immutable' });
    }
    setAccountStatus(id, body.status);
    audit(req.ip ?? null, 'account_status', `${id}=${body.status}`);
    return { ok: true };
  });

  app.delete('/accounts/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (id === OWNER_ACCOUNT_ID) {
      return reply.code(409).send({ error: 'owner_immutable' });
    }
    const acct = getAccount(id);
    if (!acct) return reply.code(404).send({ error: 'not_found' });
    deleteAccount(id);
    audit(req.ip ?? null, 'account_delete', id);
    return { ok: true };
  });
}
