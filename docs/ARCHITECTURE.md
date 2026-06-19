# Architecture

Full technical architecture of the negativezero platform. Update this
when the architecture meaningfully changes — new component, replaced
dependency, storage model change, deployment target shift. Not a daily
file.

For day-to-day status and what's being worked on, see `PLAN.md`. For the
reasoning behind architectural choices, see `DECISIONS.md`.

---

## Stack

- **Landing:** static HTML/CSS/Canvas (apps/landing/). Hypotrochoid
  animation in vanilla JS. No build step.
- **Timezones:** static HTML/CSS/JS (apps/timezones/). Cross-timezone
  meeting planner; all timezone math is client-side via the `Intl` API.
  No backend, no build step.
- **Bookmark service backend:** Node 22 + Fastify 5 + TypeScript +
  better-sqlite3 12. SQLite file lives on the VPS via a bind-mount
  volume. Per-service WebAuthn + setup-code auth (no shared identity
  provider).
- **Bookmark service frontend:** React 18 + Vite 8 + Tailwind 4.
- **Admin backend:** Node 22 + Fastify 5 + TypeScript +
  better-sqlite3 12. Same shape as bookmark-manager, separate state.
  Single-purpose tool today: passkey-protected registration-code
  generator for other services. Future: per-service settings UI
  (e.g., cleanup/proofread prompts for tts).
- **Admin frontend:** React 18 + Vite 8 + Tailwind 4.
- **TTS service:** Python 3.12 + FastAPI + uvicorn + aiosqlite (with
  FTS5). Whisper transcription via Groq, LLM cleanup / proofreading
  via Groq Llama. PWA frontend is vanilla HTML/JS (no framework).
  Imported as-is from the upstream amethyst project; see
  DECISIONS.md 2026-05-28 entries on the absorption and the
  Python+FastAPI exception to the TS+Fastify convention.
- **Reverse proxy:** nginx on the host (shared with unrelated tenants).
  Containers bind to 127.0.0.1 only; nginx is the public entry point.
- **TLS:** Let's Encrypt via certbot, one cert on the apex
  (`negativezero.one`).
- **Containerization:** Docker + Docker Compose v2.
- **Host:** Vultr VPS, Ubuntu. Shared with unrelated tenants (wellfit,
  isgroup-one); this project's containers + nginx files coexist
  without touching their configs.

---

## Repository layout

```
apps/
  landing/              static landing page (negativezero.one/)
  bookmark-manager/     bookmark service  (negativezero.one/services/bookmark-manager/)
  admin/                registration-code generator (negativezero.one/services/admin/)
  tts/                  whisper + LLM cleanup pipeline (negativezero.one/services/amethyst/)
  timezones/            static cross-timezone planner (negativezero.one/services/timezones/)
  video-downloader/     clear-HLS remux tool (negativezero.one/services/video-downloader/)
  redirector/           short-link redirects (negativezero.one/services/redirector/)
platform/
  docker-compose.yml    orchestrates landing + bookmark-manager + admin + tts + timezones + video-downloader + redirector
  deploy.sh             idempotent deployer for the VPS
  nginx/                apex site config + shared connection_upgrade map
  .env.template         starting point for the deployed .env
docs/
  CLAUDE.md             entry point for Claude Code
  ARCHITECTURE.md       (this file)
  PLAN.md               active to-do
  DECISIONS.md          append-only decision log
  RUNBOOK.md            operator procedures
HANDOVER.md             current deployed state + ops procedures (no secrets)
AGENTS.md               contract for LLM coding agents (Claude, Cursor, Aider)
TODO.md                 granular session-actionable task list
```

Add a new service by creating `apps/<name>/`, adding a service block in
`platform/docker-compose.yml`, and adding an nginx location block in
`platform/nginx/negativezero.one.conf`. The deploy script is structured
to absorb new services without changes.

---

## Components

**`apps/landing/`** — pure static site. One `index.html`, three Geist
font files. Served by an `nginx:alpine` container; the host nginx
reverse-proxies `/` to it. No build, no JS framework, no runtime
dependencies. Canvas animation is vanilla JS with `prefers-reduced-motion`
respected.

