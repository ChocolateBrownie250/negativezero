# Citrine

Private web-native presentation editor for the negativezero platform.

Deployed at `https://negativezero.one/services/citrine/`.

## What it does

Citrine creates polished web presentations from reusable
premade elements. It is intentionally not a PowerPoint clone: V1 uses
responsive narrative scenes, semantic element anchors, hyperlink-style
actions, and transition choreography between scenes.

V1 keeps projects in browser local storage and supports JSON
import/export. Server-side saved projects and asset upload are deferred.

## Claude Design source

The intended seed source is:

`https://claude.ai/design/p/5d102e93-c0d0-47ef-9c69-fef1b0a646f4?file=ISG+Studio.html`

This worktree did not expose callable `claude_design` MCP tools, and direct
fetch receives a Cloudflare challenge. The user provided the downloaded Claude
Design archive instead:

`/Users/magic/Downloads/[Template] tech-architecture-slides (2).zip`

`ISG Studio.html` is imported under `server/imports/isg-studio/`,
along with its runtime tokens, texture asset, source JSX files, and
`import-manifest.json`. The editor opens it through the authenticated
route `/api/source/isg-studio/ISG%20Studio.html`.

Archive SHA-256:
`5d8bb2cc6a273db54122f60773e606a6cafa8e572cf056513b0fc9511eefdf65`

Imported HTML SHA-256:
`b62f71c5c132d0d66639cb8d83927146c7cac98463e2dda57e2a82bbd6d85783`

## Layout

- `server/` — Fastify + better-sqlite3 + TypeScript. Owns WebAuthn passkey
  auth, shared SSO acceptance, and document JSON validation.
- `client/` — React + Vite + Tailwind. Owns the scene editor, premade element
  registry, local persistence, preview mode, and import/export.

Vite `base` is `/services/citrine/`. Nginx strips that prefix
before proxying to the container.

## Local dev

```bash
cd apps/presentation-studio
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
| `SSO_SESSION_SECRET` | no | Shared apex SSO verifier. |
| `ADMIN_AUTHZ_URL` | no | Internal admin service URL for per-account service authorization. |
| `PORT` | no | Listen port. Default `3000`. |
| `DATA_DIR` | no | SQLite directory for auth metadata. |

In production these come from `platform/.env` via `platform/deploy.sh`.
