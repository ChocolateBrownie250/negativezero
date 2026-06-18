import type { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { getAccount, isAllowed } from '../lib/accounts.js';

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
    const q = req.query as { account?: string; service?: string };
    if (!q.account || !q.service) {
      return reply.code(400).send({ error: 'validation' });
    }
    const acct = getAccount(q.account);
    return {
      allowed: isAllowed(q.account, q.service),
      status: acct?.status ?? 'missing',
      name: acct?.name ?? null,
    };
  });
}