**`apps/bookmark-manager/`** — single-user self-hosted bookmark service
(formerly the `url-vault` repo). Fastify backend + React SPA in one
Docker image. Owns: bookmark CRUD, folders, JSON import/export, server-
side title/favicon fetching (SSRF-guarded), at-rest AES-256-GCM
encryption of bookmark names/URLs, full-text search. Auth is its own
WebAuthn (passkey) flow with a one-time setup code. State is one
SQLite file on a bind-mount volume.

**`apps/admin/`** — platform-level admin tool. Fastify + React, same
shape as bookmark-manager. Today it's a passkey-protected
registration-code generator (operator generates a code for a service,
shares it with a new user, user registers a passkey using that code).
The service whitelist lives in `apps/admin/server/src/routes/codes.ts`.
Future expansion: per-service settings UI (e.g., editing the LLM
cleanup and proofread system prompts that tts uses).

**`apps/tts/`** — Whisper transcription + LLM cleanup/proofreading
pipeline. FastAPI backend, vanilla-JS PWA frontend, one container.
Owns: audio upload + retention purge, Groq Whisper transcription,
glossary-aware LLM cleanup, "polish" mode for stronger proofreading,
per-recording metadata + FTS5 search. Auth is a single Bearer API key
(operator-provisioned, used by the iPhone Shortcut + PWA). State is
one SQLite file plus an audio cache directory on a bind-mount volume.

**`apps/timezones/`** — static cross-timezone meeting planner. One
`index.html` + `styles.css` + `app.js`, sharing the Geist fonts with
the landing. No backend, no build, no runtime dependencies: the zone
catalogue comes from `Intl.supportedValuesOf('timeZone')` and all
offset/conversion math from `Intl.DateTimeFormat`. Lets you add cities,
pick a home zone, and read each zone's local time across the home day
with working-hours and overlap highlighting; preferences persist in
`localStorage`. Served by an `nginx:alpine` container with a read-only
bind-mount, same pattern as landing.

**`platform/`** — orchestration. `docker-compose.yml` defines landing
+ bookmark-manager + admin + tts + timezones. `deploy.sh` is the idempotent VPS
deployer (generates secrets, picks free ports, pulls/builds images,
installs nginx site files, runs certbot). `nginx/` holds the apex
site config + the shared `$connection_upgrade` map.

---

## URL layout

Everything lives under the apex with path-mount routing. nginx strips
the `/services/<name>/` prefix before proxying, so each container sees
clean root paths.

```
negativezero.one/                              → static landing (apps/landing)
negativezero.one/services/bookmark-manager/    → bookmark SPA
negativezero.one/services/bookmark-manager/api/...  → bookmark API
negativezero.one/services/admin/               → admin SPA + API
negativezero.one/services/amethyst/                 → tts PWA + API
negativezero.one/services/amethyst/api/v1/...       → tts API (Bearer-authed)
negativezero.one/services/timezones/           → static timezone planner
negativezero.one/services/video-downloader/    → video-downloader SPA + API
negativezero.one/services/redirector/          → redirector SPA + API
negativezero.one/services/redirector/<hash>    → public 302 redirect (16-char hash)
negativezero.one/vtt-transcriber/              → 301 redirect → /services/amethyst/
                                                  (legacy URL kept for old clients)
negativezero.one/services/<future>/            → future services (add a location block)
```

**Path-mount on services:** nginx strips the `/services/<name>/` prefix
before proxying to the upstream container. Both the `location` directive
and the `proxy_pass` target end in `/`, which makes nginx rewrite the
matched prefix to `/` for the upstream. For the SPA-bearing services
(bookmark-manager, admin), Vite's `base` config bakes the prefix back
into asset references in the bundle. For tts and timezones, the
frontend uses relative URLs, so no client-side base config is needed.

---

## Communication

