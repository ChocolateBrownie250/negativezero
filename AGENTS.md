# AGENTS.md

Entry point for LLM coding agents (Claude Code, Cursor, Aider, etc.)
working in this repository. Read this file first.

For Claude Code specifically there is also [`docs/CLAUDE.md`](docs/CLAUDE.md)
which Claude Code auto-loads; the two files share intent. This file is
the more general agent contract.

---

## What this repo is

A monorepo for the **negativezero** personal services platform.
Self-hosted on a single Vultr VPS, with a static landing at
`negativezero.one/`, a bookmark manager at
`negativezero.one/services/bookmark-manager/`, and a Logto-based
identity layer at `auth.negativezero.one/`. Postgres for Logto is
managed by Neon (external).

The repo grew out of merging three predecessor repos under
`chocolatebrownie250`: `negativezero` (design experiments),
`url-vault` (bookmark v1), `negativezero-services` (platform shell).
See [`docs/DECISIONS.md`](docs/DECISIONS.md) for why the merge
happened.

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

**"I need to add a new service"** → see *Adding a service* below.

**"I need to change how things deploy"** →
`platform/docker-compose.yml`, `platform/deploy.sh`,
`platform/nginx/`. The deploy script is idempotent — re-runnable
without side effects.

---

## Conventions

### Code

- **TypeScript everywhere** for new server/client code. No untyped JS
  files in new code; existing ones may stay until touched.
- **Fastify for backend services.** Don't introduce Express, Hono,
  Koa, etc. without a recorded DECISIONS.md entry.
- **better-sqlite3 for per-service storage.** Don't introduce Prisma,
  Knex, Drizzle, etc. unless a service genuinely needs an ORM.
- **React + Vite + Tailwind for frontends.** No alternate frameworks
  without a DECISIONS.md entry.
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
  `BOOKMARK_SETUP_CODE_HASH`.
- Must be supplied by operator: `DATABASE_URL` (Neon).
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

- Anything touching the **Vultr VPS** (SSH, deploys)
- Anything touching **Neon** (project creation, connection string)
- **DNS changes** at GoDaddy
- **Logto Admin Console** clicks (creating OIDC apps, setting up
  redirect URIs)
- **Secret rotation** (VPS root password, GitHub tokens)

When you finish work that requires one of the above, leave a note in
the PR description listing exactly what the operator has to do, in
order, with concrete commands.

---

## Do-not-touch list

- Other tenants on the VPS (wellfit, isgroup-one, amethyst). Their
  nginx files in `/etc/nginx/sites-available/` are off-limits.
- url-vault's git history on GitHub — kept as the historical archive
  of the bookmark-manager's predecessor. Don't try to back-port
  changes; just work in this monorepo.
- `docs/DECISIONS.md` past entries — append-only.
