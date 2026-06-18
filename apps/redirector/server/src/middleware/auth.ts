import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { readSsoCookie, verifySsoSession } from '../lib/ssoSession.js';
import { isServiceAllowed } from '../lib/authz.js';

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  // Primary: this service's own @fastify/secure-session (owner who signed in
  // directly on this service). The owner has access to everything.
  if (req.session.get('userId') === 'owner') return;

  // Fallback: the apex-wide nz_session SSO cookie minted by admin. It carries
  // the account id; admin decides whether that account may use this service.
  const token = readSsoCookie(req.headers.cookie);
  if (token) {
    const claims = await verifySsoSession(token, config.ssoSecret);
    if (claims) {
      // Do NOT promote to a local 'owner' session — that would skip the authz
      // check on later requests. Re-check each request (cached ~30s).
      if (await isServiceAllowed(claims.sub, config.serviceName)) return;
      return reply.code(403).send({ error: 'forbidden', service: config.serviceName });
    }
  }

  reply.code(401).send({ error: 'unauthorized' });
}

declare module '@fastify/secure-session' {
  interface SessionData {
    userId?: 'owner';
    regChallenge?: string;
    regMode?: 'first' | 'reset' | 'authenticated';
    authChallenge?: string;
  }
}
