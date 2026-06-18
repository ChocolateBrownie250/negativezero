// ssoSession.ts — cross-service SSO: a single apex-wide `nz_session` JWT cookie.
// admin mints it on passkey login; every service accepts it as an alternative
// to its own @fastify/secure-session (which stays as a fallback). HS256 with
// the shared SSO_SESSION_SECRET used verbatim as the HMAC key, so Node (jose)
// and Python (PyJWT) agree byte-for-byte.
import { SignJWT, jwtVerify } from 'jose';

export const SSO_COOKIE = 'nz_session';
const ALG = 'HS256';
export const SSO_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function mintSsoSession(secret: string): Promise<string> {
  return new SignJWT({ sub: 'owner', roles: ['owner'] })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${SSO_MAX_AGE_S}s`)
    .sign(key(secret));
}

export type SsoClaims = { sub: string; name?: string; iat?: number };

// Returns the account claims for a valid token, or null. Authentication (a
// valid signature) is separate from authorization (which services the account
// may use) — the latter is enforced per-service via the admin authz endpoint.
export async function verifySsoSession(
  token: string,
  secret: string,
): Promise<SsoClaims | null> {
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
