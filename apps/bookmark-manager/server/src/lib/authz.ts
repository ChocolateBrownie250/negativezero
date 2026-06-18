// authz.ts — per-service authorization against the admin service.
//
// Admin is the source of truth for "may account X use service Y, and is this
// session still valid". We ask it over the internal docker network (guarded by
// the shared SSO secret) on EVERY protected request — no positive caching — so
// a revoke in admin takes effect immediately. We keep only a brief "last good"
// answer per key to ride out a transient admin blip; past that we fail closed.
import { config } from '../config.js';

export type AuthzDecision = 'allow' | 'deny' | 'reauth';

const lastGood = new Map<string, { decision: AuthzDecision; at: number }>();
const STALE_MS = 15_000;

export async function authorizeService(
  accountId: string,
  service: string,
  iatSeconds: number | undefined,
): Promise<AuthzDecision> {
  // Not configured → preserve the pre-authz behaviour (any valid SSO allowed).
  if (!config.adminAuthzUrl) return 'allow';

  const k = `${accountId}:${service}:${iatSeconds ?? ''}`;
  try {
    const url =
      `${config.adminAuthzUrl}/api/internal/authz` +
      `?account=${encodeURIComponent(accountId)}&service=${encodeURIComponent(service)}` +
      (iatSeconds ? `&iat=${iatSeconds}` : '');
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${config.ssoSecret}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`authz ${res.status}`);
    const body = (await res.json()) as { decision?: AuthzDecision };
    const decision: AuthzDecision =
      body.decision === 'allow' || body.decision === 'deny' || body.decision === 'reauth'
        ? body.decision
        : 'deny';
    lastGood.set(k, { decision, at: Date.now() });
    return decision;
  } catch {
    // Brief admin blip → serve the last good answer; otherwise fail closed with
    // 'deny' (block but keep the session, so it recovers without a re-login).
    const hit = lastGood.get(k);
    if (hit && Date.now() - hit.at < STALE_MS) return hit.decision;
    return 'deny';
  }
}
