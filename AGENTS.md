# AGENTS.md

Entry point for LLM coding agents (Claude Code, Cursor, Aider, etc.)
working in this repository. Read this file first.

For Claude Code specifically there is also [`docs/CLAUDE.md`](docs/CLAUDE.md)
which Claude Code auto-loads; the two files share intent. This file is
the more general agent contract.

---

## What this repo is

A monorepo for the **negativezero** personal services platform.
Self-hosted on a single Vultr VPS. Everything lives under the apex
`negativezero.one/`:

- `/` — static landing
- `/services/basalt/` — bookmark manager/Basalt (WebAuthn + SSO)
- `/services/bookmark-manager/` — 308 redirect to `/services/basalt/`
- `/services/admin/` — platform admin (registration-code generator,
  SSO/authz hub, future per-service settings UI)
- `/services/amethyst/` — Whisper transcription + LLM cleanup pipeline
  (SSO + Bearer API key for machine clients)
- `/services/timezones/` — gated cross-timezone planner with per-account presets
- `/services/video-downloader/` — clear-HLS remux tool
- `/services/redirector/` — short-link redirects
- `/services/citrine/` — Citrine web-native presentation builder PWA
- `/vtt-transcriber/` — 308 redirect to `/services/amethyst/` (legacy URL)

The repo grew out of merging three predecessor repos under
`chocolatebrownie250` on 2026-05-21: `negativezero` (design
experiments), `url-vault` (bookmark v1), `negativezero-services`
(platform shell that originally hosted Logto). Logto was removed
2026-05-28 in favour of per-service WebAuthn; the Amethyst
transcription service was absorbed the same day as `apps/tts/`. See
[`docs/DECISIONS.md`](docs/DECISIONS.md) for the merge rationale and
the 2026-05-28 entries for the more recent shape changes.

---

## Where to start — by task type

**"Where are we right now?"** → [`TODO.md`](TODO.md) for granular
tasks, [`docs/PLAN.md`](docs/PLAN.md) for the phased view.

