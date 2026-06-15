import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { readSsoCookie, verifySsoSession } from '../lib/ssoSession.js';

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  // Primary: this service's own @fastify/secure-session.
  if (req.session.get('userId') === 'owner') return;

  // Fallback: accept the apex-wide nz_session SSO cookie minted by admin.
  const token = readSsoCookie(req.headers.cookie);
  if (token && (await verifySsoSession(token, config.ssoSecret))) {
    req.session.set('userId', 'owner');
    return;
  }

  reply.code(401).send({ error: 'unauthorized' });
}

declare module '@fastify/secure-session' {
  interface SessionData {
    userId?: 'owner';
    regChallenge?: string;
    authChallenge?: string;
  }
}
