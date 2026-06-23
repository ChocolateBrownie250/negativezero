import { config } from '../config.js';

export type AuthzDecision = 'allow' | 'deny' | 'reauth';

const lastGood = new Map<string, { decision: AuthzDecision; at: number }>();
const STALE_MS = 15_000;

export async function authorizeService(
  accountId: string,
  service: string,
  iatSeconds: number | undefined,
): Promise<AuthzDecision> {
  if (!config.adminAuthzUrl) return 'allow';

  const cacheKey = `${accountId}:${service}:${iatSeconds ?? ''}`;
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
    lastGood.set(cacheKey, { decision, at: Date.now() });
    return decision;
  } catch {
    const hit = lastGood.get(cacheKey);
    if (hit && Date.now() - hit.at < STALE_MS) return hit.decision;
    return 'deny';
  }
}
