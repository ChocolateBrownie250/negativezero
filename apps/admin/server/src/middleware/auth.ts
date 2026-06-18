import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { readSsoCookie, verifySsoSession } from '../lib/ssoSession.js';
import { isAllowed } from '../lib/accounts.js';

// Resolve the calling account id from the local session or the apex SSO cookie.
// On an SSO hit the local session is primed so later requests skip the JWT work.
export async function resolveAccount(req: FastifyRequest): Promise<string | null> {
  const sess = req.session.get('accountId');
  if (sess) return sess;

  const ssoToken = readSsoCookie(req.headers.cookie);
  if (ssoToken) {
    const claims = await verifySsoSession(ssoToken, config.ssoSecret);
    if (claims) {
      req.session.set('accountId', claims.sub);
      return claims.sub;
    }
  }
  return null;
}

// Gate for admin management endpoints: the account must be allowed the `admin`
// service (the owner always is; a friend only if explicitly granted).
export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const accountId = await resolveAccount(req);
  if (!accountId) {
    return reply.code(401).send({ error: 'unauthorized' });
  }
  if (!isAllowed(accountId, 'admin')) {
    return reply.code(403).send({ error: 'forbidden' });
  }
}

declare module '@fastify/secure-session' {
  interface SessionData {
    accountId?: string;
    regChallenge?: string;
    regMode?: 'first' | 'reset' | 'authenticated' | 'enroll';
    regAccountId?: string;
    regAccountName?: string;
    regCodeId?: string;
    regServices?: string;
    authChallenge?: string;
  }
}
