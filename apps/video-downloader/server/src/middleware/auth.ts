import type { FastifyReply, FastifyRequest } from 'fastify';
import { config, isProd } from '../config.js';
import { readSsoCookie, verifySsoSession } from '../lib/ssoSession.js';
import { authorizeService } from '../lib/authz.js';

// Clear the apex SSO cookie without needing @fastify/cookie registered.
function clearSsoCookie(reply: FastifyReply) {
  reply.header(
    'set-cookie',
    `nz_session=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax${isProd ? '; Secure' : ''}`,
  );
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  // Primary: this service's own @fastify/secure-session (owner who signed in
  // directly on this service). The owner has access to everything.
  if (req.session.get('userId') === 'owner') return;

  // Fallback: the apex-wide nz_session SSO cookie minted by admin. It carries
  // the account id + issued-at; admin decides allow / deny / reauth live.
  const token = readSsoCookie(req.headers.cookie);
  if (token) {
    const claims = await verifySsoSession(token, config.ssoSecret);
    if (claims) {
      const decision = await authorizeService(claims.sub, config.serviceName, claims.iat);
      if (decision === 'allow') return;
      if (decision === 'reauth') {
        // Account/session was revoked → drop the dead cookie, force re-login.
        clearSsoCookie(reply);
        return reply.code(401).send({ error: 'session_revoked' });
      }
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
