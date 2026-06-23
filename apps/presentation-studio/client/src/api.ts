export class UnauthorizedError extends Error {
  constructor() {
    super('unauthorized');
    this.name = 'UnauthorizedError';
  }
}

// Vite injects BASE_URL based on the `base` config. In prod =
// /services/citrine/,
// in dev = /. We strip the leading '/' from the supplied path and concatenate
// so calls land at <base>api/... — the nginx in front strips the prefix before
// reaching the server, so the server still sees /api/... unchanged.
const API_BASE = import.meta.env.BASE_URL;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = API_BASE + (path.startsWith('/') ? path.slice(1) : path);
  // Fastify 5 rejects an empty body when content-type is application/json.
  // Only declare JSON when this request actually sends a body.
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
  presentation: {
    validate: (document: unknown) =>
      request<{
        valid: boolean;
        diagnostics: Array<{ level: 'error' | 'warning'; path: string; message: string }>;
        stats: { scenes: number; elements: number; actions: number };
      }>('/api/presentation/validate', {
        method: 'POST',
        body: JSON.stringify({ document }),
      }),
  },
  // Server-side, owner-scoped saved presentations (cross-device persistence).
  presentations: {
    list: () =>
      request<{
        presentations: Array<{ id: string; title: string; updatedAt: number }>;
      }>('/api/presentations'),
    create: (document: unknown) =>
      request<{ id: string; title: string; updatedAt: number }>('/api/presentations', {
        method: 'POST',
        body: JSON.stringify({ document }),
      }),
    get: (id: string) =>
      request<{ id: string; title: string; document: unknown; updatedAt: number }>(
        `/api/presentations/${encodeURIComponent(id)}`,
      ),
    save: (id: string, document: unknown) =>
      request<{ ok: true; title: string; updatedAt: number }>(
        `/api/presentations/${encodeURIComponent(id)}`,
        { method: 'PUT', body: JSON.stringify({ document }) },
      ),
    remove: (id: string) =>
      request<{ ok: true }>(`/api/presentations/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
  },
};
