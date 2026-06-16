# HANDOVER

State of the `negativezero` platform as of 2026-05-28. This file
contains zero secrets by design — secret material lives only in
`/srv/negativezero/platform/.env` on the VPS (chmod 600) and in the
operator's password manager.

The predecessor `url-vault/HANDOVER.md` was excluded from the monorepo
merge because it had committed a plaintext VPS root password and bookmark
setup code. This file is the no-secrets replacement.

---

## Deployed surface

```
https://negativezero.one/                            → static landing
https://negativezero.one/services/bookmark-manager/  → bookmark-manager SPA + API
https://negativezero.one/services/admin/             → admin (registration-code generator)
https://negativezero.one/services/tts/               → tts PWA + API (Bearer-authed)
https://negativezero.one/services/timezones/         → static cross-timezone planner
https://negativezero.one/services/video-downloader/  → video-downloader SPA + API (clear-HLS remux)
https://negativezero.one/services/redirector/        → redirector SPA + API (short-link redirects)
https://negativezero.one/services/redirector/<hash>  → public 302 redirect (16-char hash)
https://negativezero.one/vtt-transcriber/            → 301 redirect → /services/tts/
                                                       (legacy URL, kept for old iPhone Shortcuts)
```

All containers bind `127.0.0.1` only; nginx on the host fronts everything
on 443/80 (Let's Encrypt). The TLS cert renews via certbot's systemd
timer.

### Container map

```
negativezero-landing            nginx:alpine                       127.0.0.1:3020→80
negativezero-bookmark-manager   platform-bookmark-manager:latest   127.0.0.1:3021→3000
negativezero-admin              platform-admin:latest              127.0.0.1:3022→3000
negativezero-tts                platform-tts:latest                127.0.0.1:3023→3000
negativezero-timezones          nginx:alpine                       127.0.0.1:3024→80
negativezero-video-downloader   platform-video-downloader:latest   127.0.0.1:3025→3000
negativezero-redirector         platform-redirector:latest         127.0.0.1:3026→3000
```

Loopback ports are re-derived by `platform/deploy.sh` on every run from
`ss -ltnp`, so the exact numbers above can drift after a re-deploy. The
nginx file always reflects current ports because `deploy.sh` substitutes
them on install.

---

## VPS

- **Host:** Vultr VPS, IP `45.76.88.245`, hostname `wellfit4u`, Ubuntu
  with Docker 29.5 + Compose v5.1.3 + nginx 1.24 + certbot 2.9.
- **Shared with other tenants** — `wellfit`, `isgroup-one`. Their
  containers, nginx files, and data directories are off-limits.
- **SSH access** — root via `~/.ssh/wellfit_prod_ed25519` from the
  operator's mac. Key fingerprint and provisioning are out of scope
  for this doc; if you're holding the key you have access.
- **Deploy root** — `/srv/negativezero/` (this repo, checked out on
  the host).

---

## Authentication state

**Bookmark-manager and admin** each use their own self-contained
passkey auth (WebAuthn + setup-code + backup-code flow). They do not
share identity; a passkey registered against one does not log into
the other.

On first deploy, `platform/deploy.sh` generates a one-time setup code
per service and prints it to stdout. Operator registers a passkey
using that code, then gets a backup code (also shown once) for
recovery.

If the operator missed those codes during the deploy and **no passkey
has been registered yet** for the service, the recovery is:

1. `ssh root@45.76.88.245`
2. `rm /srv/negativezero/platform/.env`
3. `bash /srv/negativezero/platform/deploy.sh`

This regenerates all per-service secrets, including fresh setup codes
printed at the end of the run. **Don't do this if a passkey has already
been registered** — the new SESSION_SECRET will invalidate sessions,
the new ENCRYPTION_KEY will make any existing bookmark data
unreadable, and the new SETUP_CODE_HASH won't matter because the
existing passkey is what's protecting the service.

After the first passkey is registered, the setup code is dormant and
not needed again. Use the backup code to add a new device / recover
from a lost passkey, or have `admin` issue a fresh registration code.

**tts** uses a single Bearer API key (`TTS_API_KEY` in `platform/.env`,
auto-generated on first deploy). Clients (iPhone Shortcut, PWA
settings, external scripts) put this in their `Authorization: Bearer
...` header. To rotate: edit `platform/.env`, `docker compose restart
tts`, update every client.

---

## Architecture quick reference

Full details in `docs/ARCHITECTURE.md`; pointer list here:

- **Monorepo layout** — `apps/{landing,bookmark-manager,admin,tts,timezones}/` +
  `platform/{docker-compose.yml,deploy.sh,nginx/}` + `docs/`.
- **No central identity provider.** Per-service WebAuthn for the TS
  services; Bearer API key for tts. Earlier plans for Logto were
  reversed 2026-05-28 — see DECISIONS.md.
- **Path-mount** — services live under `/services/<name>/`. nginx
  strips the prefix (trailing slash on both `location` and `proxy_pass`).
  Container sees clean root paths; the Vite build bakes the prefix back
  into asset URLs for the TS services. The tts PWA and the timezones
  planner use relative URLs, so no client-side base config is needed.
- **Per-service storage** — bind-mounted `platform/data/<service>/`.
  Each contains one or two SQLite files plus (for tts) an `audio/`
  cache directory. Owned by UID 999 (the container `app` user) for
  all services. Backup = snapshot a directory tree.
- **TLS** — one cert on the apex (`negativezero.one`). certbot's
  systemd timer renews it.

---

## Common operations

### Deploy an update from the operator's mac

```bash
# from the local repo on `main`
cd ~/.../negativezero-local
rsync -av -e "ssh -i ~/.ssh/wellfit_prod_ed25519" \
  --exclude='.git/' --exclude='node_modules/' --exclude='dist/' \
  --exclude='platform/.env' --exclude='platform/.env.local' \
  --exclude='platform/data/' --delete-after \
  ./ root@45.76.88.245:/srv/negativezero/

ssh -i ~/.ssh/wellfit_prod_ed25519 root@45.76.88.245 \
  'cd /srv/negativezero && bash platform/deploy.sh'
```

`deploy.sh` rebuilds landing + bookmark-manager + admin + tts + timezones
and re-installs the apex nginx file. If `GROQ_API_KEY` is empty in
`platform/.env`, tts is skipped (the apex still deploys cleanly);
paste the Groq key and re-run to bring tts up.

### Inspect state

```bash
ssh -i ~/.ssh/wellfit_prod_ed25519 root@45.76.88.245
cd /srv/negativezero

# containers
docker compose -f platform/docker-compose.yml ps

# logs
docker compose -f platform/docker-compose.yml logs -f bookmark-manager
docker compose -f platform/docker-compose.yml logs -f admin
docker compose -f platform/docker-compose.yml logs -f tts

# restart a single service (e.g. after editing .env)
docker compose -f platform/docker-compose.yml --env-file platform/.env \
    restart tts

# nginx
sudo nginx -t
sudo systemctl reload nginx
sudo tail -f /var/log/nginx/access.log
```

### Boot survival

The compose stack comes back on reboot via a systemd unit
`negativezero-compose.service` — a `oneshot` that runs
`docker compose up -d` after `docker.service`, so the services return even
if the stack was torn down before the reboot. It is up-only: `systemctl
stop` does *not* tear the stack down (use `docker compose down`). The unit
is tracked at `platform/negativezero-compose.service` and installed by
`deploy.sh`. Full details: RUNBOOK.md → *Boot survival —
negativezero-compose.service*.

### Issue a new registration code via admin

1. Sign in at `https://negativezero.one/services/admin/`.
2. Pick the target service from the dropdown, optional label, click
   *Generate*. Copy the **code** (for the new user) and the **bcrypt
   hash** (for the operator).
3. On the VPS: edit `platform/.env`, replace `<SERVICE>_SETUP_CODE_HASH=`
   with the new hash. **Escape every `$` to `$$`** (compose's env-file
   interpolation will chop the hash otherwise — `deploy.sh` does this
   automatically on first-run, but a manual paste needs it manually).
4. `docker compose ... restart <service>`.
5. Give the plaintext code to the new user; they register at the
   service's login screen.

### Rotate the tts API key

```bash
ssh root@45.76.88.245
cd /srv/negativezero
# generate a new key
NEW=$(openssl rand -hex 32)
sed -i "s|^TTS_API_KEY=.*|TTS_API_KEY=$NEW|" platform/.env
docker compose -f platform/docker-compose.yml --env-file platform/.env restart tts
echo "new key: $NEW"
# update the iPhone Shortcut + PWA settings + any scripts before the
# old key falls out of memory
```

### Add a new service `apps/<name>/`

Steps from `AGENTS.md` (kept consistent here as a reminder):

1. `apps/<name>/` with a Dockerfile listening on `$PORT`.
2. `platform/docker-compose.yml` — service block.
3. `platform/nginx/negativezero.one.conf` — `location /services/<name>/`
   block with `proxy_pass http://127.0.0.1:__<NAME>_HOST_PORT__/;`
   (trailing slash).
4. `platform/.env.template` — `<NAME>_SESSION_SECRET=` (or
   service-appropriate secret) and any per-service vars.
5. `platform/deploy.sh` — generate the secret, pick a free port, add the
   placeholder substitution to `install_site()`.
6. Frontend (if any): set Vite `base` to `/services/<name>/`.
7. Add the service name to `apps/admin/server/src/routes/codes.ts`
   `SERVICES` whitelist so admin can issue codes for it.
8. `bash platform/deploy.sh`.
9. Update `docs/ARCHITECTURE.md`, append a `DECISIONS.md` entry if the
   service brings new deps or breaks a convention (e.g., language).

---

## Backups

The only persistent state on the VPS that's ours and that matters:

```
/srv/negativezero/platform/data/bookmark-manager/   # bookmarks.db + WAL
/srv/negativezero/platform/data/admin/              # admin.db + WAL
/srv/negativezero/platform/data/tts/                # amethyst.sqlite + audio/ cache
/srv/negativezero/platform/data/video-downloader/   # video-downloader.db + WAL
/srv/negativezero/platform/data/redirector/         # redirector.db + WAL
/srv/negativezero/platform/.env                     # secrets (chmod 600)
```

**Off-host backup script** lives at `platform/backup.sh` and ships an
all-state tarball to either an S3 bucket or a remote rsync target.
**Not scheduled yet** — operator wires `/etc/negativezero-backup.env`
on the VPS with `BACKUP_S3_URI=…` or `BACKUP_RSYNC_DEST=…` and adds
a cron entry. Full setup in `docs/RUNBOOK.md` → *Schedule automatic
backups*.

Quick on-demand snapshot to your laptop (no setup required):

```bash
rsync -av -e "ssh -i ~/.ssh/wellfit_prod_ed25519" \
  root@45.76.88.245:/srv/negativezero/platform/data/ \
  ~/.../backups/negativezero/$(date +%F)/
```

Note: tts audio cache can grow large (each clip is 1-25 MB and they
accumulate for `AUDIO_RETENTION_DAYS` days, default 90). Consider
excluding `data/tts/audio/` if backup size becomes a concern — the
SQLite metadata is always tiny.

---

## Open work / Phase pointers

For the strategic view see `docs/PLAN.md`. Quick pointers:

- **Phase 1 — first deploy.** Done 2026-05-22. Landing +
  bookmark-manager + admin reachable, TLS active. Amethyst was a
  cohabiting tenant at the time at `/vtt-transcriber/`.
- **Phase 2 — tts absorbed.** In progress 2026-05-28. Amethyst pulled
  into `apps/tts/`, deployed via this monorepo at `/services/tts/`,
  legacy URL `/vtt-transcriber/` kept as a 301. Logto + Neon
  (previously planned for Phase 2) dropped; the existing per-service
  WebAuthn flow stays.
- **Phase 3 — admin edits tts prompts.** Future. The cleanup and
  proofread system prompts that tts uses should be tunable from the
  admin UI without redeploying. Either an HTTP endpoint on tts that
  admin calls, or a shared SQLite both services mount. See PLAN.md.
- **Phase 4 — Polish.** Off-host backups, internal rename of
  bookmark-manager → Bismuth (working name; URL unchanged for
  client-side compatibility).

The admin service today is a **registration-code generator**. Future
expansion to start/stop/logs/inspect each service needs either a
docker socket bind-mount inside the admin container (security risk on
a shared VPS — not recommended) or a host-side daemon the admin calls
over a unix socket. Defer until there's a concrete need.

---

## Known things to be aware of

- **Dependabot major-bump backlog — cleared.** `undici 6 → 8` landed
  in #24 (manual redirect handling in `fetcher.ts`). The nine
  remaining major bumps (#32–#40: fastify 5, better-sqlite3 12, uuid
  14, dotenv 17, @simplewebauthn 13, lucide 1, vite 8, tailwindcss 4)
  were applied directly on `claude/bookmarks-manager-status-93fgU`
  and verified (build + server tests + runtime smoke). Those
  dependabot PRs are now superseded — close them after that branch
  merges. One follow-up remains: a **browser visual smoke test** of
  both SPAs (couldn't run headless in the agent sandbox) to confirm
  Tailwind 4 preflight defaults and the vite-8 admin dev server look
  right.

- **tts source is a clean import from the upstream amethyst repo.**
  No PR flow upstream; changes stay in this monorepo. If the upstream
  ever ships a worthwhile change, port it manually.

- **GROQ_API_KEY is operator-supplied.** First-run `deploy.sh` leaves
  `GROQ_API_KEY=` empty in `.env`; the tts container is deferred
  until a key is pasted in. Get one from
  https://console.groq.com/keys (free tier covers the personal-scale
  workload).

- **Container uptime clock** on the VPS is reported by Docker against
  the host clock — if the host clock drifts the container "Up X days"
  numbers won't match wall-clock. Not a real issue, just confusing.

---

## Contact / context

This file lives in the repo, so whoever has the repo has this. The
operator (`Igor`) holds the VPS SSH key and the GitHub credentials on
the `ChocolateBrownie250` account.
