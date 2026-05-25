# negativezero

Self-hosted services platform for the `negativezero.one` apex. Monorepo
holding the landing page, the bookmark manager, the admin tool, and the
platform infrastructure (Logto identity, nginx site configs, deploy
script). Hosted on a single Vultr VPS alongside unrelated tenants
(wellfit, isgroup-one, amethyst). Postgres for Logto runs as a local
container on the VPS for now; migration to Neon (per DECISIONS.md) is
deferred until Phase 2 (Logto integration into the apex services).
For the live deployed state, ops procedures, and known issues, read
`HANDOVER.md` at the repo root.

**Stack:** Logto (Go, MPL-2.0) for identity, backed by Postgres (local
container today, Neon planned); Node 20 + Fastify + TypeScript +
better-sqlite3 + React 18 (Vite, Tailwind) for the bookmark manager
and admin; static HTML for the landing; nginx on apex; Docker Compose
+ Let's Encrypt; deployed to a shared Ubuntu VPS.

## Repository layout

```
apps/
  landing/              static landing page (negativezero.one/)
  bookmark-manager/     bookmark service (negativezero.one/services/bookmark-manager/)
  admin/                registration-code generator (negativezero.one/services/admin/)
platform/
  docker-compose.yml    orchestrates landing + bookmark-manager + admin + logto
  deploy.sh             idempotent deployer for the VPS
  nginx/                site configs for negativezero.one + auth.negativezero.one
  .env.template
docs/
  CLAUDE.md             this file
  ARCHITECTURE.md       how the platform is built
  PLAN.md               active to-do + execution log
  DECISIONS.md          append-only architectural decisions
HANDOVER.md             current deployed state + ops procedures (no secrets)
```

Add new services as `apps/<name>/` + a service block in
`platform/docker-compose.yml` + an `nginx/` location block. The
deploy script is structured to absorb new services without changes.

## Working-memory files

This file is the entry point Claude Code reads when started in this
directory. It points at the three working-memory files that hold the
real project state. Read those before doing substantive work:

- **`ARCHITECTURE.md`** — how the platform is built. Stack details,
  components, URL layout, OIDC flow, data model per service, deployment
  topology. Updated when the architecture meaningfully changes.

- **`PLAN.md`** — the active to-do and execution log. Current focus,
  phased plan with status markers, blockers, recently completed items,
  open questions. **Read this first when picking up the project.**

- **`DECISIONS.md`** — append-only log of architectural decisions. Each
  entry records the decision, alternatives considered, the reasoning,
  and what would invalidate it. Most recent on top.

The four files together form the project's persistent working memory.

## History

This monorepo was created on 2026-05-21 by merging three predecessor
repositories under `chocolatebrownie250`:

- `negativezero` — the static design experiments. Of the six sketches,
  option 03 (hypotrochoid / spirograph, dark) was selected as the
  landing; the others were discarded.
- `url-vault` (commit `f4c857c`) — the bookmark manager. Brought in
  under `apps/bookmark-manager/` and rewired to mount at
  `/services/bookmark-manager/` instead of the old `/bookmarks-pro/`.
- `negativezero-services` (commit `cdfd534`) — the platform shell
  (Logto + infra). Brought in under `platform/` and `docs/`.

Git history of the three predecessor repos is preserved upstream; the
merge here is a clean snapshot to avoid polluting the new repo with
revoked credentials previously committed to url-vault's HANDOVER.md.
