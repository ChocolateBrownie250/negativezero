# Runbook

Operator procedures for the deployed negativezero platform. Audience is
whoever holds the VPS SSH key (`~/.ssh/wellfit_prod_ed25519`) and the
GitHub credentials for the `ChocolateBrownie250` account. Procedures
assume you can `ssh root@45.76.88.245` and run `gh` locally.

This file complements [`HANDOVER.md`](../HANDOVER.md) at the repo root:
HANDOVER is the snapshot of what's deployed and where; RUNBOOK is the
"now what" when you need to actually do something. For the strategic
view of what's planned see [`PLAN.md`](PLAN.md); for past decisions and
their rationale see [`DECISIONS.md`](DECISIONS.md).

---

## Conventions

- All paths below are on the VPS unless prefixed `local:`.
- `ssh` is shorthand for `ssh -i ~/.ssh/wellfit_prod_ed25519 root@45.76.88.245`.
- All compose commands need both the env-file and the compose-file
  flags. The shortcut alias `cd /srv/negativezero` lets the
  bare-relative paths below work as written.
- Anything that mutates state on the VPS is marked **(mutates)**. Run
  it from a place where the local repo is clean and you'd be OK
  reverting from git if you typo.

---

## Invite a new user (issue a registration code)

The admin service generates passkey-registration codes for any
whitelisted service. Today the whitelist is `bookmark-manager` and
`admin` (see [`apps/admin/server/src/routes/codes.ts`](../apps/admin/server/src/routes/codes.ts)
`SERVICES`). Adding a new service means appending to that array.

**Steps:**

1. Sign in at <https://negativezero.one/services/admin/> with your
   passkey.
2. Pick the target service from the dropdown, optionally label the
   issuance ("Anna's laptop", "second device"), click *Generate*.
3. The UI shows two strings: the plaintext **code** (give this to the
   user) and the bcrypt **hash** (this is what the service needs in
   its `.env`).
4. SSH to the VPS and edit `platform/.env`. Replace
   `<SERVICE>_SETUP_CODE_HASH=...` with the new hash. **Escape every
   `$` to `$$`** — Docker Compose re-interpolates env-file values when
   resolving `${VAR}` in the YAML, so an un-escaped `$2b$12$...` hash
   gets chopped. `platform/deploy.sh` does this automatically on
   first-run; a manual paste needs it manually.
5. Restart the target service so it re-reads `.env`:
   ```bash
   ssh
   cd /srv/negativezero
   docker compose --env-file platform/.env \
       -f platform/docker-compose.yml restart <service>
   ```
6. Send the plaintext code to the user out-of-band (Signal, 1Password
   share, whatever). They go to the service's login screen, paste the
   code, and register their passkey.

The plaintext code is single-use: once any passkey is registered
against that service, the code is dormant. Issuing a new code for the
same service (e.g. to add a second device) just overwrites the hash —
existing passkeys are unaffected because they don't depend on the
code anymore.

## Recover a user who lost their passkey (backup-code path)

Every user gets a one-time backup code at first registration. They saw
it once and were told to save it.

**If they have the backup code:**

1. They go to the service's login screen and click "Use backup code".
2. Enter the backup code → register a new passkey → get a new backup
   code (the old one is invalidated).

No operator action needed.

**If they lost both passkey and backup code:**

1. Issue a fresh registration code via admin (procedure above).
2. SSH to the VPS, open the service's SQLite DB:
   ```bash
   ssh
   cd /srv/negativezero/platform/data/<service>
   sqlite3 <service>.db
   ```
3. Delete the user's existing credentials so the new setup code is
   accepted:
   ```sql
   DELETE FROM passkeys;       -- single-user service: nukes all
   DELETE FROM backup_codes;
   .quit
   ```
4. Restart the service:
   ```bash
   docker compose --env-file platform/.env \
       -f platform/docker-compose.yml restart <service>
   ```
5. Hand them the new code; they re-register.

For bookmark-manager this preserves their bookmark data (which is
keyed by service-wide `ENCRYPTION_KEY`, not per-user). For admin they
get a fresh audit log starting today.

## Restart a single service

```bash
ssh
cd /srv/negativezero
docker compose --env-file platform/.env \
    -f platform/docker-compose.yml restart <service>
```

