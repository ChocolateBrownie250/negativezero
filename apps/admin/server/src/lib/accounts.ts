// accounts.ts — the account + per-service authorization model.
//
// Admin is the single source of truth for "which account may use which service".
// Every other service asks admin (via /api/internal/authz) and caches the answer.
import { db, type AccountRow } from '../db.js';

// Services that have a backend and are gated by an account. `landing` and
// `timezones` are public static sites with no auth, so they are not listed.
// Adding a new gated service to the platform means adding it here.
export const GATED_SERVICES = [
  'bookmark-manager',
  'video-downloader',
  'redirector',
  'tts',
  'admin',
] as const;

export type GatedService = (typeof GATED_SERVICES)[number];

export function isGatedService(v: unknown): v is GatedService {
  return typeof v === 'string' && (GATED_SERVICES as readonly string[]).includes(v);
}

export const OWNER_ACCOUNT_ID = 'owner';

export type AccountWithServices = {
  id: string;
  name: string;
  status: 'active' | 'disabled';
  isOwner: boolean;
  createdAt: number;
  services: Record<string, boolean>;
};

function servicesFor(accountId: string, isOwner: boolean): Record<string, boolean> {
  const rows = db
    .prepare('SELECT service, enabled FROM account_services WHERE account_id = ?')
    .all(accountId) as { service: string; enabled: number }[];
  const enabled = new Map(rows.map((r) => [r.service, r.enabled === 1]));
  const out: Record<string, boolean> = {};
  for (const svc of GATED_SERVICES) {
    // The owner implicitly has every service; friends default to off.
    out[svc] = isOwner ? true : enabled.get(svc) === true;
  }
  return out;
}

export function getAccount(id: string): AccountRow | undefined {
  return db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as
    | AccountRow
    | undefined;
}

export function listAccounts(): AccountWithServices[] {
  const rows = db
    .prepare('SELECT * FROM accounts ORDER BY is_owner DESC, created_at ASC')
    .all() as AccountRow[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    isOwner: r.is_owner === 1,
    createdAt: r.created_at,
    services: servicesFor(r.id, r.is_owner === 1),
  }));
}

export function createAccount(opts: {
  id: string;
  name: string;
  isOwner?: boolean;
  services?: string[];
}): void {
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO accounts (id, name, status, is_owner, created_at)
       VALUES (?, ?, 'active', ?, ?)`,
    ).run(opts.id, opts.name, opts.isOwner ? 1 : 0, Date.now());
    for (const svc of opts.services ?? []) {
      if (!isGatedService(svc)) continue;
      db.prepare(
        `INSERT INTO account_services (account_id, service, enabled)
         VALUES (?, ?, 1)
         ON CONFLICT(account_id, service) DO UPDATE SET enabled = 1`,
      ).run(opts.id, svc);
    }
  });
  tx();
}

export function setServiceAccess(accountId: string, service: string, enabled: boolean): void {
  const now = Date.now();
  // Disabling stamps revoked_at = now so any session whose token predates this
  // is forced to re-authenticate (and stays dead even after a later re-grant).
  // Enabling keeps the existing revoked_at, so the old session is NOT silently
  // resurrected — the user must log in again.
  db.prepare(
    `INSERT INTO account_services (account_id, service, enabled, revoked_at)
     VALUES (@acct, @svc, @enabled, @insertRevoked)
     ON CONFLICT(account_id, service) DO UPDATE SET
       enabled = excluded.enabled,
       revoked_at = CASE WHEN excluded.enabled = 0 THEN @now ELSE account_services.revoked_at END`,
  ).run({
    acct: accountId,
    svc: service,
    enabled: enabled ? 1 : 0,
    insertRevoked: enabled ? null : now,
    now,
  });
}

export function setAccountStatus(accountId: string, status: 'active' | 'disabled'): void {
  if (status === 'disabled') {
    // Invalidate every live session for this account immediately.
    db.prepare('UPDATE accounts SET status = ?, sessions_revoked_at = ? WHERE id = ?').run(
      'disabled',
      Date.now(),
      accountId,
    );
  } else {
    // Re-enabling does not clear sessions_revoked_at: pre-disable tokens stay
    // dead, so the user must log in again.
    db.prepare('UPDATE accounts SET status = ? WHERE id = ?').run('active', accountId);
  }
}

export function deleteAccount(accountId: string): void {
  // Cascade removes account_services; passkeys for the account go too.
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM credentials WHERE account_id = ?').run(accountId);
    db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId);
  });
  tx();
}

// Whether an account currently holds a service grant (ignores session timing).
// Used for admin's own gate and the UI's `canAdmin`.
export function isAllowed(accountId: string, service: string): boolean {
  const acct = getAccount(accountId);
  if (!acct || acct.status !== 'active') return false;
  if (acct.is_owner === 1) return true;
  if (!isGatedService(service)) return false;
  const row = db
    .prepare('SELECT enabled FROM account_services WHERE account_id = ? AND service = ?')
    .get(accountId, service) as { enabled: number } | undefined;
  return row?.enabled === 1;
}

export type AuthzDecision = 'allow' | 'deny' | 'reauth';

// The per-request decision used by the internal endpoint. `tokenIatMs` is the
// session token's issued-at in ms. Returns:
//   allow  — proceed
//   deny   — authenticated but not permitted this service (→ 403)
//   reauth — the session is stale/invalid and must log in again (→ 401)
export function authorize(accountId: string, service: string, tokenIatMs: number): AuthzDecision {
  const acct = getAccount(accountId);
  if (!acct) return 'reauth'; // unknown/deleted account → drop the cookie
  if (acct.status !== 'active') return 'reauth'; // disabled → forced logout
  if (acct.sessions_revoked_at && tokenIatMs < acct.sessions_revoked_at) return 'reauth';
  if (acct.is_owner === 1) return 'allow';
  if (!isGatedService(service)) return 'deny';
  const row = db
    .prepare(
      'SELECT enabled, revoked_at FROM account_services WHERE account_id = ? AND service = ?',
    )
    .get(accountId, service) as { enabled: number; revoked_at: number | null } | undefined;
  if (!row || row.enabled !== 1) return 'deny';
  if (row.revoked_at && tokenIatMs < row.revoked_at) return 'reauth';
  return 'allow';
}

// Idempotent: make sure an owner account exists. If passkeys predate the
// accounts table (single-owner deployments), adopt them under the owner.
export function ensureOwnerAccount(): void {
  const existing = getAccount(OWNER_ACCOUNT_ID);
  if (!existing) {
    createAccount({
      id: OWNER_ACCOUNT_ID,
      name: 'Owner',
      isOwner: true,
      services: [...GATED_SERVICES],
    });
  }
  // Any credential without a real account (legacy rows defaulted to 'owner')
  // is already pointed at the owner by the column default; nothing else to do.
}
