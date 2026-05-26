# admin

Platform-level admin tool: passkey-protected registration-code
generator for negativezero services. Today that's it — there's no
service start/stop, no log viewer, no user management UI. The
philosophy is "one binary, one job".

This is one service in the `negativezero` monorepo. For the platform
shape see:

- [`../../HANDOVER.md`](../../HANDOVER.md) — what's deployed and where
- [`../../docs/RUNBOOK.md`](../../docs/RUNBOOK.md) — operator procedures
  (includes *Invite a new user* which uses this tool)
- [`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) — platform architecture

Deployed at `https://negativezero.one/services/admin/`.

## What it does

Generates one-time registration codes for any whitelisted service.
The flow is:

1. Operator signs in with their passkey.
2. Picks the target service from a dropdown (whitelist in
   [`server/src/routes/codes.ts`](server/src/routes/codes.ts) — today
   `bookmark-manager` and `admin` itself).
3. Server generates a random code, bcrypts it (cost 12), persists the
   hash + service name + optional label to the local audit log
   (`admin.db`), and returns the **plaintext code** and **bcrypt hash**
   in the response.
4. Operator pastes the bcrypt hash into the target service's
   `<SERVICE>_SETUP_CODE_HASH` env var (with `$` → `$$` escaping for
   Docker Compose), restarts that service.
5. End user gets the plaintext code via out-of-band channel (1Password
   share, Signal), pastes it on the target service's first-time setup
   screen, registers their passkey.

There's no "send invitation email" today — Phase 2 brings Logto with
its native invitation flow, at which point this service either grows
to manage invitations through Logto, gets replaced, or stays as the
no-Logto fallback for service-internal credentials. TBD.

## Layout

- `server/` — Fastify + better-sqlite3 + TypeScript. Owns: WebAuthn
  flow for the operator's own passkey, code generation, audit log.
- `client/` — React 18 + Vite + Tailwind. Apple HIG dark mode UI,
  matches bookmark-manager's look-and-feel.

Vite `base` is `/services/admin/`. Nginx on the host strips the
prefix before proxying to the container.

## Local dev

```bash
cd apps/admin
npm install
npm run dev
```

You need a local `.env` for the server:

```
SESSION_SECRET=<openssl rand -hex 32>
SETUP_CODE_HASH=<bcrypt of your operator setup code, cost 12>
PUBLIC_URL=http://localhost:3000
```

Admin has no separate `hash-password` script today; either copy
bookmark-manager's (`npm -w server run hash-password "code"`) or use:

```bash
node -e 'require("bcrypt").hash(process.argv[1],12).then(console.log)' "your-code"
```

## Tests

There aren't any yet. Add some when you touch this service — the
`.github/workflows/admin.yml` workflow has a `server tests` step
commented in as TODO that runs `npm -w server test` once the first
test file lands.

## Production

Built and deployed via `platform/deploy.sh`. The container listens on
`127.0.0.1:3000`; nginx fronts it at `/services/admin/`. State
(`admin.db` + WAL) lives on a bind-mounted volume at
`platform/data/admin/`, owned by UID 999 (container `app` user).

The service starts in **first-time-setup mode** — the next visitor
who knows the `SETUP_CODE_HASH`'s plaintext gets to register the
operator passkey. After that the setup code is dormant; recovery
goes through the backup code shown once at registration (see
RUNBOOK).

## Environment variables

| Var               | Required | Description                                                                                       |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `SESSION_SECRET`  | yes      | 32-byte hex. Signs session cookies.                                                               |
| `SETUP_CODE_HASH` | yes      | bcrypt(operator's setup code, cost 12). Dormant after operator passkey is registered.             |
| `PUBLIC_URL`      | yes      | Full URL the app is reached at. Used for cookie scoping and WebAuthn RP origin.                   |
| `PORT`            | no       | Listen port. Default 3000.                                                                        |
| `DATA_DIR`        | no       | SQLite directory. Default `/app/data` in container, `./data` locally.                             |

In production these come from `platform/.env` via `platform/deploy.sh`.

## Adding a new service to the whitelist

Edit `server/src/routes/codes.ts`:

```ts
const SERVICES = ['bookmark-manager', 'admin', '<new-service>'] as const;
```

`<new-service>` must match the name the target service expects when
validating a code (usually just its directory name under `apps/`).
After rebuild, the dropdown in the admin UI picks it up automatically.

## Security notes

- **Single operator.** This is intentional — for multi-operator
  admin, defer to Logto's Admin Console once Phase 2 lands.
- **bcrypt cost 12** on stored hashes; ~250 ms per verify on the VPS.
- **`$` → `$$` escaping** on hashes before they hit `platform/.env`
  is critical — Docker Compose re-interpolates env-file values when
  resolving `${VAR}` in `docker-compose.yml`. Skipping the escape
  silently chops the hash. The operator-facing flow in RUNBOOK
  spells this out; this README mentions it because the same trap
  applies if you ever copy a hash from the audit log back into
  `.env` by hand.
- **No at-rest encryption** of `admin.db` — unlike bookmark-manager,
  admin stores no end-user data, only its own credentials + an audit
  log of "codes issued to which service when". The credentials are
  bcrypt-hashed; the audit log isn't sensitive in itself.
