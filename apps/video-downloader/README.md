# video-downloader

Passkey-protected clear-HLS downloader for the negativezero platform.

Deployed at `https://negativezero.one/services/video-downloader/`.

## What it does

The service accepts a direct public clear-HLS `.m3u8` URL, downloads the
listed media segments, and remuxes them with ffmpeg into either `.mov`
or `.mp4` using stream copy (`-c copy`). It does not transcode, decrypt,
scrape player pages, attach cookies, or bypass access controls.

## Layout

- `server/` — Fastify + better-sqlite3 + TypeScript. Owns WebAuthn
  passkey auth, SSRF-guarded HLS fetching, playlist validation, and
  ffmpeg remux.
- `client/` — React + Vite + Tailwind. Single authenticated tool
  surface for entering a `.m3u8` URL and downloading the remuxed file.

Vite `base` is `/services/video-downloader/`. Nginx strips that prefix
before proxying to the container.

## Local dev

```bash
cd apps/video-downloader
npm install
npm run dev
```

You need a local `.env` for the server:

```
SESSION_SECRET=<openssl rand -hex 32>
SETUP_CODE_HASH=<bcrypt of your setup code, cost 12>
PUBLIC_URL=http://localhost:3000
```

ffmpeg must be available on the local PATH for real downloads. The
production Docker image installs ffmpeg in the runtime layer.

## Tests

```bash
npm -w server run test
npm run build
```

## Environment variables

| Var | Required | Description |
| --- | --- | --- |
| `SESSION_SECRET` | yes | 32-byte hex. Signs session cookies. |
| `SETUP_CODE_HASH` | yes | bcrypt setup-code hash. Dormant after the first passkey is registered. |
| `PUBLIC_URL` | yes | Full public URL. Used for cookie scoping and WebAuthn RP origin. |
| `PORT` | no | Listen port. Default `3000`. |
| `DATA_DIR` | no | SQLite directory. |
| `VIDEO_DOWNLOADER_MAX_SEGMENTS` | no | Segment count cap. Default `1000`. |
| `VIDEO_DOWNLOADER_MAX_BYTES` | no | Total media byte cap. Default `2000000000`. |
| `VIDEO_DOWNLOADER_CONCURRENCY` | no | Parallel media fetches. Default `4`. |
| `VIDEO_DOWNLOADER_JOB_TIMEOUT_MS` | no | Per-request timeout. Default `600000`. |

In production these come from `platform/.env` via
`platform/deploy.sh`.