Where `<service>` is `landing`, `bookmark-manager`, `admin`, or
`logto`. Restart is graceful — open requests drain, the container
exits, a fresh one starts.

If the service won't start, follow with the *Diagnose a crashlooping
service* procedure below.

## Pull container logs

Last 200 lines:

```bash
ssh 'docker compose -f /srv/negativezero/platform/docker-compose.yml \
    logs --tail 200 <service>'
```

Follow in real time:

```bash
ssh 'docker compose -f /srv/negativezero/platform/docker-compose.yml \
    logs -f <service>'
```

Logs are JSON-lines from Fastify (`pino`) for the Node services and
nginx access-log format for `landing`. For nginx-on-host logs (apex
TLS, routing, certbot), use:

```bash
ssh 'tail -f /var/log/nginx/access.log /var/log/nginx/error.log'
```

## Diagnose a crashlooping service

1. Check the status:
   ```bash
   ssh 'docker compose -f /srv/negativezero/platform/docker-compose.yml ps'
   ```
   `STATUS: Restarting (N)` means the container exits and Docker
   restarts it (the `restart: unless-stopped` policy).
2. Grab the last batch of logs from the most-recent run:
   ```bash
   ssh 'docker compose -f /srv/negativezero/platform/docker-compose.yml \
       logs --tail 100 <service>'
   ```
   Common causes:
   - Missing or malformed env var (`SESSION_SECRET`, `ENCRYPTION_KEY`,
     `SETUP_CODE_HASH`, `PUBLIC_URL`). Look for `config validation`
     errors in the first 5 lines of the log.
   - SQLite file permissions wrong — the container's `app` user is
     UID 999 and the bind-mounted host directory must be `chown 999`.
     Fix:
     ```bash
     ssh 'chown -R 999:999 /srv/negativezero/platform/data/<service>'
     ```
   - The `$` → `$$` escape on `<SERVICE>_SETUP_CODE_HASH` got lost
     during a manual `.env` edit (see *Invite a new user* above).
3. If the cause is in `.env`, fix in place on the VPS (chmod 600,
   never commit) and `restart <service>`. If the cause is in code,
   fix locally, re-deploy via the rsync procedure in HANDOVER.md.

## Roll out a code change

The deploy path is rsync-from-local-mac + run `platform/deploy.sh` on
the VPS — there is no per-service CI deploy step (yet). Full procedure
lives in [`../HANDOVER.md#deploy-an-update-from-the-operators-mac`](../HANDOVER.md).
Short form:

```bash
# local: make sure main is clean and merged
cd <local-repo>
git checkout main && git pull

# rsync to VPS, excluding state
rsync -av -e "ssh -i ~/.ssh/wellfit_prod_ed25519" \
  --exclude='.git/' --exclude='node_modules/' --exclude='dist/' \
  --exclude='platform/.env' --exclude='platform/.env.local' \
  --exclude='platform/data/' --delete-after \
  ./ root@45.76.88.245:/srv/negativezero/

# run the deployer (skip-auth mode leaves Logto's existing container alone)
ssh -i ~/.ssh/wellfit_prod_ed25519 root@45.76.88.245 \
  'cd /srv/negativezero && bash platform/deploy.sh skip-auth'
```

`deploy.sh` is idempotent — re-running it on an unchanged tree is a
no-op except for re-resolving free ports.

## Schedule automatic backups

A backup script lives at [`../platform/backup.sh`](../platform/backup.sh).
It tarballs all three things that matter (bookmark-manager SQLite,
admin SQLite, Logto Postgres dump, `platform/.env`), ships the archive
to S3 or to a remote rsync target, and prunes snapshots older than
`RETAIN_DAYS` (default 30).

**One-time setup on the VPS:**

1. Create `/etc/negativezero-backup.env` with one of:
   ```bash
   # S3 (requires `apt-get install awscli` and `aws configure` with
   # a least-privilege IAM user — s3:PutObject, s3:ListBucket,
   # s3:DeleteObject on the bucket prefix only)
   BACKUP_S3_URI=s3://my-bucket/negativezero/
   RETAIN_DAYS=30

   # OR rsync to a second host (requires an ssh key for the
   # backup user installed in /root/.ssh/)
   BACKUP_RSYNC_DEST=backup-user@host.example:/backups/negativezero/
   ```
