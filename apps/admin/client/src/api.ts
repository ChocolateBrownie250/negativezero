export class UnauthorizedError extends Error {
  constructor() {
    super('unauthorized');
    this.name = 'UnauthorizedError';
  }
}

// Vite injects BASE_URL based on the `base` config. In prod = /services/admin/,
// in dev = /. We strip the leading '/' from the supplied path and concatenate
// so calls land at <base>api/... — the nginx in front strips the prefix before
// reaching the server, so the server still sees /api/... unchanged.
const API_BASE = import.meta.env.BASE_URL;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = API_BASE + (path.startsWith('/') ? path.slice(1) : path);
  // Only declare a JSON content-type when there's actually a body. Fastify 5
  // rejects an empty body when content-type is application/json with
  // FST_ERR_CTP_EMPTY_JSON_BODY (400) — which broke every bodyless POST here
  // (passkey login/options, logout, backup-code rotate). Fastify 4 tolerated it.
  const headers: Record<string, string> = {
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (init.body != null) headers['content-type'] = 'application/json';
  const res = await fetch(url, {
    ...init,
    credentials: 'include',
    headers,
  });
  if (res.status === 401) throw new UnauthorizedError();
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      // non-json response
    }
  }
  if (!res.ok) {
    const err = new Error(
      (json && typeof json === 'object' && 'error' in json
        ? String((json as { error: unknown }).error)
        : 'request_failed') + ` (${res.status})`,
    );
    (err as Error & { status?: number; payload?: unknown }).status = res.status;
    (err as Error & { status?: number; payload?: unknown }).payload = json;
    throw err;
  }
  return json as T;
}

export type GeneratedCodeLogEntry = {
  id: string;
  services: string[];
  name: string | null;
  createdAt: number;
  usedAt: number | null;
  accountId: string | null;
};

export type Account = {
  id: string;
  name: string;
  status: 'active' | 'disabled';
  isOwner: boolean;
  createdAt: number;
  services: Record<string, boolean>;
};

export type TokenInfo = {
  id: string;
  service: string;
  label: string | null;
  createdAt: number;
  lastUsed: number | null;
  revoked: boolean;
  revokedAt: number | null;
};

export const api = {
  me: () =>
    request<{
      authenticated: boolean;
      hasPasskey: boolean;
      isOwner: boolean;
      name: string | null;
      canAdmin: boolean;
    }>('/api/auth/me'),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  passkey: {
    loginOptions: () =>
      request<unknown>('/api/auth/passkey/login/options', { method: 'POST' }),
    loginVerify: (response: unknown) =>
      request<{ ok: true }>('/api/auth/passkey/login/verify', {
        method: 'POST',
        body: JSON.stringify({ response }),
      }),
    registerOptions: (
      args: { setupCode?: string; backupCode?: string; name?: string } = {},
    ) =>
      request<unknown>('/api/auth/passkey/register/options', {
        method: 'POST',
        body: JSON.stringify(args),
      }),
    registerVerify: (response: unknown, deviceName?: string) =>
      request<{ ok: true; backupCode: string | null }>(
        '/api/auth/passkey/register/verify',
        {
          method: 'POST',
          body: JSON.stringify({ response, deviceName }),
        },
      ),
    list: () =>
      request<{
        credentials: Array<{
          id: string;
          deviceName: string | null;
          createdAt: number;
          lastUsed: number | null;
        }>;
      }>('/api/auth/passkey/list'),
    remove: (id: string) =>
      request<{ ok: true }>(
        `/api/auth/passkey/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      ),
  },
  rotateBackupCode: () =>
    request<{ backupCode: string }>('/api/auth/backup-code/rotate', {
      method: 'POST',
    }),
  codes: {
    services: () => request<{ services: string[] }>('/api/codes/services'),
    generate: (services: string[], name?: string) =>
      request<{ services: string[]; name: string | null; code: string }>(
        '/api/codes/generate',
        {
          method: 'POST',
          body: JSON.stringify({ services, name }),
        },
      ),
    log: () =>
      request<{ codes: GeneratedCodeLogEntry[] }>('/api/codes/log'),
  },
  accounts: {
    list: () => request<{ accounts: Account[] }>('/api/accounts'),
    setService: (id: string, service: string, enabled: boolean) =>
      request<{ ok: true }>(
        `/api/accounts/${encodeURIComponent(id)}/service`,
        {
          method: 'POST',
          body: JSON.stringify({ service, enabled }),
        },
      ),
    setStatus: (id: string, status: 'active' | 'disabled') =>
      request<{ ok: true }>(
        `/api/accounts/${encodeURIComponent(id)}/status`,
        {
          method: 'POST',
          body: JSON.stringify({ status }),
        },
      ),
    remove: (id: string) =>
      request<{ ok: true }>(`/api/accounts/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    listTokens: (id: string) =>
      request<{ tokens: TokenInfo[] }>(
        `/api/accounts/${encodeURIComponent(id)}/tokens`,
      ),
    createToken: (id: string, label?: string) =>
      request<{
        id: string;
        service: string;
        label: string | null;
        token: string;
      }>(`/api/accounts/${encodeURIComponent(id)}/tokens`, {
        method: 'POST',
        body: JSON.stringify({ service: 'tts', label }),
      }),
    revokeToken: (id: string, tokenId: string) =>
      request<{ ok: true }>(
        `/api/accounts/${encodeURIComponent(id)}/tokens/${encodeURIComponent(
          tokenId,
        )}`,
        { method: 'DELETE' },
      ),
  },
};
