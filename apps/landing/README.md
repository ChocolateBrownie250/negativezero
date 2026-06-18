# landing

The static landing page served at the apex — `https://negativezero.one/`.

This is one service in the `negativezero` monorepo. For the platform shape —
how it's deployed and fronted — read [`../../HANDOVER.md`](../../HANDOVER.md),
[`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md), and
[`../../README.md`](../../README.md).

## What it is

Pure static HTML/CSS/vanilla JS — **no build step, no backend**. A generative
animated canvas hero (harmonograph) over self-hosted [Geist](https://vercel.com/font)
fonts. Served by a stock `nginx:1.27-alpine` container with a read-only
bind-mount (`apps/landing → /usr/share/nginx/html:ro`), so there are no host
filesystem permissions to manage; the apex nginx reverse-proxies `/` to it.

## Layout

```
index.html          the apex landing (animated hero + Geist webfonts)
fonts/              self-hosted Geist font files (no external CDN)
riga-real-estate/   a self-contained static micro-site bundled with the
                    landing container (its own index.html / app.js / styles.css
                    / data); reachable as a static sub-path
```

## Develop

No tooling required — open `index.html` in a browser, or serve the directory:

```bash
cd apps/landing
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Deploy

Built into the platform stack by [`../../platform/deploy.sh`](../../platform/deploy.sh):
the file tree is bind-mounted into the landing container, so a deploy is just a
file sync + `docker compose up -d`. Because it is the apex root it mounts at `/`
(the one documented exception to the `/services/<name>/` convention — see
`docs/DECISIONS.md`), not `/services/landing/`.
