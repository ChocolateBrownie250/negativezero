# DEPLOY — runbook for the desktop agent

Self-contained steps to set up + deploy the current `main` to the production VPS.
Run this from a machine that has the deploy SSH key (the operator's desktop).
Nothing here needs secrets in the repo; the only secret to supply is the Groq key.

> Context: this rolls out the multi-account + per-service authorization work
> (PR #76) plus the salvaged landing redesign and bookmark-manager liquid-glass
> UI. There is **no auto-deploy** — CI only validates; the box is updated here.

## 0. Preconditions
- You reach the VPS as `ssh wellfit` (= root@45.76.88.245). The operator's key on
  the desktop is `~/.ssh/id_ed25519_wellfit_agent`, wired via a `Host wellfit`
  alias in `~/.ssh/config`. (Older notes name `~/.ssh/wellfit_prod_ed25519` — same box.)
- You have the owner's **Groq API key** (`gsk_…`) from https://console.groq.com/keys.
- Local repo is on the latest `main` (`git fetch origin && git checkout main && git pull`).
- When using the manual rsync path, deploy from the real main checkout
  `/Users/magic/Documents/Claude/01_Claude Code/negativezero-local`. Do not
  rsync from the separate coordination/worktree checkout under
  `agentic-workflows/negativezero/`; that tree is used for coordination and
  in-progress local work and is not the authoritative production checkout.
- Run the local route guard before any manual rsync:
  `bash scripts/validate-riga-routes.sh`

## 1. Get the code onto the VPS
Either `git pull` on the box, or rsync from the desktop (matches HANDOVER):

```bash
# Option A — push from the desktop over SSH. The VPS has NO GitHub credentials
# (private repo, https remote), so a `git pull` ON the box fails. Push to it
# instead. One-time setup on the box so a push updates its checked-out tree:
#   ssh wellfit 'cd /srv/negativezero && git config receive.denyCurrentBranch updateInstead'
# Then, from the desktop repo on main (working tree on the box must be clean):
git push 'ssh://wellfit/srv/negativezero' main:main

# Option B — rsync the working tree (excludes secrets/state)
bash scripts/validate-riga-routes.sh
rsync -av -e "ssh -i ~/.ssh/id_ed25519_wellfit_agent" \
  --exclude='.git/' --exclude='node_modules/' --exclude='dist/' --exclude='.venv/' \
  --exclude='platform/.env' --exclude='platform/.env.local' --exclude='platform/data/' \
  --delete-after ./ root@45.76.88.245:/srv/negativezero/
```

## 2. Set the Groq key (this also fixes the live 502)
The browser PWA no longer takes a key; transcription uses the server-side key.

```bash
ssh wellfit
cd /srv/negativezero
grep -q '^GROQ_API_KEY=gsk_' platform/.env || $EDITOR platform/.env   # set GROQ_API_KEY=gsk_...
```

No other new env is required: `ADMIN_AUTHZ_URL` is baked into docker-compose
(`http://admin:3000`) and the internal authz bearer reuses the existing
`SSO_SESSION_SECRET`. `deploy.sh` seeds any missing secrets idempotently.

## 3. Deploy
```bash
cd /srv/negativezero && bash platform/deploy.sh
```
`deploy.sh` rebuilds landing + bookmark-manager + admin + tts + timezones +
video-downloader + redirector, re-derives ports, and re-installs the apex nginx
file. tts only starts once `GROQ_API_KEY` is present. It now also fails loudly
if the apex landing no longer links `riga-estate` to the canonical dashboard
route or if the legacy `/riga-real-estate/` micro-site shell is replaced by
dashboard assets.

## 4. Verify
```bash
docker compose -f platform/docker-compose.yml ps    # all Up
curl -fsS https://negativezero.one/services/admin/api/health     # {"ok":true}
curl -fsS https://negativezero.one/services/tts/api/v1/health    # {"status":"ok",...}
# internal authz must NOT be reachable publicly (expect 404):
curl -s -o /dev/null -w '%{http_code}\n' https://negativezero.one/services/admin/api/internal/authz
bash scripts/verify-public-riga-routes.sh
```

If the public Riga housing dashboard is expected to be live, also verify the
host-static route explicitly:

```bash
curl -I https://negativezero.one/dashboards/riga-real-estate/
curl -I https://negativezero.one/dashboards/riga-real-estate/data/dashboard.json
curl -I https://negativezero.one/dashboards/riga-real-estate/data/dashboard.json.gz
```

The landing container also still exposes a separate legacy Riga micro-site at
`/riga-real-estate/`. Verify that it is still distinct from the dashboard:

```bash
curl -fsS https://negativezero.one/riga-real-estate/ | grep -F '<title>Riga real estate observations · negativezero</title>'
curl -fsS https://negativezero.one/riga-real-estate/ | grep -E 'href="\./styles\.css"|src="\./app\.js"'
```

## 5. First sign-in + accounts
1. Open `https://negativezero.one/services/admin/`. The owner account
   auto-seeds on admin boot with every service. Sign in with the owner passkey
   (existing passkey still works; the SSO cookie now carries the account id).
2. To invite someone: admin → generate a **setup key**, ticking the services
   they get (incl. Amethyst/tts). Give them the key; they register a passkey at
   admin and get an account with exactly those services.
3. Manage access anytime: admin → **Accounts** → toggle services / disable /
   delete. Revokes take effect immediately; re-grant requires the user to log in
   again.
4. iPhone Shortcut: admin → the account's **API tokens (tts)** → create one
   (shown once) → put it in the Shortcut's `Authorization: Bearer …` header.
   The owner's legacy `TTS_API_KEY` still works too.

## 6. Smoke-test the authz wiring (optional, hermetic)
From the repo (no VPS needed) — boots real admin + bookmark-manager and proves
instant revoke + sticky reauth:
```bash
bash platform/e2e/authz-e2e.sh   # expect "4 passed, 0 failed"
```

## Troubleshooting

**`/dashboards/riga-real-estate/` returns 404** while the static files still
exist under `/var/www/dashboards/riga-real-estate/`. This has regressed more
than once when the dashboard `location` block disappeared from the nginx source
template and the active site file.

Expected source of truth:

- local deploy repo: `platform/nginx/negativezero.one.conf`
- active VPS site file: `/etc/nginx/sites-available/negativezero.one`
- required route order: the dashboard `location /dashboards/riga-real-estate/`
  must remain above the landing `location /` catch-all

Expected route shape:

```nginx
location = /dashboards/riga-real-estate {
    return 308 https://$host/dashboards/riga-real-estate/;
}
location /dashboards/riga-real-estate/ {
    root /var/www;
    try_files $uri $uri/ /dashboards/riga-real-estate/index.html;
}
```

Recovery:

```bash
ssh wellfit
cd /srv/negativezero
grep -n '/dashboards/riga-real-estate' platform/nginx/negativezero.one.conf /etc/nginx/sites-available/negativezero.one
sudo nginx -t
sudo systemctl reload nginx
curl -I https://negativezero.one/dashboards/riga-real-estate/
curl -I https://negativezero.one/dashboards/riga-real-estate/data/dashboard.json
curl -I https://negativezero.one/dashboards/riga-real-estate/data/dashboard.json.gz
```

If the local source template is missing the route, fix the repo first and then
re-apply it on the VPS. Do not treat a one-off live hotfix as complete if the
source template is still stale.

**`/riga-real-estate/` serves the dashboard shell** instead of the separate
legacy micro-site. The source of truth for this route lives in the landing
repo tree, not in the host-static dashboard publish directory.

Expected source of truth:

- local deploy repo: `apps/landing/riga-real-estate/`
- active VPS checkout: `/srv/negativezero/apps/landing/riga-real-estate/`
- expected live title: `Riga real estate observations · negativezero`
- expected live asset refs: relative `./styles.css` and `./app.js`
- unexpected dashboard-shell symptom:
  `/dashboards/riga-real-estate/assets/...` appears in the HTML

Recovery:

```bash
ssh wellfit
cd /srv/negativezero
sed -n '1,12p' apps/landing/riga-real-estate/index.html
grep -F 'Riga real estate observations · negativezero' apps/landing/riga-real-estate/index.html
grep -E 'href="\./styles\.css"|src="\./app\.js"' apps/landing/riga-real-estate/index.html
bash platform/deploy.sh
curl -fsS https://negativezero.one/riga-real-estate/ | grep -F '<title>Riga real estate observations · negativezero</title>'
curl -fsS https://negativezero.one/riga-real-estate/ | grep -E 'href="\./styles\.css"|src="\./app\.js"'
```

If the checked-out repo subtree under `apps/landing/riga-real-estate/` does not
match the tracked source anymore, fix the repo state first and only then
redeploy the landing container. Do not accept the route as healthy just because
it returns `200`.

**HTTPS serves the wrong cert after a deploy** (browser TLS warning;
`https://negativezero.one/` presents e.g. `CN=isgroup.one`). The nginx site file
was left HTTP-only, so `:443` falls through to another tenant's server block.
Cause: `deploy.sh` rewrites the site file from the HTTP-only template every run
and relies on certbot to re-add the `443` block; if that certbot step fails, TLS
is gone. `deploy.sh` now retries 3× and fails loudly (no more silent HTTP-only),
but to fix by hand:
```bash
ssh root@45.76.88.245
certbot install --installer nginx --cert-name negativezero.one --redirect --non-interactive
systemctl reload nginx
# verify the right cert is served:
echo | openssl s_client -connect negativezero.one:443 -servername negativezero.one 2>/dev/null | openssl x509 -noout -subject
```

## Rollback
`deploy.sh` is re-runnable. To roll back code: on the VPS
`git checkout <previous-good-sha> && bash platform/deploy.sh`. Data dirs under
`platform/data/<service>/` are bind-mounted and untouched by a rebuild. The
admin DB migrations are additive (new tables/columns only), so an older image
keeps working against the migrated DB.