2. `chmod 600 /etc/negativezero-backup.env` (it has no secrets today
   but the destination URL is sensitive operational info).
3. Dry-run once to verify the chain works:
   ```bash
   bash /srv/negativezero/platform/backup.sh
   ```
   Reads from stderr, exits 0 on success.
4. Add to cron — nightly at 03:30 UTC:
   ```bash
   echo '30 3 * * * cd /srv/negativezero && bash platform/backup.sh >> /var/log/negativezero-backup.log 2>&1' \
       | crontab -
   ```
   Or as a systemd timer — equivalent, slightly nicer logging via
   `journalctl -u negativezero-backup`. Either is fine.

For the rsync destination, also schedule a remote-side prune (script
doesn't reach across the ssh hop):
```bash
# on the destination host, in cron
0 4 * * * find /backups/negativezero -name 'negativezero-*.tar.gz' -mtime +30 -delete
```

## Manual SQLite backup

There's no off-host backup yet (Phase 3). For a quick on-demand
snapshot to your laptop:

```bash
rsync -av -e "ssh -i ~/.ssh/wellfit_prod_ed25519" \
  root@45.76.88.245:/srv/negativezero/platform/data/ \
  ~/backups/negativezero/$(date +%F)/
```

What's in there:

- `bookmark-manager/bookmarks.db` (+ `-wal`, `-shm`) — encrypted
  bookmarks; useless without the `ENCRYPTION_KEY` from `.env`.
- `admin/admin.db` (+ `-wal`, `-shm`) — passkey credentials, backup
  codes, generated-code audit log.

For Logto's Postgres state, see *Backup Logto's database* below.

## Restore a SQLite service from backup

**(mutates)** Stop the service first; SQLite's WAL files only make
sense paired with the matching `.db`, so don't restore them while the
service has them open.

```bash
ssh
cd /srv/negativezero
docker compose --env-file platform/.env \
    -f platform/docker-compose.yml stop <service>

# wipe current state
rm -rf platform/data/<service>/*

# copy the backup back in (run from local mac)
rsync -av -e "ssh -i ~/.ssh/wellfit_prod_ed25519" \
  ~/backups/negativezero/<date>/<service>/ \
  root@45.76.88.245:/srv/negativezero/platform/data/<service>/

# fix permissions for the container's app user (UID 999)
ssh 'chown -R 999:999 /srv/negativezero/platform/data/<service>'

# start back up
ssh 'cd /srv/negativezero && \
    docker compose --env-file platform/.env \
    -f platform/docker-compose.yml start <service>'
```

For bookmark-manager the `ENCRYPTION_KEY` in `.env` must match the one
that produced the backup, or the bookmarks are unreadable.

## Backup Logto's database

Logto's Postgres runs as a container on the VPS today (not Neon — yet,
see [`PLAN.md`](PLAN.md) Phase 2). Quick dump:

```bash
ssh 'docker exec negativezero-postgres pg_dumpall -U postgres' > \
    ~/backups/negativezero/$(date +%F)/logto-postgres.sql
```

Restore:

```bash
ssh 'docker exec -i negativezero-postgres psql -U postgres' < \
    ~/backups/negativezero/<date>/logto-postgres.sql
```

This will move to Neon's managed backups in Phase 2; until then,
self-dump.

## Rotate a service-level secret

The four per-service secrets in `platform/.env`:

| Variable                       | What rotating it costs                                                           |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `BOOKMARK_SESSION_SECRET`      | All open sessions invalidated; users sign in again with their passkey            |
| `BOOKMARK_ENCRYPTION_KEY`      | **All existing bookmarks become unreadable.** Do not rotate without re-encrypt   |
| `BOOKMARK_SETUP_CODE_HASH`     | Dormant after first passkey; new value only matters if no passkey is registered  |
| `ADMIN_SESSION_SECRET`         | Admin session invalidated; sign in again with passkey                            |
| `ADMIN_SETUP_CODE_HASH`        | Same as above; dormant after first passkey                                       |

