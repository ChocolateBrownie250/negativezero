# Contributing

How to work in the `negativezero` monorepo: the repo's shape, how to run
each service locally, and the branch/PR rules that keep production safe.

New to the platform? Read the working-memory docs first — start with
[`HANDOVER.md`](HANDOVER.md) (current deployed state + ops),
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (how it is built),
[`AGENTS.md`](AGENTS.md) (the contract for coding agents), and
[`docs/INDEX.md`](docs/INDEX.md) (a map of the whole `docs/` folder).

> **The one rule that matters most:** never push to `main`. Every merge to
> `main` auto-deploys to the production VPS. Always work on a branch and open
> a PR. See [Branch and PR workflow](#branch-and-pr-workflow).

---

## Repo shape

This is a monorepo of isolated services under `apps/`, plus the platform
infrastructure under `platform/` and the docs under `docs/`. There is
**no root workspace** — each service owns its own dependencies, build, tests,
and `Dockerfile`, and runs as its own Docker container behind one nginx on a
single VPS. One service, Amethyst (`tts`, at `/services/amethyst/`), is the
exception: its source lives in the separate `amethyst-independent` repo and this
platform consumes it as a prebuilt container image rather than building it from
`apps/`.

```
apps/
  landing/              static landing page                       → /
  bookmark-manager/     bookmark manager (Basalt)                 → /services/basalt/
  admin/                registration-code generator + SSO/authz hub → /services/admin/
  timezones/            gated cross-timezone planner               → /services/timezones/
  video-downloader/     clear-HLS remux tool                       → /services/video-downloader/
  redirector/           short-link redirects                       → /services/redirector/
  presentation-studio/  Citrine presentation builder PWA           → /services/citrine/
platform/
  docker-compose.yml    orchestrates all services (loopback-only ports)
  deploy.sh             idempotent VPS deployer (ports, nginx, certbot)
  nginx/                apex site config + shared maps
docs/                   architecture, deploy, decisions, runbook, plans
```

Each service mounts under `/services/<name>/`; the landing page is the apex
root. To add a service, see *Adding a service* in [`AGENTS.md`](AGENTS.md).

Per-service `README.md` files are the entry point for working on each service —
read `apps/<svc>/README.md` before changing a service.

---

## Local dev quickstart

Pick the stack that matches the service you are touching. The folder name does
not always match the URL (e.g. `apps/bookmark-manager/` serves
`/services/basalt/`, `apps/presentation-studio/` serves `/services/citrine/`).

### TypeScript services (Node 22 + Fastify + React/Vite)

Applies to `bookmark-manager`, `admin`, `redirector`, `timezones`,
`video-downloader`, and `presentation-studio`. Each is its own npm project with
`server/` (Fastify + TypeScript + better-sqlite3) and usually a `client/`
(React + Vite + Tailwind) workspace.

```bash
cd apps/<svc>
npm ci          # clean install from package-lock.json
npm run build   # typecheck + build client and server
npm -w server test   # run the server test suite
```

For an interactive dev loop, most TS services expose `npm run dev`
(concurrently runs the server and the Vite client). Use **Node 22** — it is in
lockstep with every Dockerfile and the CI matrix; older Node will fail the
build.

> Note: `presentation-studio` runs its tests with `npm run test` (not
> `npm -w server test`), and `admin` has no test suite yet — `npm run build`
> is the gate there.

### Amethyst (tts) — source lives in a separate repo

Amethyst's source (Python + FastAPI + aiosqlite, Whisper + Llama via Groq,
vanilla-JS PWA) is **no longer in this repo**. It lives in the
`amethyst-independent` repo (under `web/`, alongside a sibling macOS desktop
edition), which is the source of truth for the app. This platform consumes the
web edition as a prebuilt container image
(`ghcr.io/chocolatebrownie250/amethyst-web`), wired in as the `tts` service in
`platform/docker-compose.yml`.

To change the app (transcription, cleanup, PWA, its tests), work in
`amethyst-independent` and publish a new image. In **this** repo you only touch
the deploy wiring: `platform/docker-compose.yml`, `platform/deploy.sh`, and
`platform/.env.template`. See DECISIONS.md 2026-06-29 for the extraction
rationale.

### Static services (landing + timezones client)

`apps/landing/` is a single `index.html` with vanilla HTML/CSS/JS and **no
build step** — open `apps/landing/index.html` in a browser, or serve the folder
with any static server:

```bash
cd apps/landing && python3 -m http.server 8000   # then open http://localhost:8000
```

The `timezones` service ships a vanilla client shell in
`apps/timezones/public/` (served by its Fastify backend); preview the static
shell the same way, but note the live service needs the backend running for the
SSO gate and per-account presets.

---

## Branch and PR workflow

**PR-only. Never push to `main`.** Every merge to `main` triggers
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which rsyncs the
tree to the production VPS and runs `platform/deploy.sh` there. A push to `main`
is a production deploy.

