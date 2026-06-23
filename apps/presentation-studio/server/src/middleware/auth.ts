import type { FastifyReply, FastifyRequest } from 'fastify';
import { config, isProd } from '../config.js';
import { authorizeService } from '../lib/authz.js';
import { readSsoCookie, verifySsoSession } from '../lib/ssoSession.js';

function clearSsoCookie(reply: FastifyReply) {
  reply.header(
    'set-cookie',
    `nz_session=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax${isProd ? '; Secure' : ''}`,
  );
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  if (req.session.get('userId') === 'owner') {
    // Local passkey login owns a single 'owner' presentation space.
    req.ownerId = 'owner';
    return;
  }

  const token = readSsoCookie(req.headers.cookie);
  if (token) {
    const claims = await verifySsoSession(token, config.ssoSecret);
    if (claims) {
      const decision = await authorizeService(claims.sub, config.serviceName, claims.iat);
      if (decision === 'allow') {
        // SSO account: presentations are scoped to this account id.
        req.ownerId = claims.sub;
        return;
      }
      if (decision === 'reauth') {
        clearSsoCookie(reply);
        return reply.code(401).send({ error: 'session_revoked' });
      }
      return reply.code(403).send({ error: 'forbidden', service: config.serviceName });
    }
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

declare module 'fastify' {
  interface FastifyRequest {
    // Resolved owner identity for the request, set by requireAuth: 'owner' for
    // the local passkey, or the SSO account id. Scopes saved presentations.
    ownerId?: string;
  }
}
