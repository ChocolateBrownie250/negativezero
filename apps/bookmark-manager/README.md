# url-vault

Self-hosted, single-user, password-protected bookmark manager. Apple HIG dark-mode UI, server-side title/favicon fetching, JSON import/export, PWA-installable on iOS.

- **Backend:** Node 20 / Fastify / better-sqlite3 / TypeScript
- **Frontend:** React 18 + Vite + Tailwind, served by the same process
- **Storage:** one SQLite file
- **Deploy:** one Docker container behind Caddy or Nginx

## Quick start (local dev)

```bash
git clone <this repo>
cd url-vault
cp .env.example .env

# 1. Session key (32 bytes hex)
openssl rand -hex 32
# paste into SESSION_SECRET=

# 2. Password hash (bcrypt cost 12)
npm install
npm run hash-password "yourPasswordHere"
# paste into ADMIN_PASSWORD_HASH=

# 3. Run dev (server on :3000, vite on :5173)
npm run dev
```

Visit http://localhost:5173. The Vite dev server proxies `/api/*` to the Fastify server on :3000.

## Production build (no docker)

```bash
npm install
npm run build
NODE_ENV=production npm start
# serves API + built client on :3000
```

## Deploy to Vultr (or any VPS) with Docker + Caddy

This is the recommended setup: Caddy handles TLS automatically, the app runs in a container, SQLite lives on a host volume.

### 1. Install Docker on the VPS

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER  # log out and back in
```

### 2. Clone and configure

```bash
git clone <this repo> /srv/url-vault
cd /srv/url-vault
cp .env.example .env

# generate secrets
echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env

# generate the bcrypt password hash without installing node on the host
docker run --rm node:20-alpine sh -c \
  'cd /tmp && npm i bcrypt --silent >/dev/null 2>&1 && node -e "require(\"bcrypt\").hash(process.argv[1],12).then(h=>console.log(h))" "yourPasswordHere"'
# paste into ADMIN_PASSWORD_HASH= in .env

