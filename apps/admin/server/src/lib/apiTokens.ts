// apiTokens.ts — long-lived per-account API tokens for machine clients
// (currently only the iPhone Shortcut against tts). The token is a JWT signed
// with the shared SSO secret so the consuming service verifies it the same way
// as the SSO cookie; this row holds only metadata + the revocation flag. The
// row id is the JWT `jti`, so revoking the row invalidates the token.
import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { db, type ApiTokenRow } from '../db.js';

// Far-future expiry; real lifecycle is controlled by revoked_at, not exp.
const API_TOKEN_MAX_AGE_S = 60 * 60 * 24 * 3650; // ~10 years

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function mintApiToken(opts: {
  accountId: string;
  name: string;
  service: string;
  label: string | null;
  secret: string;
}): Promise<{ id: string; token: string }> {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO api_tokens (id, account_id, service, label, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, opts.accountId, opts.service, opts.label, Date.now());

  const token = await new SignJWT({ name: opts.name, scope: 'api', svc: opts.service })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(opts.accountId)
    .setJti(id)
    .setIssuedAt()
    .setExpirationTime(`${API_TOKEN_MAX_AGE_S}s`)
    .sign(key(opts.secret));

  return { id, token };
}

export type ApiTokenInfo = {
  id: string;
  service: string;
  label: string | null;
  createdAt: number;
  lastUsed: number | null;
  revoked: boolean;
};

export function listApiTokens(accountId: string): ApiTokenInfo[] {
  const rows = db
    .prepare('SELECT * FROM api_tokens WHERE account_id = ? ORDER BY created_at DESC')
    .all(accountId) as ApiTokenRow[];
  return rows.map((r) => ({
    id: r.id,
    service: r.service,
    label: r.label,
    createdAt: r.created_at,
    lastUsed: r.last_used,
    revoked: r.revoked_at != null,
  }));
}

export function revokeApiToken(accountId: string, tokenId: string): boolean {
  const res = db
    .prepare('UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND account_id = ? AND revoked_at IS NULL')
    .run(Date.now(), tokenId, accountId);
  return res.changes > 0;
}

// Used by the internal authz endpoint: is this token (jti) still usable?
// Returns 'active' | 'revoked' | 'missing'. Touches last_used when active.
export function apiTokenState(jti: string): 'active' | 'revoked' | 'missing' {
  const row = db.prepare('SELECT revoked_at FROM api_tokens WHERE id = ?').get(jti) as
    | { revoked_at: number | null }
    | undefined;
  if (!row) return 'missing';
  if (row.revoked_at != null) return 'revoked';
  db.prepare('UPDATE api_tokens SET last_used = ? WHERE id = ?').run(Date.now(), jti);
  return 'active';
}
