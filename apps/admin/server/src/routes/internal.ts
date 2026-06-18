import type { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { authorize, getAccount } from '../lib/accounts.js';

// Constant-time compare of the internal bearer against the shared SSO secret.
function bearerOk(authorization: string | undefined): boolean {
  if (!config.ssoSecret) return false;
  if (!authorization || !authorization.startsWith('Bearer ')) return false;
  const presented = Buffer.from(authorization.slice('Bearer '.length).trim());
  const expected = Buffer.from(config.ssoSecret);
  if (presented.length !== expected.length) return false;
  return timingSafeEqual(presented, expected);
}

// Service-to-service authorization. NOT exposed through nginx (see the apex
// conf, which 404s /api/internal/). Guarded by the shared SSO secret so only
// sibling containers on the internal network can ask.
export default async function internalRoutes(app: FastifyInstance) {
  app.get('/internal/authz', async (req, reply) => {
    if (!bearerOk(req.headers.authorization)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const q = req.query as { account?: string; service?: string; iat?: string };
    if (!q.account || !q.service) {
      return reply.code(400).send({ error: 'validation' });
    }
    // `iat` is the session token's issued-at in seconds (from the JWT). Default
    // to "now" when absent so a caller that omits it still gets a current
    // grant decision (it just won't get the stale-session → reauth signal).
    const iatSeconds = q.iat ? Number.parseInt(q.iat, 10) : Math.floor(Date.now() / 1000);
    const iatMs = Number.isFinite(iatSeconds) ? iatSeconds * 1000 : Date.now();
    const decision = authorize(q.account, q.service, iatMs);
    const acct = getAccount(q.account);
    return {
      decision, // 'allow' | 'deny' | 'reauth'
      allowed: decision === 'allow', // back-compat convenience
      status: acct?.status ?? 'missing',
      name: acct?.name ?? null,
    };
  });
}