echo "PUBLIC_URL=https://bookmarks.example.com" >> .env
```

### 3. Build + run

```bash
docker compose up -d --build
docker compose logs -f
```

The container listens on `127.0.0.1:3000` (loopback only — Caddy must front it).

### 4. Caddyfile

Install Caddy on the host (`apt install caddy` on Ubuntu, or see https://caddyserver.com/docs/install). Replace the default site block:

```
bookmarks.example.com {
  reverse_proxy localhost:3000
}
```

```bash
sudo systemctl reload caddy
```

Caddy auto-provisions a Let's Encrypt cert. Done.

### 5. Open Vultr firewall

In the Vultr panel (or `ufw`), allow inbound 80 and 443. Do **not** expose 3000.

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### Nginx alternative

```nginx
server {
  server_name bookmarks.example.com;
  listen 443 ssl http2;
  # certbot manages ssl_certificate / ssl_certificate_key
  location / {
    proxy_pass         http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
    proxy_set_header   X-Real-IP         $remote_addr;
  }
}
server {
  listen 80;
  server_name bookmarks.example.com;
  return 301 https://$host$request_uri;
}
```

## Backups

The entire database is one SQLite file at `./data/bookmarks.db` on the host. Cron:

```cron
30 3 * * *  cp /srv/url-vault/data/bookmarks.db /srv/url-vault/data/backup-$(date +\%F).db
0  4 * * 0  find /srv/url-vault/data -name 'backup-*.db' -mtime +30 -delete
```

The in-app **Export Bookmarks** menu item also downloads a JSON snapshot.

## Auto-deploy from GitHub (recommended)

This repo ships with `.github/workflows/deploy.yml`. Every push to `main` rsyncs the source to the VPS and runs `scripts/deploy.sh` over SSH. The first run installs Docker (if missing), generates `.env`, drops a new nginx site block, and issues a Let's Encrypt cert. Subsequent runs just rebuild and restart the container.

**One-time setup:**

1. **Add the deploy key's public half to the VPS** (`~/.ssh/authorized_keys` for the user the workflow logs in as).
2. **Add five GitHub Actions secrets** at `Settings → Secrets and variables → Actions`:
   - `SSH_HOST` — the VPS IP or hostname
   - `SSH_USER` — typically `root` (or a non-root user with sudo for `nginx -t` / Docker)
   - `SSH_PRIVATE_KEY` — the private half of the deploy keypair (paste the full `-----BEGIN OPENSSH PRIVATE KEY----- … -----END OPENSSH PRIVATE KEY-----` block)
   - `DEPLOY_DOMAIN` — the subdomain (e.g. `bookmarks.example.com`)
   - `SETUP_CODE` — a long random string. Used **once** to register your first passkey. Choose something like `openssl rand -base64 24`.
3. **Add a DNS A record** for `DEPLOY_DOMAIN` pointing to `SSH_HOST`.
4. **Push to `main`** (or merge a PR) to trigger the first deploy.

After the first successful deploy:
- Visit the site — you'll see a "Register for the first time" button.
- Click it, paste the `SETUP_CODE` you set as a GitHub secret.
- Complete Face ID / Touch ID. You'll see a **backup code** — save it somewhere safe (1Password, written down). It is shown only once.
- From then on you sign in with the passkey. iCloud Keychain syncs the passkey to all your Apple devices.

If you ever lose your passkey: the login page has a "Reset with backup code" link. Enter the backup code, register a new passkey, get a new backup code.

## Security

- **At-rest encryption:** Bookmark URLs, names, and favicon URLs are AES-256-GCM encrypted in SQLite. The key lives in `ENCRYPTION_KEY` (32 hex bytes). Generated automatically by the deploy script if not present.
- **No password stored:** the `SETUP_CODE` is bcrypt-hashed at rest. It only validates the very first registration; once you have a passkey + backup code, the setup code is dormant.
- **Passkey** uses platform authenticators (Face ID / Touch ID / Windows Hello) via WebAuthn, with the RP_ID scoped to your domain.
- **Backup code** is a 16-character random string from a confusion-free alphabet, bcrypt-hashed at rest. Rotate it from the app at any time.

## Updating

Every push to `main` re-deploys via the workflow above. If you need to deploy manually:

```bash
cd /srv/url-vault
git pull
DEPLOY_FROM_LOCAL=1 bash scripts/deploy.sh bookmarks.example.com
```

The schema is idempotent (`CREATE TABLE IF NOT EXISTS …`), no migrations to run.

## Environment variables

| Var                    | Required | Description                                                    |
| ---------------------- | -------- | -------------------------------------------------------------- |
| `SESSION_SECRET`       | yes      | 64-char hex string (32 bytes). `openssl rand -hex 32`          |
| `ADMIN_PASSWORD_HASH`  | yes      | bcrypt hash. `npm run hash-password "yourPassword"`            |
| `PUBLIC_URL`           | no       | Full URL the app is reached at. Informational.                 |
| `PORT`                 | no       | Listen port. Default 3000.                                     |
| `DATA_DIR`             | no       | Path for the SQLite file. Default `./data` (relative to cwd).  |

The server refuses to boot without `SESSION_SECRET` and `ADMIN_PASSWORD_HASH`.

## Tech notes

- The session cookie is `HttpOnly`, `SameSite=Lax`, 30-day max age. `Secure` in production. iOS standalone PWAs need `Lax` to keep the session across "tap a link → back to app".
- Server-side metadata fetching has an SSRF guard: hostnames resolving to private/loopback/link-local IPs are rejected, and the check re-runs after redirects.
- HTML body is capped at 1 MB; titles and favicon `<link>` tags live in the head.
- All input is validated. URLs without a scheme are normalized to `https://`. Non-http(s) schemes are rejected.
- iOS-only: bookmark links use the `x-safari-https://` scheme to escape in-app webviews (best-effort — Apple may change behavior over time).

## License

MIT.