1. Branch off `main`. Feature branches use a short, descriptive slug
   (e.g. `docs/<topic>`, `feat/<topic>`, `claude/<short-slug>` for agent work).
2. Commit with **Conventional Commits** — `feat:`, `fix:`, `refactor:`,
   `docs:`, `chore:`, `ci:`, `infra:`. Use the imperative mood and a
   lowercase prefix. Scope when it helps: `docs(contributing): …`.
3. Open a PR against `main` (`gh pr create`). Keep PRs **tightly scoped** —
   other automated agents may be working in parallel, so a small, focused diff
   avoids conflicts and keeps reviews fast.
4. Let CI go green, then merge. Merging is what deploys; do not also push to the
   box by hand.

If your change needs a human operator step that can't run from CI (DNS, the
Groq console, a passkey registration, a secret rotation), list those steps
explicitly in the PR description — see *What requires the human operator* in
[`AGENTS.md`](AGENTS.md).

### CI runs per-service via path filters

Each service has its own workflow gated by a `paths:` filter, so a PR that only
touches `apps/<svc>/**` runs that service's workflow and nothing else. A PR
touching `platform/**` runs the platform workflow; one touching `**/*.md` runs
the docs link-check. This keeps unrelated services from blocking your PR.

---

## Conventions

- **No secrets in the repo — ever.** This repo contains zero secrets by design.
  All secret material lives only in `platform/.env` on the VPS (`chmod 600`);
  only `platform/.env.template` is tracked. Secrets are generated at first
  deploy by `platform/deploy.sh` or supplied by the operator (e.g.
  `GROQ_API_KEY`). Two secret scanners (gitleaks + TruffleHog) gate every PR —
  never paste a secret into a commit, a PR, or chat. If one leaks, rotate it.
- **Centralized auth/authz.** There is no central identity provider. Each TS
  service uses its own WebAuthn passkeys; `admin` is the single SSO hub and the
  authority for per-account, per-service authorization (checked live over the
  internal docker network, revocable within ~30s). The `tts` machine clients
  use a Bearer API key. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and
  [`HANDOVER.md`](HANDOVER.md) for the full model.
- **TypeScript + Fastify is the default** for new server code, and now the rule
  for everything in this repo — the Python + FastAPI exception left with Amethyst
  when its source moved to the `amethyst-independent` repo (consumed here only as
  an image). Don't introduce a new framework, ORM, or frontend stack without a
  [`docs/DECISIONS.md`](docs/DECISIONS.md) entry. `docs/DECISIONS.md` is
  append-only — reverse a decision with a new entry, never by editing history.
- **Per-service READMEs are the entry point** for each service. Read
  `apps/<svc>/README.md` first.
- **No backwards-compat shims and no comments restating obvious code.** This is
  a single-tenant platform; prefer changing the code over carrying compatibility
  layers. See the *Conventions* section of [`AGENTS.md`](AGENTS.md) for the bar.

---

## CI overview

All workflows live in [`.github/workflows/`](.github/workflows/). Service
workflows run on PRs (and pushes to `main`) only when their paths change;
`docs`, `security`, and `deploy` are broader.

| Workflow | Trigger (paths) | What it gates |
|---|---|---|
| `deploy.yml` | push to `main`, manual dispatch | **Deploys to production** — rsyncs the tree to the VPS and runs `platform/deploy.sh`. The only workflow that mutates prod. |
| `bookmark-manager.yml` | `apps/bookmark-manager/**` | npm ci, typecheck + build, server tests, Docker image build + startup smoke; guards against `/bookmarks-pro/` reappearing. |
| `admin.yml` | `apps/admin/**` | npm ci, typecheck + build, Docker image build + startup smoke. No test step yet (no tests). |
| `redirector.yml` | `apps/redirector/**` | npm ci, typecheck + build, server tests, Docker image build + startup smoke. |
| `timezones.yml` | `apps/timezones/**` | npm ci, typecheck + build, server tests, vanilla client lints, Docker image build + health smoke. |
| `presentation-studio.yml` | `apps/presentation-studio/**` | npm ci, typecheck + build, tests, npm audit, Docker image build + health smoke (Citrine). |
| `landing.yml` | `apps/landing/**` | HTML lint, referenced-fonts-exist check, and the outbound `/services/basalt/` link guard. No build step. |
| `platform.yml` | `platform/**` | shellcheck, `docker compose config` validation, `nginx -t` on the rendered site config, and a deploy.sh root-guard dry run. |
| `docs.yml` | `**/*.md` | lychee offline link-check across `AGENTS.md TODO.md docs/*.md apps/**/*.md` plus an inline-code path existence check. |
| `security.yml` | every PR + push + weekly cron | gitleaks (full-history secrets), TruffleHog (PR diff, verified), and npm audit (fails only on critical). |

> The `tts` and `video-downloader` services have no dedicated workflow today.
> The `docs.yml` link-check runs over the doc set above (it does **not** include
> this file or the root `README.md`), so links added in `docs/*.md` must point
> at files that already exist on the branch.