- **Browser → nginx:** HTTPS (Let's Encrypt cert on `negativezero.one`).
- **nginx → landing container:** loopback HTTP on `LANDING_HOST_PORT`.
- **nginx → bookmark-manager:** loopback HTTP on `BOOKMARK_HOST_PORT`.
- **nginx → admin:** loopback HTTP on `ADMIN_HOST_PORT`.
- **nginx → tts:** loopback HTTP on `TTS_HOST_PORT`.
- **nginx → timezones:** loopback HTTP on `TIMEZONES_HOST_PORT`.
- **Browser ↔ bookmark-manager / admin:** HTTPS, session cookies
  (per-service `@fastify/secure-session`).
- **iPhone Shortcut / PWA ↔ tts:** HTTPS, `Authorization: Bearer
  <TTS_API_KEY>` on every `/api/v1/...` request.
- **tts → Groq (outbound):** HTTPS to the Groq API for Whisper
  transcription and Llama-based cleanup/proofreading.

---

## Data flow — bookmark / admin

First-time setup: user enters a service-specific setup code →
registers a passkey via WebAuthn → server stores credential in SQLite.
Subsequent sessions: WebAuthn assertion → server signs a session
cookie scoped to `/services/<name>/`. All reads/writes are
single-tenant.

For bookmark-manager: bookmark names + URLs are encrypted with the
server-side `BOOKMARK_ENCRYPTION_KEY` (AES-256-GCM) before being
stored in SQLite.

For admin: stores its own credentials + an audit log + a registration-
code table.

---

## Data flow — tts

1. Client (iPhone Shortcut, PWA, or external script) sends
   `POST /services/amethyst/api/v1/transcribe` with `Authorization: Bearer
   <TTS_API_KEY>` and a multipart audio body.
2. nginx strips the prefix; FastAPI receives `POST /api/v1/transcribe`.
3. Auth middleware checks the Bearer token against `AMETHYST_API_KEY`
   (env name kept upstream for source compatibility; mapped from
   `TTS_API_KEY` in compose).
4. Audio is forwarded to Groq Whisper. Glossary terms from
   `glossary_data/builtin.json` plus user-added entries seed the
   Whisper prompt.
5. Raw transcript goes through Groq Llama for cleanup, applying the
   glossary as ground truth for recognition errors.
6. Result + metadata stored in `/data/amethyst.sqlite` (FTS5 indexed).
   Audio file stored under `/data/audio/` for `AUDIO_RETENTION_DAYS`
   (default 90).
7. Response returned to the client.

Optional "polish" mode runs an additional LLM pass with a stronger
model (default `openai/gpt-oss-120b`) for proofreading-quality output.

---

## External dependencies

- **Vultr VPS** — single host. Hard dependency. Outage = everything
  goes down. No HA fallback at this scale.
- **Groq** — Whisper and Llama inference for tts. Hard dependency for
  the tts service only; bookmark-manager and admin work without it.
  Rate-limited per the Groq account tier.
- **Let's Encrypt** — TLS certs. Soft dependency at request time;
  certbot renews automatically every 60 days.
- **WebAuthn platform authenticators** (iCloud Keychain, Touch ID,
  Windows Hello) — passkey storage on user devices for bookmark and
  admin. If a user loses all passkey-storing devices, the backup code
  is the recovery path.
- **No third-party APIs in the bookmark-manager request path** —
  bookmark fetcher reaches arbitrary URLs to grab titles/favicons but
  those are user-initiated and SSRF-guarded.

---

## Key design decisions baked into the structure

Detailed reasoning lives in `DECISIONS.md`; this is the one-line
pointer list. Earlier decisions about Logto, Neon, and a separate
auth subdomain were reversed on 2026-05-28 — see the top of
DECISIONS.md.

- **Monorepo with apps/ + platform/ + docs/ layout.** Scales by
  adding directories, not restructuring. See DECISIONS.md 2026-05-21.
- **Path-mount everything under the apex.** No subdomain per service;
  one TLS cert, one DNS A record, one nginx site file. See
  DECISIONS.md 2026-05-21 (still in force; the Logto subdomain
  exception was removed when Logto was removed).
- **Per-service WebAuthn (no central identity).** Each service owns
  its own passkey + setup-code flow. Simpler than OIDC at single-user
  scale; if multi-user becomes a real need, re-introduce an identity
  layer. See DECISIONS.md 2026-05-28 "Logto removed from the platform".
- **Multi-account + per-service authorization (admin-owned).** The
  single-owner model was extended (2026-06-18) so the owner can invite
  friends via admin-generated setup keys and toggle each account's
  access per service. Admin owns the `accounts` table and is the SSO
  hub; the `nz_session` cookie carries the account id; gated services
  verify the cookie then ask admin `GET /api/internal/authz` (cached
  ~30s) whether the account may use that service. Amethyst's PWA dropped
  its API-key field in favour of this (the iPhone Shortcut Bearer key
  stays). See DECISIONS.md 2026-06-18.
- **Python + FastAPI exception for tts.** Net-new services still
  default to TS + Fastify; tts is the documented exception because
  rewriting a working imported service would burn weeks for no
  functional gain. See DECISIONS.md 2026-05-28.
- **Landing is one HTML file.** No build, no framework. Three fonts +
  ~80 lines of canvas JS. Anything more would be lifestyle, not need.
- **Per-service SQLite, bind-mounted.** Bookmark, admin, and tts each
  own their own SQLite file under `platform/data/<service>/`. Backup
  = snapshot a directory tree. See DECISIONS.md 2026-05-21.
- **Single server-side `ENCRYPTION_KEY` for bookmark data.** Server
  can decrypt all bookmarks. Accepted vs E2E because (a) it's
  single-tenant today, (b) "see my bookmarks across devices" requires
  it. See DECISIONS.md 2026-05-21.

---

## Deployment topology

```
Vultr VPS (Ubuntu)
│
├── nginx (system package, shared with other tenants)
│   ├── sites-available/negativezero.one          (apex: landing + /services/*)
│   ├── conf.d/negativezero-connection-upgrade.conf  (WebSocket upgrade map)
│   └── (other tenants' configs — untouched)
│
├── /srv/negativezero/  (deploy root — this repo, checked out on the VPS)
│   ├── platform/
│   │   ├── docker-compose.yml
│   │   ├── deploy.sh
│   │   ├── .env             (secrets — gitignored, generated on first deploy)
│   │   └── data/
│   │       ├── bookmark-manager/  (SQLite + WAL, bind-mounted)
│   │       ├── admin/             (SQLite + WAL, bind-mounted)
│   │       ├── tts/               (SQLite + WAL + audio/ cache, bind-mounted)
│   │       ├── video-downloader/  (SQLite + WAL, bind-mounted)
│   │       └── redirector/        (SQLite + WAL, bind-mounted)
│   ├── apps/landing/        (bind-mounted into nginx-alpine container)
│   ├── apps/bookmark-manager/  (built into image at deploy time)
│   ├── apps/admin/             (built into image at deploy time)
│   ├── apps/tts/               (built into image at deploy time)
│   ├── apps/video-downloader/  (built into image at deploy time)
│   └── apps/redirector/        (built into image at deploy time)
│
└── containers:
    ├── negativezero-landing            (nginx:alpine serving apps/landing/)
    ├── negativezero-bookmark-manager   (Fastify + built React, SQLite on volume)
    ├── negativezero-admin              (Fastify + built React, SQLite on volume)
    ├── negativezero-tts                (FastAPI + PWA, SQLite + audio on volume)
    ├── negativezero-video-downloader   (Fastify + built React, SQLite on volume)
    └── negativezero-redirector         (Fastify + built React, SQLite on volume)
```

Deploy flow (idempotent): `platform/deploy.sh` ensures `.env` exists
(generates per-service secrets + a fresh `TTS_API_KEY` on first run;
operator pastes `GROQ_API_KEY` separately), picks free loopback ports,
runs `docker compose up --build`, installs nginx site files
(substituting the actual loopback ports), runs `nginx -t`, reloads,
then certbot for TLS. Re-runnable any time; preserves all `.env`
secrets across re-runs.