**"How is this system built?"** → [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
Stack, components, URL layout, data flow, deployment topology.

**"Why was X done this way?"** → [`docs/DECISIONS.md`](docs/DECISIONS.md).
Append-only log, most recent on top.

**"I need to change the landing page"** → `apps/landing/index.html`.
One file, vanilla HTML/CSS/JS, no build.

**"I need to change the bookmark manager"** →
`apps/bookmark-manager/`. npm workspaces. Server is Fastify
TypeScript (`server/`); client is React + Vite + Tailwind (`client/`).
Dev: `cd apps/bookmark-manager && npm install && npm run dev`.

**"I need to change the admin"** → `apps/admin/`. Same structure as
bookmark-manager (Fastify + better-sqlite3 + WebAuthn on the server,
React + Vite + Tailwind on the client). Today it's a
passkey-protected registration-code generator; the gated service list
lives in `server/src/lib/accounts.ts`. Future expansion includes a
"tts prompts" page (see PLAN.md Phase 3) for editing the cleanup and
proofread system prompts that the tts service uses.

**"I need to change the tts service"** → `apps/tts/`. Python 3.12 +
FastAPI + aiosqlite, Whisper + Llama via Groq, vanilla-JS PWA. Source
layout: `backend/app/` for the FastAPI app, `pwa/` for the frontend,
`tests/` for pytest. Note: this is the Python exception to the
otherwise TS+Fastify convention (see *Conventions* + DECISIONS.md
2026-05-28). Don't rewrite to TS without a recorded decision.

**"I need to add a new service"** → see *Adding a service* below.

**"I need to change how things deploy"** →
`platform/docker-compose.yml`, `platform/deploy.sh`,
`platform/nginx/`. The deploy script is idempotent — re-runnable
without side effects.

---

## Conventions

### Code

- **TypeScript + Fastify is the default** for new server code. No
  untyped JS files in new code; existing ones may stay until touched.
  Don't introduce Express, Hono, Koa, etc. without a recorded
  DECISIONS.md entry.
- **Python + FastAPI is a documented exception** carried by
  `apps/tts/`. Don't extend it to new services without a recorded
  decision; default new services to TS + Fastify. See DECISIONS.md
  2026-05-28 "Python + FastAPI exception".
- **better-sqlite3 for per-service TS storage; aiosqlite for tts.**
  Don't introduce Prisma, Knex, Drizzle, SQLAlchemy, etc. unless a
  service genuinely needs an ORM.
- **React + Vite + Tailwind for TS frontends; vanilla JS PWA for
  tts.** No alternate frameworks without a DECISIONS.md entry.
- **No new comments by default.** Only add a comment when the *why* is
  non-obvious. Don't restate what well-named code already says, and
  don't tag comments to the current task ("added for X"). See
  existing files for the bar.
- **Don't add error handling for impossible cases.** Trust framework
  guarantees. Only validate at system boundaries.
- **Don't add backwards-compatibility shims.** This is a single-tenant
  platform; we can just change the code.

### Docs / working memory

- `CLAUDE.md`, `ARCHITECTURE.md`, `PLAN.md`, `DECISIONS.md` are the
  four working-memory files. Keep them consistent — if you change
  the architecture, update `ARCHITECTURE.md` in the same change.
- `TODO.md` is granular task tracking. Update its status markers as
  you work (`[ ]` → `[~]` → `[x]`), don't batch updates at the end.
- `DECISIONS.md` is **append-only**. To reverse a past decision, write
  a new entry referencing the old one. Don't edit history.

### Git / branches

- Feature work happens on `claude/<short-slug>` branches and is
  proposed via PR. The default branch is `main`.
- Commit messages: lowercase prefix `feat:` / `fix:` / `refactor:`
  / `docs:` / `infra:` / `chore:`. Use the imperative mood.
- Don't commit secrets. `platform/.env` is gitignored; only
  `.env.template` is tracked.

### Secrets

- Generated at first deploy by `platform/deploy.sh`:
  `BOOKMARK_SESSION_SECRET`, `BOOKMARK_ENCRYPTION_KEY`,
  `BOOKMARK_SETUP_CODE_HASH`, `ADMIN_SESSION_SECRET`,
  `ADMIN_SETUP_CODE_HASH`, `TTS_API_KEY`.
- Bcrypt hashes get `$` → `$$` escaped before being written to `.env`
  because docker compose re-interpolates env-file values when
  resolving `${VAR}` in the YAML.
- Must be supplied by operator (paste into `platform/.env` before
  re-running `deploy.sh`): `GROQ_API_KEY` (from
  https://console.groq.com/keys). The tts container won't start
  without it.
- Never paste secrets into chat. Never commit them. If they leak into
  conversation, advise the operator to rotate.

---

## Adding a service

1. Create `apps/<service-name>/` with a `Dockerfile` that listens on
   a port set by the `PORT` env var.
2. Add a service block to `platform/docker-compose.yml`:
   ```yaml
   <service-name>:
     build:
       context: ../apps/<service-name>
     container_name: negativezero-<service-name>
     restart: unless-stopped
     environment:
       PORT: "3000"
       # add your service's env vars here
     ports:
       - "127.0.0.1:${SERVICE_HOST_PORT:-3022}:3000"
     networks:
       - internal
   ```
3. Add an nginx location to `platform/nginx/negativezero.one.conf`:
   ```nginx
   location /services/<service-name>/ {
       proxy_pass http://127.0.0.1:__SERVICE_HOST_PORT__;
   }
   ```
4. Add env-var lines to `platform/.env.template`.
5. Update `apps/<service-name>/` to assume `base: /services/<service-name>/`
   in its frontend build config (if applicable).
6. Re-run `bash platform/deploy.sh` on the VPS.
7. Update `docs/ARCHITECTURE.md` and add a `DECISIONS.md` entry if
   the new service introduces a new dependency.

---

## What requires the human operator

These steps can't be completed from an agent session in this
container; they need a real shell / browser:

- Anything touching the **Vultr VPS** (SSH, deploys, `/srv/`,
  /opt/, /etc/nginx, /etc/letsencrypt)
- **DNS changes** at GoDaddy
- **Groq console** clicks (create / rotate `GROQ_API_KEY`)
- **First-time passkey registration** for bookmark-manager and admin
  (requires a real browser + an authenticator on a device)
- **Secret rotation** (VPS root password, GitHub tokens, GROQ_API_KEY)

When you finish work that requires one of the above, leave a note in
the PR description listing exactly what the operator has to do, in
order, with concrete commands.

---

## Do-not-touch list

- Other tenants on the VPS (wellfit, isgroup-one). Their nginx files
  in `/etc/nginx/sites-available/` are off-limits.
- url-vault's git history on GitHub — kept as the historical archive
  of the bookmark-manager's predecessor. Don't try to back-port
  changes; just work in this monorepo.
- The upstream amethyst repo on GitHub — `apps/tts/` is a clean
  import, not a fork with PRs flowing upstream. Changes here stay
  here.
- `docs/DECISIONS.md` past entries — append-only.