To rotate, edit `platform/.env` on the VPS, escape `$` → `$$` if it's
a bcrypt hash, restart the service. The deploy script preserves
`.env` values across runs by design, so a re-deploy after rotation
keeps the new value.

`BOOKMARK_ENCRYPTION_KEY` rotation in particular is not a
"emergency-flip-it" operation — it requires reading all rows, decrypting
with the old key, re-encrypting with the new key, writing back. Not
scripted today.

## Recover from a stuck deploy

Symptoms: `deploy.sh` hangs, `docker compose` errors with port
conflicts, nginx fails to reload.

Most-common causes and fixes:

- **Port already in use** by a previous container that didn't clean
  up. List what's bound:
  ```bash
  ssh 'ss -ltnp | grep -E ":30[0-9]{2}"'
  ```
  Kill the orphan:
  ```bash
  ssh 'docker rm -f <container-name>'
  ```
- **nginx -t fails** on a substituted-but-not-found port. Check
  `platform/nginx/*.conf` for any `__FOO_HOST_PORT__` placeholder and
  make sure both `.env` and `platform/deploy.sh` are wired through to
  it (cf. PR #18 + #22 history). Validate locally first:
  ```bash
  sudo nginx -t -c /etc/nginx/sites-enabled/negativezero.one
  ```
- **certbot rate-limit** on TLS renewal during repeated re-deploys
  in a short window. Wait it out (Let's Encrypt 5 attempts per hour
  per cert), or re-deploy with `skip-auth` mode which doesn't touch
  certbot.

If the apex services are still serving (containers happy, just deploy
script stuck), no rush — fix and re-run; the script is idempotent.

If apex services are down, the fastest path back is to revert to the
last-known-good directory:
```bash
ssh 'cd /srv/negativezero && git log --oneline -5'
# pick a known-good SHA
ssh 'cd /srv/negativezero && git checkout <sha> -- apps/ platform/'
ssh 'cd /srv/negativezero && bash platform/deploy.sh skip-auth'
```

This assumes the VPS has a git clone with main tracked, which it
mostly doesn't today (the deploy was rsync-based). Future work: wire
the VPS-side `/root/.ssh/id_ed25519.pub` as a GitHub deploy key and
switch the remote to SSH so `git` Just Works on the VPS.

## Renew TLS certs manually

certbot renews automatically via systemd timer; if you need to force
a renewal (e.g. after rotating a cert provider, or expiring soon):

```bash
ssh 'certbot renew --cert-name negativezero.one'
ssh 'certbot renew --cert-name auth.negativezero.one'
ssh 'systemctl reload nginx'
```

To see expiry dates:

```bash
ssh 'certbot certificates'
```

## Decommission a service

**(mutates)** When retiring `apps/<name>/`:

1. **Local**, in a branch:
   - Remove the service block from `platform/docker-compose.yml`.
   - Remove the `location /services/<name>/` block from
     `platform/nginx/negativezero.one.conf`.
   - Remove the env-var lines from `platform/.env.template`.
   - Remove the service name from
     `apps/admin/server/src/routes/codes.ts` `SERVICES` whitelist.
   - Delete `apps/<name>/`.
   - Delete `.github/workflows/<name>.yml` if you had one.
   - Open a PR, merge.

2. **On the VPS**, after the PR is merged and `main` is deployed:
   ```bash
   ssh
   # stop the container — won't be in compose anymore
   docker rm -f negativezero-<name> 2>/dev/null
   docker image rm platform-<name> 2>/dev/null
   # archive then remove the data dir
   tar -czf /root/<name>-data-$(date +%F).tar.gz \
       -C /srv/negativezero/platform/data <name>
   rm -rf /srv/negativezero/platform/data/<name>
   ```

The archive sits in `/root/` until you grab it off-host. If you're
sure you don't want it, delete it.

---

## Pointers

- Deployed state, container map, secret inventory:
  [`../HANDOVER.md`](../HANDOVER.md)
- Strategic plan, phase status, open work:
  [`PLAN.md`](PLAN.md)
- Architectural decisions and their rationale:
  [`DECISIONS.md`](DECISIONS.md)
- Working contract for LLM agents (don't break the deploy script,
  don't rename env vars without updating template):
  [`../AGENTS.md`](../AGENTS.md)
