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
- **Identity:** Logto (Go, MPL-2.0), v1.39+ — Core API, Admin API, and
  Admin Console UI all bundled in one image. Lives in a Docker container.
- **Identity database:** Postgres 16 on **Neon** (managed, external).
  Logto reaches it via `DATABASE_URL` (TLS-required). See DECISIONS.md
  "Postgres on Neon, not self-hosted".
- **Bookmark service backend:** Node 20 + Fastify + TypeScript +
  better-sqlite3. SQLite file lives on the VPS via a bind-mount volume.
- **Bookmark service frontend:** React 18 + Vite 5 + Tailwind 3.
- **Reverse proxy:** nginx on the host (shared with unrelated tenants).
  Containers bind to 127.0.0.1 only; nginx is the public entry point.
- **TLS:** Let's Encrypt via certbot, two certs (`negativezero.one` and
  `auth.negativezero.one`).
- **Containerization:** Docker + Docker Compose v2.
- **Host:** Vultr VPS, Ubuntu. Shared with other tenants (wellfit,
  isgroup-one, amethyst); this project's containers + nginx files
  coexist without touching their configs.

---

## Repository layout

```
apps/
  landing/              static landing page (Geist fonts + spirograph canvas)
  bookmark-manager/     bookmark service (was url-vault; rebased onto /services/bookmark-manager/)
platform/
  docker-compose.yml    orchestrates landing + bookmark-manager + logto
  deploy.sh             idempotent deployer for the VPS
  nginx/                site configs (apex + auth subdomain + connection-upgrade map)
  .env.template         starting point for the deployed .env
docs/
  CLAUDE.md             entry point for Claude Code
  ARCHITECTURE.md       (this file)
  PLAN.md               active to-do
  DECISIONS.md          append-only decision log
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
WebAuthn (passkey) flow today — Logto integration is **future work**;
see PLAN.md. State is one SQLite file on a bind-mount volume.

**`platform/`** — orchestration. `docker-compose.yml` defines landing
+ bookmark-manager + logto. `deploy.sh` is the idempotent VPS deployer
(generates secrets, pulls images, installs nginx site files, runs
certbot). `nginx/` holds the site configs that get installed into
`/etc/nginx/sites-available/` on the host.

**Logto** — runs from the `svhd/logto:1.39.0` image. No application
code in this repo for it; it's a black-box identity provider configured
via env vars. Connects to Neon Postgres via `DATABASE_URL`. Exposed at
`auth.negativezero.one`.

---

## URL layout

Identity provider lives on its own subdomain; services live under the
apex path-mount scheme. The split is deliberate: Logto's `ENDPOINT`
config is the OIDC issuer URL, and IdPs by design own a hostname
(standard pattern across Auth0/Okta/Clerk). Services are our own code
where path-mounting is clean. See DECISIONS.md "Logto lives on
auth.negativezero.one".

```
negativezero.one/                             → static landing (apps/landing)
negativezero.one/services/bookmark-manager/   → bookmark SPA
negativezero.one/services/bookmark-manager/api/...  → bookmark API (WebAuthn auth)
negativezero.one/services/<future>/           → future services (add a location block)

