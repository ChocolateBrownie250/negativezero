# DEPLOY — runbook for the desktop agent

Self-contained steps to set up + deploy the current `main` to the production VPS.
Run this from a machine that has the deploy SSH key (the operator's desktop).
Nothing here needs secrets in the repo; the only secret to supply is the Groq key.

> Context: this rolls out the multi-account + per-service authorization work
> (PR #76) plus the salvaged landing redesign and bookmark-manager liquid-glass
> UI. There is **no auto-deploy** — CI only validates; the box is updated here.

## 0. Preconditions
- You have the deploy key `~/.ssh/wellfit_prod_ed25519` (VPS root@45.76.88.245).
- You have the owner's **Groq API key** (`gsk_…`) from https://console.groq.com/keys.
- Local repo is on the latest `main` (`git fetch origin && git checkout main && git pull`).

## 1. Get the code onto the VPS
Either `git pull` on the box, or rsync from the desktop (matches HANDOVER):

```bash
# Option A — pull on the VPS (repo already checked out at /srv/negativezero)
ssh -i ~/.ssh/wellfit_prod_ed25519 root@45.76.88.245 \
  'cd /srv/negativezero && git fetch origin && git checkout main && git pull --ff-only origin main'

# Option B — rsync the working tree (excludes secrets/state)
rsync -av -e "ssh -i ~/.ssh/wellfit_prod_ed25519" \
  --exclude='.git/' --exclude='node_modules/' --exclude='dist/' --exclude='.venv/' \
  --exclude='platform/.env' --exclude='platform/.env.local' --exclude='platform/data/' \
  --delete-after ./ root@45.76.88.245:/srv/negativezero/
```

## 2. Set the Groq key (this also fixes the live 502)
The browser PWA no longer takes a key; transcription uses the server-side key.

```bash
ssh -i ~/.ssh/wellfit_prod_ed25519 root@45.76.88.245
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
file. tts only starts once `GROQ_API_KEY` is present.

## 4. Verify
```bash
docker compose -f platform/docker-compose.yml ps    # all Up
curl -fsS https://negativezero.one/services/admin/api/health     # {"ok":true}
curl -fsS https://negativezero.one/services/tts/api/v1/health    # {"status":"ok",...}
# internal authz must NOT be reachable publicly (expect 404):
curl -s -o /dev/null -w '%{http_code}\n' https://negativezero.one/services/admin/api/internal/authz
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
