# redirector

Passkey-protected short-link redirect service for the negativezero platform.

Deployed at `https://negativezero.one/services/redirector/`.

## What it does

It's the bookmark manager turned inside out: instead of saving a link to
click later, you paste a destination URL and the service mints a permanent
short link to it. Each redirect is addressed by a 16-character hash that
lives directly under the service root:

```
https://negativezero.one/services/redirector/<16-char-hash>
```

Visiting that URL issues an HTTP 302 to the destination you set and bumps a
hit counter. The hash link is public and shareable; the management UI (list,
create, edit, delete) is behind the same WebAuthn passkey + apex SSO flow as
the platform's other private services.

## Layout

- `server/` — Fastify + better-sqlite3 + TypeScript. Owns WebAuthn passkey
  auth, the redirect CRUD API (`/api/redirects`), and the public redirect
  endpoint (`/:hash`).
- `client/` — React + Vite + Tailwind. Authenticated dashboard for managing
  redirects and copying their short links.

Vite `base` is `/services/redirector/`. Nginx strips that prefix before
proxying to the container, so the container sees clean root paths (`/`,
`/api/...`, `/<hash>`).

No target encryption and no outbound fetch: targets are public redirect
destinations, not secrets, and the server only emits a `Location` header —
the browser performs the navigation, so there's no SSRF surface.

## Local dev

```bash
cd apps/redirector
npm install
npm run dev
```

You need a local `.env` for the server:

```
SESSION_SECRET=<openssl rand -hex 32>
SETUP_CODE_HASH=<bcrypt of your setup code, cost 12>
PUBLIC_URL=http://localhost:3000
```

## Tests

```bash
npm -w server run test
npm run build
```

## Environment variables

| Var | Required | Description |
| --- | --- | --- |
| `SESSION_SECRET` | yes | 32-byte hex. Signs session cookies. |
| `SETUP_CODE_HASH` | yes | bcrypt setup-code hash. Dormant after the first passkey is registered. |
| `PUBLIC_URL` | yes | Full public URL. Used for cookie scoping and WebAuthn RP origin. |
| `SSO_SESSION_SECRET` | no | Shared apex SSO key; accepts the `nz_session` cookie minted by admin. |
| `PORT` | no | Listen port. Default `3000`. |
| `DATA_DIR` | no | SQLite directory. |

In production these come from `platform/.env` via `platform/deploy.sh`.
