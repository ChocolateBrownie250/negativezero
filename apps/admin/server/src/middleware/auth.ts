import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { readSsoCookie, verifySsoSession } from '../lib/ssoSession.js';

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  if (req.session.get('userId') === 'owner') return;

  // Fall back to the apex-wide SSO cookie minted by admin on passkey login.
  const ssoToken = readSsoCookie(req.headers.cookie);
  if (ssoToken && (await verifySsoSession(ssoToken, config.ssoSecret))) {
    req.session.set('userId', 'owner');
    return;
  }

  return reply.code(401).send({ error: 'unauthorized' });
}

declare module '@fastify/secure-session' {
  interface SessionData {
    userId?: 'owner';
    regChallenge?: string;
    regMode?: 'first' | 'reset' | 'authenticated';
    authChallenge?: string;
  }
}
