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

// timezones has no local passkey/login of its own; access is entirely via the
// apex-wide nz_session SSO cookie (minted by admin on passkey login). The owner
// auto-has every service; friends need the 'timezones' grant. Admin decides
// allow / deny / reauth live.
export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
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

// Resolve the verified account id (the SSO `sub`) for scoping per-account data.
// Returns null if there's no valid session; protected routes run after
// requireAuth, so a null here is purely defensive.
export async function accountId(req: FastifyRequest): Promise<string | null> {
  const token = readSsoCookie(req.headers.cookie);
  if (!token) return null;
  const claims = await verifySsoSession(token, config.ssoSecret);
  return claims?.sub ?? null;
}