auth.negativezero.one/                        → Logto Core (sign-in experience)
auth.negativezero.one/.well-known/openid-configuration  → OIDC discovery
auth.negativezero.one/oidc/jwks               → JWKS for token verification
auth.negativezero.one/admin/                  → Logto Admin Console UI
```

**RP_ID isolation:** passkeys registered via Logto are bound to
`auth.negativezero.one`. Service domains (`negativezero.one`) cannot
impersonate or directly use those credentials — they only see the JWT
that Logto issues after a successful auth ceremony. This is a real
security boundary that path-mounting Logto under the same hostname as
services would not provide.

**Path-mount on services:** nginx strips the `/services/<name>/` prefix
before proxying to the upstream container. Both the `location` directive
and the `proxy_pass` target end in `/`, which makes nginx rewrite the
matched prefix to `/` for the upstream — same trick the retired
`/bookmarks-pro/` block used.

---

## Communication

- **Browser → nginx:** HTTPS (Let's Encrypt certs on `negativezero.one`
  and `auth.negativezero.one`).
- **nginx → landing container:** loopback HTTP on `LANDING_HOST_PORT`.
- **nginx → bookmark-manager:** loopback HTTP on `BOOKMARK_HOST_PORT`.
- **nginx → Logto:** loopback HTTP. Core on `LOGTO_CORE_HOST_PORT`,
  Admin on `LOGTO_ADMIN_HOST_PORT`.
- **Logto ↔ Neon Postgres:** outbound TLS over the public internet
  (sslmode=require). Connection string is `DATABASE_URL` in `.env`.
- **Browser ↔ bookmark-manager:** HTTPS, session cookies (current
  implementation uses url-vault's own WebAuthn + `@fastify/secure-session`).
  Switching to Logto-issued JWTs is on the roadmap; see PLAN.md.

---

## Data flow — current vs target

**Current (as merged from url-vault):** the bookmark-manager owns its
own auth. First-time setup: user enters a setup code → registers a
passkey via WebAuthn → server stores credential in SQLite. Subsequent
sessions: WebAuthn assertion → server signs a session cookie scoped to
`/services/bookmark-manager/`. All reads/writes are single-tenant.
Bookmark names + URLs are encrypted with the server-side
`ENCRYPTION_KEY` (AES-256-GCM) before being stored in SQLite.

**Target (post Logto integration, future work):** SPA delegates auth to
Logto via `@logto/react`. Login → OIDC code flow against
`auth.negativezero.one` → SPA receives JWT → calls bookmark-manager API
with `Authorization: Bearer <jwt>` → server validates against Logto
JWKS, extracts `sub`, scopes reads/writes by `user_id = sub`. Migration
requires changing the auth middleware in `apps/bookmark-manager/server/src/middleware/auth.ts`
and the SPA's `api.ts` + login flow.

---

## External dependencies

- **Vultr VPS** — single host. Hard dependency. Outage = everything
  goes down. No HA fallback at this scale.
- **Neon (Postgres)** — Logto's identity database. Hard dependency
  for the auth subdomain. Free-tier compute scales to zero on idle;
  Logto may cold-start slowly on first request after long quiet.
- **Let's Encrypt** — TLS certs. Soft dependency at request time;
  certbot renews automatically every 60 days.
- **WebAuthn platform authenticators** (iCloud Keychain, Touch ID,
  Windows Hello) — passkey storage on user devices. If a user loses
  all passkey-storing devices, the backup code is the recovery path.
- **No third-party APIs in the request path** — bookmark fetcher
  reaches arbitrary URLs to grab titles/favicons but those are
  user-initiated and SSRF-guarded.

---

## Key design decisions baked into the structure

Detailed reasoning lives in `DECISIONS.md`; this is the one-line
pointer list.

- **Monorepo with apps/ + platform/ + docs/ layout.** Scales by
  adding directories, not restructuring. See DECISIONS.md 2026-05-21.
- **Postgres on Neon, not self-hosted.** Removes a stateful container
  from the VPS; backups + HA are Neon's problem. Bookmark-manager
  keeps local SQLite because its data is single-tenant and tiny.
  See DECISIONS.md 2026-05-21.
- **Logto on a subdomain, services under the apex path.** The IdP
  needs an OIDC issuer URL (hostname-shaped); services are our code
  where `/services/<name>/` path-mounting is clean.
  See DECISIONS.md 2026-05-21.
- **Landing is one HTML file.** No build, no framework. Three fonts +
  ~80 lines of canvas JS. Anything more would be lifestyle, not need.
- **Single server-side `ENCRYPTION_KEY` for bookmark data.** Server
  can decrypt anyone's bookmarks. Accepted vs E2E because (a) it's
  single-tenant today, (b) "see my bookmarks across devices" requires
  it. See DECISIONS.md 2026-05-21.

---

## Deployment topology

```
Vultr VPS (Ubuntu)
│
├── nginx (system package, shared with other tenants)
│   ├── sites-available/negativezero.one          (apex: landing + /services/*)
│   ├── sites-available/auth.negativezero.one     (Logto)
│   ├── conf.d/negativezero-connection-upgrade.conf  (WebSocket upgrade map)
│   └── (other tenants' configs — untouched)
│
├── /srv/negativezero/  (deploy root — this repo, checked out on the VPS)
│   ├── platform/
│   │   ├── docker-compose.yml
│   │   ├── deploy.sh
│   │   ├── .env             (secrets — gitignored, generated on first deploy)
│   │   └── data/
│   │       └── bookmark-manager/  (SQLite + WAL files, bind-mounted)
│   ├── apps/landing/        (bind-mounted into nginx-alpine container)
│   └── apps/bookmark-manager/  (built into image at deploy time)
│
└── containers:
    ├── negativezero-landing            (nginx:alpine serving apps/landing/)
    ├── negativezero-bookmark-manager   (Fastify + built React, SQLite on volume)
    └── negativezero-logto              (svhd/logto:1.39.0 → Neon)

External:
    └── Neon Postgres (eu-central-1 or similar) — Logto's identity DB
```

Deploy flow (idempotent): `platform/deploy.sh` ensures `.env` exists
(generates per-service secrets on first run, prompts for
`DATABASE_URL` if missing), picks free loopback ports, runs
`docker compose up --build`, installs nginx site files (substituting
the actual loopback ports), runs `nginx -t`, reloads, then certbot for
TLS. Re-runnable any time; preserves all `.env` secrets across re-runs.
