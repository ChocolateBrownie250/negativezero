# negativezero

Self-hosted services platform for the **`negativezero.one`** apex — a single
monorepo holding a landing page and a set of small private services, all run as
Docker containers behind one nginx, on a single Vultr VPS shared with unrelated
tenants. Each service mounts under `/services/<name>/`; the landing page is the
apex root.

> **New here? Start with the working-memory docs**, in this order:
> [`HANDOVER.md`](HANDOVER.md) (current deployed state + ops),
> [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (how it's built),
> [`docs/DEPLOY.md`](docs/DEPLOY.md) (deploy runbook),
> [`docs/DECISIONS.md`](docs/DECISIONS.md) (why), and
> [`AGENTS.md`](AGENTS.md) (conventions for coding agents).
> **This repo contains zero secrets by design** — all secret material lives only
> in `platform/.env` on the VPS (`chmod 600`).

## Services

| Service | Path | Stack | Public? |
|---|---|---|---|
| **landing** | `/` | static HTML/CSS/JS (nginx) | public |
| **timezones** | `/services/timezones/` | static HTML/JS (Intl API) | public |
| **basalt** (bookmark-manager) | `/services/basalt/` | Fastify + React + SQLite (AES-256-GCM at rest) | passkey + SSO |
| **admin** | `/services/admin/` | Fastify + React + SQLite | passkey; **SSO + authz hub** |
| **tts** (Amethyst) | `/services/tts/` | FastAPI + Groq (Whisper + Llama) | passkey/SSO + Bearer key |
| **video-downloader** | `/services/video-downloader/` | Fastify + React + ffmpeg remux | passkey + SSO |
| **redirector** | `/services/redirector/` | Fastify + React + SQLite | passkey + SSO (hash redirect public) |

**Stacks:** Node 22 + Fastify 5 + TypeScript + better-sqlite3 + React 18 (Vite +
Tailwind) for the TS services; Python 3.12 + FastAPI + Groq for tts; static HTML
for landing + timezones. nginx on the apex; Docker Compose; Let's Encrypt TLS.

**Auth:** per-service WebAuthn passkeys plus an apex SSO hub — `admin` mints a
shared `nz_session` JWT and is the single authority for per-account, per-service
authorization (checked live, revocable instantly). No central IdP (an earlier
Logto plan was reversed — see `docs/DECISIONS.md`).

## Repository layout

```
apps/<name>/        one directory per service
platform/
  docker-compose.yml   orchestrates all 7 services (loopback-only ports)
  deploy.sh            idempotent VPS deployer (ports, nginx, certbot)
  nginx/               apex site config + shared maps
docs/                  ARCHITECTURE, DEPLOY, DECISIONS, PLAN, RUNBOOK, CLAUDE
HANDOVER.md            current deployed state + ops (no secrets)
AGENTS.md              contract for coding agents
```

## Run it

Production is updated by running [`platform/deploy.sh`](platform/deploy.sh) on
the VPS (it builds every service, picks free loopback ports, installs the nginx
site, and issues TLS). There is **no auto-deploy**; see
[`docs/DEPLOY.md`](docs/DEPLOY.md) for the exact runbook. For local development
of a single service, see that service's `apps/<name>/README.md`.

Add a service as `apps/<name>/` + a block in `platform/docker-compose.yml` + an
nginx `location` — the deploy script absorbs new services without changes. The
TS + Fastify stack is the default; tts is the documented Python exception
(`AGENTS.md`).
