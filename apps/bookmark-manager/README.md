# bookmark-manager

Single-user self-hosted bookmark service. Fastify + React, SQLite + at-rest
AES-256-GCM encryption, WebAuthn passkey auth.

This is one service in the `negativezero` monorepo. For the platform shape
— how this gets deployed, what fronts it, how secrets are generated — read:

- [`../../HANDOVER.md`](../../HANDOVER.md) — current deployed state and ops
- [`../../platform/deploy.sh`](../../platform/deploy.sh) — the actual deployer (idempotent)
- [`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) — platform architecture

Deployed at `https://negativezero.one/services/bookmark-manager/`.

## Layout

- `server/` — Fastify + better-sqlite3 + TypeScript. Owns: bookmark CRUD,
  folders, server-side metadata fetching (SSRF-guarded), AES-256-GCM
  at-rest encryption, WebAuthn flow, JSON import/export, full-text search.
- `client/` — React 18 + Vite + Tailwind. Apple HIG dark mode UI,
  PWA-installable on iOS.

Vite `base` is set to `/services/bookmark-manager/` so asset URLs include
the prefix; the platform nginx strips the prefix before proxying to the
container (trailing slash on both `location` and `proxy_pass`).

## Local dev

```bash
cd apps/bookmark-manager
npm install
npm run dev
```

Vite proxies `/api/*` to the Fastify server on `:3000`. Visit
http://localhost:5173.

You need a local `.env` for the server. Minimum:

```
SESSION_SECRET=<openssl rand -hex 32>
ENCRYPTION_KEY=<openssl rand -hex 32>
SETUP_CODE_HASH=<bcrypt of your one-time setup code, cost 12>
PUBLIC_URL=http://localhost:3000
```

Generate the bcrypt hash via:

```bash
npm -w server run hash-password "your-setup-code"
```

In production these are populated from `platform/.env` by `platform/deploy.sh`.

## Tests

```bash
npm -w server test       # vitest, one-shot
npm -w server run test:watch
```

Two test files today: `crypto.test.ts`, `nodes.test.ts`. Tests target the
server only — the React client has no test suite.

## Production

Built and deployed as part of the platform stack. There is **no
service-level deploy script**; `platform/deploy.sh` rebuilds the Docker
image, generates/preserves secrets in `platform/.env`, picks a free
loopback port, installs the nginx site file, and reloads.

The container listens on `127.0.0.1:3000`; nginx fronts it via the
path-mount at `/services/bookmark-manager/`. State (SQLite + WAL) lives
on a bind-mounted volume at `platform/data/bookmark-manager/`, owned by
UID 999 (container `app` user). Backup = snapshot that directory.

## Auth flow (WebAuthn passkeys + apex SSO)

First-time setup: the user redeems a one-time setup code (issued by the admin
service) → registers a passkey via WebAuthn → the server stores the credential
in SQLite. After registration the user gets a one-time backup code for recovery
from passkey loss.

Two session paths are accepted:
- **Per-service cookie** — a WebAuthn assertion signs a cookie scoped to
  `/services/bookmark-manager/` (the local fallback).
- **Apex SSO** — admin is the platform SSO hub; after signing in there the
  browser carries a shared `nz_session` JWT (HS256 over `SSO_SESSION_SECRET`)
  that this service verifies. *Whether* an account may use this service is
  decided per-request by admin's authorization endpoint (`ADMIN_AUTHZ_URL`), so
  access is granted/revoked centrally and takes effect immediately.

> An earlier plan to move auth onto Logto/OIDC was **reversed** — see
> [`../../docs/DECISIONS.md`](../../docs/DECISIONS.md) (2026-05-28). The WebAuthn +
> apex-SSO model above is the durable design, not a placeholder.

## Environment variables

| Var               | Required | Description                                                                                              |
| ----------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `SESSION_SECRET`  | yes      | 32-byte hex (`openssl rand -hex 32`). Signs session cookies.                                             |
| `ENCRYPTION_KEY`  | yes      | 32-byte hex. AES-256-GCM at-rest encryption of bookmark URLs/names. Rotating = existing data unreadable. |
| `SETUP_CODE_HASH` | yes      | bcrypt(setup-code, cost 12). Dormant after the first passkey is registered.                              |
| `PUBLIC_URL`      | yes      | Full URL the app is reached at. Used for cookie scoping and WebAuthn RP origin.                          |
| `SSO_SESSION_SECRET` | no    | Shared apex-SSO HMAC secret. Set ⇒ accept admin's `nz_session` cookie; empty ⇒ SSO off (local cookie only). |
| `ADMIN_AUTHZ_URL` | no       | admin's internal base URL (e.g. `http://admin:3000`) for per-account authz. Empty ⇒ check skipped (legacy allow). |
| `PORT`            | no       | Listen port. Default 3000.                                                                               |
| `DATA_DIR`        | no       | SQLite directory. Default `/app/data` in container, `./data` locally.                                    |

Bcrypt hash values get `$` → `$$` escaped automatically when written into
`platform/.env` by the deployer — Docker Compose's env-file pass does
variable interpolation on the value, which would otherwise chop the hash.

## Security notes

- **At-rest encryption** of URLs, names, and favicon URLs in SQLite
  (AES-256-GCM). Server can decrypt anyone's bookmarks; admin-visibility
  is a stated requirement — see
  [`../../docs/DECISIONS.md`](../../docs/DECISIONS.md) for the trade-off.
- **SSRF guard** in `server/src/lib/ssrf.ts` — hostnames resolving to
  private / loopback / link-local IPs are rejected, re-checked after
  redirects.
- **HTML body** capped at 1 MB; titles and `<link rel="icon">` parsed
  from `<head>` only.
- **URL normalization**: schemeless input becomes `https://`. Non-http(s)
  schemes are rejected.
- **Cookie** is `HttpOnly`, `SameSite=Lax`, 30-day max age, `Secure` in
  production. `Lax` (not `Strict`) keeps the session alive across "tap
  link → back to app" on iOS PWAs.
- **iOS-only**: bookmark links use the `x-safari-https://` scheme to
  escape in-app webviews (best-effort — Apple may change the behaviour).

## History

This service was the `url-vault` repo before the 2026-05-21 monorepo
merge. The path mount was rewired from `/bookmarks-pro/` to
`/services/bookmark-manager/`. Auth and crypto flows are unchanged from
`url-vault` v1; what changed is the URL prefix, the deploy script
(`platform/deploy.sh` instead of `scripts/deploy.sh`), and the env var
naming (`SETUP_CODE_HASH` instead of `ADMIN_PASSWORD_HASH`).
