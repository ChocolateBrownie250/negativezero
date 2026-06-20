// ssoSession.ts — cross-service SSO: a single apex-wide `nz_session` JWT cookie.
// admin mints it on passkey login; every service accepts it. HS256 with the
// shared SSO_SESSION_SECRET used verbatim as the HMAC key, so Node (jose) and
// Python (PyJWT) agree byte-for-byte. (Copied verbatim from the other services.)
import { jwtVerify } from 'jose';

export const SSO_COOKIE = 'nz_session';
const ALG = 'HS256';

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export type SsoClaims = { sub: string; name?: string; iat?: number };

// Returns the account claims for a valid token, or null. Authentication (a
// valid signature) is separate from authorization (which services the account
// may use) — the latter is enforced per-service via the admin authz endpoint.
export async function verifySsoSession(
  token: string,
  secret: string,
): Promise<SsoClaims | null> {
  // Fail closed: with an empty secret, jwtVerify would trust an empty HMAC key
  // and accept forged cookies. No secret ⇒ SSO cookie auth is disabled here.
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: [ALG] });
    if (typeof payload.sub !== 'string' || !payload.sub) return null;
    const name = typeof payload.name === 'string' ? payload.name : undefined;
    const iat = typeof payload.iat === 'number' ? payload.iat : undefined;
    return { sub: payload.sub, name, iat };
  } catch {
    return null;
  }
}

// Read the nz_session value from a raw Cookie header (no @fastify/cookie needed).
export function readSsoCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  const m = cookieHeader.match(/(?:^|;\s*)nz_session=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : undefined;
}
