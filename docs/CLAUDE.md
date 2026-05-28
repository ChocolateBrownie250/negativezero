# negativezero

Self-hosted services platform for the `negativezero.one` apex. Monorepo
holding the landing page, the bookmark manager, the admin tool, the
tts (Whisper transcription + LLM cleanup) service, and the platform
infrastructure (nginx site config, deploy script). Hosted on a single
Vultr VPS alongside unrelated tenants (wellfit, isgroup-one). For the
live deployed state, ops procedures, and known issues, read
`HANDOVER.md` at the repo root.

**Stack:** Node 22 + Fastify 5 + TypeScript + better-sqlite3 12 +
React 18 (Vite 8, Tailwind 4) for the bookmark manager and admin;
Python 3.12 + FastAPI + aiosqlite + Groq (Whisper + Llama) for tts;
static HTML for the landing; nginx on apex; Docker Compose +
Let's Encrypt; deployed to a shared Ubuntu VPS. Auth is per-service
WebAuthn (passkey) with a one-time setup code; tts uses a Bearer API
key. No central identity provider — earlier plans for Logto were
reversed 2026-05-28 (see DECISIONS.md).

## Repository layout

```
apps/
  landing/              static landing page (negativezero.one/)
  bookmark-manager/     bookmark service  (negativezero.one/services/bookmark-manager/)
  admin/                registration-code generator (negativezero.one/services/admin/)
  tts/                  whisper + LLM cleanup pipeline (negativezero.one/services/tts/)
platform/
  docker-compose.yml    orchestrates landing + bookmark-manager + admin + tts
  deploy.sh             idempotent deployer for the VPS
  nginx/                apex site config + shared connection_upgrade map
  .env.template
docs/
  CLAUDE.md             this file
  ARCHITECTURE.md       how the platform is built
  PLAN.md               active to-do + execution log
  DECISIONS.md          append-only architectural decisions
  RUNBOOK.md            operator procedures (deploys, rotations, recovery)
AGENTS.md               contract for LLM coding agents (Claude, Cursor, Aider)
HANDOVER.md             current deployed state + ops procedures (no secrets)
TODO.md                 granular session-actionable task list
```

Add new services as `apps/<name>/` + a service block in
`platform/docker-compose.yml` + an `nginx/` location block. The
deploy script is structured to absorb new services without changes.
The TS + Fastify stack is the default for new services; tts is the
documented Python + FastAPI exception (see AGENTS.md + DECISIONS.md
2026-05-28).

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
  (originally Logto + infra). Brought in under `platform/` and
  `docs/`. Logto was later removed (DECISIONS.md 2026-05-28); the
  `negativezero-services` repo was archived and deleted.

On 2026-05-28 the Amethyst transcription service (`/opt/amethyst/` on
the VPS, previously at `/vtt-transcriber/`) was absorbed into the
monorepo as `apps/tts/`. The legacy URL stays as a 301 redirect for
existing iPhone Shortcuts.

Git history of the three predecessor repos is preserved upstream; the
merge here is a clean snapshot to avoid polluting the new repo with
revoked credentials previously committed to url-vault's HANDOVER.md.
