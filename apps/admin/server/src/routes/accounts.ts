import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { config } from '../config.js';
import {
  OWNER_ACCOUNT_ID,
  deleteAccount,
  getAccount,
  isGatedService,
  listAccounts,
  setAccountStatus,
  setServiceAccess,
} from '../lib/accounts.js';
import { listApiTokens, mintApiToken, revokeApiToken } from '../lib/apiTokens.js';

// Services for which the owner can mint per-account API tokens. Only tts for now
// (machine clients like the iPhone Shortcut). Widen as other services grow a
// Bearer path.
const API_TOKEN_SERVICES = new Set(['tts']);

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

  // ── Per-account API tokens (machine clients, e.g. iPhone Shortcut) ────────
  app.get('/accounts/:id/tokens', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!getAccount(id)) return reply.code(404).send({ error: 'not_found' });
    return { tokens: listApiTokens(id) };
  });

  app.post('/accounts/:id/tokens', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { service?: unknown; label?: unknown };
    const service = typeof body.service === 'string' ? body.service : 'tts';
    if (!API_TOKEN_SERVICES.has(service)) {
      return reply.code(400).send({ error: 'service_not_supported' });
    }
    const acct = getAccount(id);
    if (!acct) return reply.code(404).send({ error: 'not_found' });
    const label =
      typeof body.label === 'string' && body.label.trim()
        ? body.label.trim().slice(0, 80)
        : null;
    const { id: tokenId, token } = await mintApiToken({
      accountId: id,
      name: acct.name,
      service,
      label,
      secret: config.ssoSecret,
    });
    audit(req.ip ?? null, 'api_token_mint', `account=${id} service=${service} token=${tokenId}`);
    // The token is shown exactly once.
    return { id: tokenId, service, label, token };
  });

  app.delete('/accounts/:id/tokens/:tokenId', async (req, reply) => {
    const { id, tokenId } = req.params as { id: string; tokenId: string };
    if (!getAccount(id)) return reply.code(404).send({ error: 'not_found' });
    const ok = revokeApiToken(id, tokenId);
    if (!ok) return reply.code(404).send({ error: 'token_not_found' });
    audit(req.ip ?? null, 'api_token_revoke', `account=${id} token=${tokenId}`);
    return { ok: true };
  });
}
