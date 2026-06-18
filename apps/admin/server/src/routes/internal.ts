import type { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { authorize, getAccount } from '../lib/accounts.js';
import { apiTokenState } from '../lib/apiTokens.js';

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
    const q = req.query as { account?: string; service?: string; iat?: string; jti?: string };
    if (!q.account || !q.service) {
      return reply.code(400).send({ error: 'validation' });
    }
    try {
      // If a `jti` is supplied the caller is authenticating with an API token;
      // a revoked/missing token is rejected before the grant check so revoking a
      // single token takes effect immediately and independently of the account.
      if (q.jti) {
        const state = apiTokenState(q.jti);
        if (state !== 'active') {
          return { decision: 'reauth', allowed: false, status: 'token_' + state, name: null };
        }
      }
      // `iat` is the token's issued-at in seconds (from the JWT). Default to "now"
      // when absent so a caller that omits it still gets a current grant decision
      // (it just won't get the stale-session → reauth signal).
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
    } catch (err) {
      // This is the authz gate every service depends on. A DB error here must
      // not crash the handler (which would surface as a 500/empty reply and
      // could be misread); fail closed with 503 + an explicit deny so callers
      // treat it as "not allowed" and apply their own stale/deny fallback.
      req.log.error({ err }, 'internal authz check failed');
      return reply
        .code(503)
        .send({ decision: 'deny', allowed: false, status: 'error', name: null, error: 'authz_unavailable' });
    }
  });
}
