# HANDOVER

State of the `negativezero` platform as deployed on 2026-05-22. This file
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
https://negativezero.one/vtt-transcriber/            → Amethyst (other tenant, do not touch)
https://auth.negativezero.one/                       → Logto Core (sign-in)
https://auth.negativezero.one/admin/                 → Logto Admin Console
```

All containers bind `127.0.0.1` only; nginx on the host fronts everything
on 443/80 (Let's Encrypt). TLS certs renew via certbot's systemd timer.

### Container map

```
negativezero-landing            nginx:alpine                       127.0.0.1:3021→80
negativezero-bookmark-manager   platform-bookmark-manager:latest   127.0.0.1:3024→3000
negativezero-admin              platform-admin:latest              127.0.0.1:3025→3000
negativezero-logto              svhd/logto:1.39.0                  127.0.0.1:3012→3001, :3013→3002
negativezero-postgres           postgres:16                        internal only (logto's DB)
```

Loopback ports are re-derived by `platform/deploy.sh` on every run from
`ss -ltnp`, so the exact numbers above can drift after a re-deploy. Nginx
files always reflect current ports.

---

## VPS

- **Host:** Vultr VPS, IP `45.76.88.245`, hostname `wellfit4u`, Ubuntu
  with Docker 29.5 + Compose v5.1.3 + nginx 1.24 + certbot 2.9.
- **Shared with other tenants** — `wellfit`, `isgroup-one`, `amethyst`.
  Their containers, nginx files, and data directories are off-limits.
  Amethyst lives at `negativezero.one/vtt-transcriber/`, which is *our*
  apex site config but routes to *their* container — the location block
  is preserved across re-deploys by `platform/nginx/negativezero.one.conf`.
- **SSH access** — root via `~/.ssh/wellfit_prod_ed25519` from the
  operator's mac. Key fingerprint and provisioning are out of scope
  for this doc; if you're holding the key you have access.
- **Deploy root** — `/srv/negativezero/` (this repo, checked out on
  the host).

---

## Authentication state

**Both apex services use their own self-contained passkey auth** (the
same WebAuthn + setup-code + backup-code flow that `url-vault` shipped).
They do not yet talk to Logto — that's Phase 2 in `docs/PLAN.md`.

On first deploy, `platform/deploy.sh` generates a one-time setup code
per service and prints it to stdout. Operator registers a passkey using
that code, then gets a backup code (also shown once) for recovery.

If the operator missed those codes during the deploy and **no passkey
has been registered yet** for the service, the recovery is:

1. `ssh root@45.76.88.245`
2. `rm /srv/negativezero/platform/.env`
3. `bash /srv/negativezero/platform/deploy.sh skip-auth`

This regenerates all per-service secrets, including fresh setup codes
printed at the end of the run. **Don't do this if a passkey has already
been registered** — the new SESSION_SECRET will invalidate sessions, the
new ENCRYPTION_KEY will make any existing bookmark data unreadable, and
the new SETUP_CODE_HASH won't matter because the existing passkey is
what's protecting the service.

After the first passkey is registered, the setup code is dormant and
not needed again. Use the backup code to add a new device / recover
from a lost passkey, or have `admin` issue a fresh registration code.

**Logto** is running but has zero users — its Admin Console first-run
welcome at `https://auth.negativezero.one/admin/` will ask to create
the single Console admin via username/password. Per Logto OSS this is
hard-limited to one account. Save the password in 1Password — losing
it means manual Postgres surgery to recover.

---

## Architecture quick reference

Full details in `docs/ARCHITECTURE.md`; pointer list here:

- **Monorepo layout** — `apps/{landing,bookmark-manager,admin}/` +
  `platform/{docker-compose.yml,deploy.sh,nginx/}` + `docs/`.
- **Logto DB** — currently a local `postgres:16` container, **not Neon**
  as the architecture eventually targets. The cost of migrating to Neon
  is low (Logto has zero users), but `docs/DECISIONS.md` says Neon is
  the target. Bundle the migration with Phase 2 (bookmark-manager →
  Logto OIDC) when that work happens.
- **Path-mount** — services live under `/services/<name>/`. nginx
  strips the prefix (trailing slash on both `location` and `proxy_pass`).
  Container sees clean root paths; the Vite build bakes the prefix back
  into asset URLs and `import.meta.env.BASE_URL`.
- **Per-service storage** — bind-mounted `platform/data/<service>/`.
  Each contains one or two SQLite files (`bookmarks.db`,
  `bookmarks.db-wal`, `admin.db`). Owned by UID 999 (container `app`
  user). Backup = snapshot a directory tree.
- **TLS** — two certs on the apex (`negativezero.one`,
  `auth.negativezero.one`). certbot's systemd timer renews them. The
  `Amethyst` HTTPS server block is rewritten by `deploy.sh` →
  `certbot install --installer nginx --redirect`.

---

## Common operations

### Deploy an update from the operator's mac

The git remote on the VPS is HTTPS (private repo), so `git pull` on the
VPS needs a token. The simpler path uses `rsync` from the mac and is
what was used for the initial deploy:

```bash
# from the local repo on `main`
cd ~/.../004_negativezero
rsync -av -e "ssh -i ~/.ssh/wellfit_prod_ed25519" \
  --exclude='.git/' --exclude='node_modules/' --exclude='dist/' \
  --exclude='platform/.env' --exclude='platform/.env.local' \
  --exclude='platform/data/' --delete-after \
  ./ root@45.76.88.245:/srv/negativezero/

ssh -i ~/.ssh/wellfit_prod_ed25519 root@45.76.88.245 \
  'cd /srv/negativezero && bash platform/deploy.sh skip-auth'
```

`skip-auth` mode rebuilds `landing` + `bookmark-manager` + `admin` and
re-installs the apex nginx file. It deliberately does NOT touch the
running Logto container (would tear it down without a replacement,
since we're not running Logto from this monorepo yet).

For a full deploy *including* a fresh Logto bring-up from this monorepo,
drop the `skip-auth` argument and ensure `DATABASE_URL` is set in
`platform/.env`. That's a Phase 2 concern.

If you want VPS-side `git pull` to work, the cleanest fix is to register
the VPS's `/root/.ssh/id_ed25519.pub` (currently `wellfit-vultr-server`)
as a deploy key on the GitHub repo and switch the remote URL to SSH.

### Inspect state

```bash
ssh -i ~/.ssh/wellfit_prod_ed25519 root@45.76.88.245
cd /srv/negativezero

# containers
docker compose -f platform/docker-compose.yml ps

# logs
docker compose -f platform/docker-compose.yml logs -f bookmark-manager
docker compose -f platform/docker-compose.yml logs -f admin

# restart a single service (e.g. after editing .env)
docker compose -f platform/docker-compose.yml --env-file platform/.env \
    restart bookmark-manager

# nginx
sudo nginx -t
sudo systemctl reload nginx
sudo tail -f /var/log/nginx/access.log
```

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

### Add a new service `apps/<name>/`

Steps from `AGENTS.md` (kept consistent here as a reminder):

1. `apps/<name>/` with a Dockerfile listening on `$PORT`.
2. `platform/docker-compose.yml` — service block.
3. `platform/nginx/negativezero.one.conf` — `location /services/<name>/`
   block with `proxy_pass http://127.0.0.1:__<NAME>_HOST_PORT__/;`
   (trailing slash).
4. `platform/.env.template` — `<NAME>_SESSION_SECRET=` and any per-service
   vars.
5. `platform/deploy.sh` — generate the secret, pick a free port, add the
   placeholder substitution to `install_site()`.
6. Frontend (if any): set Vite `base` to `/services/<name>/`.
7. Add the service name to `apps/admin/server/src/routes/codes.ts`
   `SERVICES` whitelist so admin can issue codes for it.
8. `bash platform/deploy.sh skip-auth` (or full deploy if also touching
   Logto).
9. Update `docs/ARCHITECTURE.md`, append a `DECISIONS.md` entry if the
   service brings new deps.

---

## Backups

The only persistent state on the VPS that's ours and that matters:

```
/srv/negativezero/platform/data/bookmark-manager/   # bookmarks.db + WAL
/srv/negativezero/platform/data/admin/              # admin.db + WAL
/srv/negativezero/platform/.env                     # secrets (chmod 600)
/var/lib/docker/volumes/.../_data                   # logto's postgres data
```

Today there is **no off-host backup**. PLAN.md Phase 3 lists nightly
snapshots to S3 or rsync to a second host — not done.

Quick manual snapshot to your laptop:

```bash
rsync -av -e "ssh -i ~/.ssh/wellfit_prod_ed25519" \
  root@45.76.88.245:/srv/negativezero/platform/data/ \
  ~/.../backups/negativezero/$(date +%F)/
```

---

## Open work / Phase pointers

For the strategic view see `docs/PLAN.md`. Quick pointers:

- **Phase 1 — first deploy.** Done 2026-05-22. Landing +
  bookmark-manager + admin reachable, TLS active, Amethyst preserved.
- **Phase 2 — Logto integration.** Replace bookmark-manager's own
  WebAuthn flow with Logto OIDC. Tied to: Postgres-on-Neon migration,
  multi-user data model in bookmark-manager (`user_id` column scoped by
  JWT `sub`), `@logto/react` on the client.
- **Phase 3 — Polish.** Off-host backups, Logto webhooks for user
  lifecycle, `docs/RUNBOOK.md` (this file is a head start), empty-state
  UX post-Logto.

The admin service today is a **registration-code generator**, nothing
more. Future expansion (start/stop/logs/inspect each service) needs
either a docker socket bind-mount inside the admin container (security
risk on a shared VPS — not recommended) or a host-side daemon the admin
calls over a unix socket. Defer until there's a concrete need.

---

## Known things to be aware of

- **Dependabot PRs blocked by major-version migrations.** Two of the
  open `dependabot/*` branches need code work, not just merge:
  - `undici 6 → 8` (PR #19): the `maxRedirections` option moved out of
    `request()` options into a dispatcher interceptor in undici 7+.
    [`apps/bookmark-manager/server/src/lib/fetcher.ts:66`](apps/bookmark-manager/server/src/lib/fetcher.ts:66)
    passes it inline → typecheck fails. Either rewrite `fetcher.ts` to
    use `interceptors.redirect({ maxRedirections })` on a Dispatcher,
    or stay on undici 6 and ignore the bump in `.github/dependabot.yml`.
  - `tailwindcss 4` (inside PR #14's dev-dependencies group): Tailwind 4
    moved its PostCSS plugin into a separate `@tailwindcss/postcss`
    package and changed the `postcss.config.js` shape. The other 8
    packages in the group can merge cleanly, but dependabot bundled
    them so the whole group is red. Either split the group via
    `.github/dependabot.yml` `groups.dev-dependencies.exclude:
    [tailwindcss]` and let the rest land, or do the Tailwind 4
    migration in a dedicated PR.

  The remaining dependabot PRs (#12 setup-node 4→6, #13 react group,
  #15 @simplewebauthn/server 11→13, #16 node-html-parser 6→7) are
  green and safe to merge.

- **Container uptime clock** on the VPS is reported by Docker against
  the host clock — if the host clock drifts the container "Up X days"
  numbers won't match wall-clock. Not a real issue, just confusing.

---

## Contact / context

This file lives in the repo, so whoever has the repo has this. The
operator (`Igor`) holds the VPS SSH key and the GitHub credentials on
the `ChocolateBrownie250` account.

The Anthropic two-account vault setup (see `~/.claude-vault/`) means
this work was done on `account-A` (profile `Magic`), and details of the
session are appended to `~/.claude-vault/Memory/sessions.md`. The other
account (`account-B`, profile `igor`) can see the vault entries but not
this session's chat history directly — pull from the vault for
cross-account continuity.
