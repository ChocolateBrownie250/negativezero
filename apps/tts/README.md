# Amethyst

[![Deploy](https://github.com/ChocolateBrownie250/amethyst/actions/workflows/deploy.yml/badge.svg)](https://github.com/ChocolateBrownie250/amethyst/actions/workflows/deploy.yml)

Voice-to-text dictation service:

- **iPhone Shortcut** — record audio with a Back-Tap or Action Button, get the
  transcript dropped into the clipboard within seconds.
- **PWA** — record long-form on any device, browse history with full-text search,
  edit the personal glossary.
- **Open API** — any other script can hit `/api/v1/transcribe` with a `Bearer`
  token and get the same pipeline.

Pipeline: client uploads audio → Groq Whisper transcribes → Groq Llama corrects
recognition errors using a glossary (CNCF + IT terms baked in, plus your own
additions) → result returned and stored. SQLite for metadata + FTS5 search,
audio kept on disk with a configurable retention window.

## Architecture

```
iPhone Shortcut ─┐
                 │  POST /api/v1/transcribe (multipart, Bearer)
PWA ─────────────┼──► Caddy (TLS) ──► FastAPI ──► Groq Whisper
                 │                       │
External script ─┘                       └──► Groq Llama (cleanup)
                                         │
                                         └──► SQLite (text + metadata)
                                              + audio files on disk
```

## Repo layout

```
backend/
  Dockerfile
  app/
    main.py             FastAPI app, lifespan, static PWA mount
    config.py           env-driven settings (pydantic-settings)
    db.py               aiosqlite helpers
    schema.sql          tables + FTS5 + triggers
    auth.py             Bearer-token guard
    groq_client.py      Whisper + LLM cleanup
    glossary.py         load/merge built-in + personal glossary
    glossary_data/
      builtin.json      CNCF + IT terms (core ≤224 tokens, extended unlimited)
    storage.py          audio file paths + retention purge
    models.py           pydantic response models
    routes/
      transcribe.py     POST /transcribe
      transcriptions.py GET/DELETE list/detail/audio + recleanup
      settings.py       GET/PATCH glossary
pwa/
  index.html, app.js, styles.css, sw.js, manifest.webmanifest, icon.svg
caddy/
  Caddyfile
docker-compose.yml
.env.example
```

## API surface

```
POST   /api/v1/transcribe                 multipart/form-data
GET    /api/v1/transcriptions             ?limit=&cursor=&q=&source=
GET    /api/v1/transcriptions/{id}
DELETE /api/v1/transcriptions/{id}
GET    /api/v1/transcriptions/{id}/audio
POST   /api/v1/transcriptions/{id}/recleanup?cleanup_mode=light|standard|aggressive
GET    /api/v1/glossary
PATCH  /api/v1/glossary
GET    /api/v1/health
```

All routes except `/health` require `Authorization: Bearer <AMETHYST_API_KEY>`.

`POST /transcribe` form fields: `file` (required), `cleanup` (`true|false`),
`cleanup_mode` (`light|standard|aggressive`), `language` (`ru|en|auto`),
`model`, `cleanup_model`, `source` (free-form tag), `prompt` (extra Whisper
hint), `keep_audio` (default `true`).

## Deploy on a server you already own (nginx + Docker)

This is the recommended path: an existing Linux server with nginx in front,
Docker handling the app container, certbot for TLS. The included `install.sh`
does steps 4–8 automatically.

### 1. Set DNS

At your DNS provider, create an A record:

| Type | Name | Value |
|---|---|---|
| A | `@` (or your subdomain) | server's public IP (`curl -4 ifconfig.me` on the server) |

Set TTL to 600 while testing. Wait 1–10 minutes, then verify:

```bash
dig +short your-domain.com @8.8.8.8
```

### 2. Get the code on the server

Either push to a git host and `git clone` it, or:

```bash
# From your laptop:
tar czf /tmp/amethyst.tgz \
  --exclude=data --exclude=.env --exclude='__pycache__' --exclude='.venv' \
  -C path/to/Amethyst .
scp /tmp/amethyst.tgz user@server:/tmp/

# On the server:
mkdir -p ~/amethyst && cd ~/amethyst
tar xzf /tmp/amethyst.tgz
```

### 3. Configure .env

```bash
cp .env.example .env
echo "AMETHYST_API_KEY=$(openssl rand -hex 32)"   # copy this value
nano .env
```

Fill in:
- `GROQ_API_KEY` — from <https://console.groq.com/keys>
- `AMETHYST_API_KEY` — paste the openssl value
- `PUBLIC_HOST` — your domain (e.g. `negativezero.one`)
- `ACME_EMAIL` — your email (for Let's Encrypt)

### 4. Run the bootstrap

```bash
bash install.sh
```

The script:

1. Verifies `.env` has every required value.
2. Checks DNS for `$PUBLIC_HOST` resolves to this server (refuses to continue
   otherwise — Let's Encrypt will rate-limit you for an hour if it doesn't).
3. Installs Docker if missing; installs certbot if missing.
4. Drops `nginx/<host>.conf` into `/etc/nginx/sites-available/`, symlinks it,
   reloads nginx.
5. Runs `certbot --nginx -d $PUBLIC_HOST` — certbot edits the nginx file to
   add the HTTPS server block + redirect.
6. `docker compose up -d --build` — builds the FastAPI image and starts the
   container, bound to `127.0.0.1:8080` (only nginx can reach it).
7. Polls `https://$PUBLIC_HOST/api/v1/health` until it answers, then prints
   the URL and your API key.

Re-running `install.sh` is safe; every step is idempotent.

### 5. Set up the PWA

1. Open `https://<host>/` on phone or laptop.
2. **Settings**: leave API base URL empty, paste API key, **Save**,
   **Test connection** — should say "OK".
3. iPhone Safari → Share → **Add to Home Screen** — Amethyst becomes a
   stand-alone app icon.

### 6. Set up the iPhone Shortcut

See [`shortcuts/README.md`](shortcuts/README.md) — build it on the device in
~3 minutes.

## Standalone deploy (no nginx, bundled Caddy)

If you don't already have a reverse proxy, the repo also ships with a Caddy
container that does TLS itself. Edit `docker-compose.yml` to uncomment the
`caddy` service block and switch the `app` service from `ports: ["127.0.0.1:8080:8000"]`
to `expose: ["8000"]`. Then `docker compose up -d --build`. Caddy obtains
the cert from Let's Encrypt automatically and serves on 80/443.

This path is for fresh Linux VMs (Hetzner, Oracle, GCP, etc.) where Amethyst
is the only thing running on ports 80/443.

## Local development

```bash
# Backend (Python 3.11+)
pip install -e .[dev]
cp .env.example .env  # set GROQ_API_KEY and AMETHYST_API_KEY
mkdir -p data
DATA_DIR=./data DB_PATH=./data/amethyst.sqlite AUDIO_DIR=./data/audio \
  uvicorn app.main:app --reload --app-dir backend
```

PWA is served at <http://localhost:8000/>. To test without HTTPS, ignore the
SW registration warning — recording requires HTTPS or `localhost`.

## Costs

- **Oracle Cloud**: $0/month if you stay in Always Free.
- **Groq**: ~$0.04/hour audio transcribed, ~$0.0002 per cleanup pass.
  Personal use is pennies/month.
- **Domain (optional)**: $10–15/year, or $0 with `nip.io`.

## Migrating off Oracle later

Everything is stateless except `./data`. To move:

```bash
# On the old host
docker compose down
tar czf data.tgz data/

# On the new host
git clone … && cd amethyst
tar xzf data.tgz   # restores ./data
cp .env .  # or recreate
docker compose up -d --build
```

Update DNS, you're done.

## Operational notes

- **Audio retention**: text is permanent, audio files are auto-purged after
  `AUDIO_RETENTION_DAYS` (default 90). Set to 0 to keep forever.
- **Audio limit**: Groq Whisper rejects files over 25 MB. Caddy is configured
  to refuse uploads >30 MB to fail fast.
- **Backup**: copy `data/amethyst.sqlite*` periodically. SQLite WAL mode is
  safe to copy live; for a clean snapshot run
  `sqlite3 data/amethyst.sqlite ".backup data/backup.sqlite"`.
