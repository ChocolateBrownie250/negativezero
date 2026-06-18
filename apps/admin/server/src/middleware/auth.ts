import type { FastifyReply, FastifyRequest } from 'fastify';
import { config, isProd } from '../config.js';
import { readSsoCookie, verifySsoSession } from '../lib/ssoSession.js';
import { authorize } from '../lib/accounts.js';

// Resolve the calling account id from the local session or the apex SSO cookie.
// The session also remembers the token's issued-at so authorization (which is
// re-evaluated on every request) can apply the sticky-revocation rule.
export async function resolveAccount(req: FastifyRequest): Promise<string | null> {
  const sess = req.session.get('accountId');
  if (sess) return sess;

  const ssoToken = readSsoCookie(req.headers.cookie);
  if (ssoToken) {
    const claims = await verifySsoSession(ssoToken, config.ssoSecret);
    if (claims) {
      req.session.set('accountId', claims.sub);
      if (claims.iat) req.session.set('accountIat', claims.iat);
      return claims.sub;
    }
  }
  return null;
}

function clearSession(req: FastifyRequest, reply: FastifyReply): void {
  req.session.delete();
  reply.header(
    'set-cookie',
    `nz_session=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax${isProd ? '; Secure' : ''}`,
  );
}

// Gate for admin management endpoints. The decision is re-evaluated LIVE on every
// request (not cached as a boolean in the session), so revoking an account's
// `admin` grant — or disabling the account — takes effect immediately, and a
// stale session is forced to re-authenticate, matching the other services.
export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const accountId = await resolveAccount(req);
  if (!accountId) {
    return reply.code(401).send({ error: 'unauthorized' });
  }
  const iat = req.session.get('accountIat');
  const iatMs = iat ? iat * 1000 : Date.now();
  const decision = authorize(accountId, 'admin', iatMs);
  if (decision === 'allow') return;
  if (decision === 'reauth') {
    clearSession(req, reply);
    return reply.code(401).send({ error: 'session_revoked' });
  }
  return reply.code(403).send({ error: 'forbidden' });
}

declare module '@fastify/secure-session' {
  interface SessionData {
    accountId?: string;
    accountIat?: number;
    regChallenge?: string;
    regMode?: 'first' | 'reset' | 'authenticated' | 'enroll';
    regAccountId?: string;
    regAccountName?: string;
    regCodeId?: string;
    regServices?: string;
    authChallenge?: string;
  }
}
