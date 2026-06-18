// authz.ts — per-service authorization against the admin service.
//
// Admin is the source of truth for "may account X use service Y". We ask it over
// the internal docker network (guarded by the shared SSO secret) and cache the
// answer briefly so a toggle in admin takes effect within ~TTL seconds without a
// network round-trip on every request.
import { config } from '../config.js';

const TTL_MS = 30_000;
// On an admin outage we keep serving the last good answer up to this long so a
// transient blip doesn't lock everyone out; after that we fail closed.
const STALE_MS = 10 * 60_000;

type Entry = { allowed: boolean; fetchedAt: number };
const cache = new Map<string, Entry>();

export async function isServiceAllowed(accountId: string, service: string): Promise<boolean> {
  // Not configured → preserve the pre-authz behaviour (any valid SSO is allowed).
  if (!config.adminAuthzUrl) return true;

  const k = `${accountId}:${service}`;
  const now = Date.now();
  const hit = cache.get(k);
  if (hit && now - hit.fetchedAt < TTL_MS) return hit.allowed;

  try {
    const url =
      `${config.adminAuthzUrl}/api/internal/authz` +
      `?account=${encodeURIComponent(accountId)}&service=${encodeURIComponent(service)}`;
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${config.ssoSecret}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`authz ${res.status}`);
    const body = (await res.json()) as { allowed?: boolean };
    const allowed = body.allowed === true;
    cache.set(k, { allowed, fetchedAt: now });
    return allowed;
  } catch {
    // Serve a recent cached answer through a brief outage; otherwise deny.
    if (hit && now - hit.fetchedAt < STALE_MS) return hit.allowed;
    return false;
  }
}
