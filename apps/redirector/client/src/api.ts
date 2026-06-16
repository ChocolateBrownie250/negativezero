export class UnauthorizedError extends Error {
  constructor() {
    super('unauthorized');
    this.name = 'UnauthorizedError';
  }
}

// Vite injects BASE_URL based on the `base` config. In prod =
// /services/redirector/, in dev = /. We strip the leading '/' from the
// supplied path and concatenate so calls land at <base>api/... — the nginx in
// front strips the prefix before reaching the server, so the server still sees
// /api/... unchanged.
const API_BASE = import.meta.env.BASE_URL;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = API_BASE + (path.startsWith('/') ? path.slice(1) : path);
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

export type Redirect = {
  id: string;
  slug: string;
  target: string;
  title: string | null;
  hits: number;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
};

// The shareable link a hash resolves to. BASE_URL already ends with a slash.
export function redirectUrl(slug: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${API_BASE}${slug}`;
}

export const api = {
  me: () =>
    request<{ authenticated: boolean; hasPasskey: boolean }>('/api/auth/me'),
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
      args: { setupCode?: string; backupCode?: string } = {},
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
  redirects: {
    list: () => request<{ redirects: Redirect[] }>('/api/redirects'),
    create: (input: { target: string; title?: string }) =>
      request<{ redirect: Redirect }>('/api/redirects', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    update: (id: string, input: { target?: string; title?: string }) =>
      request<{ redirect: Redirect }>(
        `/api/redirects/${encodeURIComponent(id)}`,
        { method: 'PATCH', body: JSON.stringify(input) },
      ),
    remove: (id: string) =>
      request<{ ok: true }>(`/api/redirects/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
  },
};
