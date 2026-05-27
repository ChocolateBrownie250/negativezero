# TODO

Active checklist for the negativezero platform. Granular,
session-actionable. For the strategic / phased view see
[`docs/PLAN.md`](docs/PLAN.md).

**Maintenance rule:** when you start a task, change `[ ]` → `[~]`.
When you finish, change to `[x]` and move it to the **Done** section
at the bottom. Don't leave stale `[~]` markers across sessions — if
you put work down mid-task, write one line under the marker
explaining where you stopped.

---

## Operator (human) — one-time setup

These can't be automated from inside an agent session; the human
operator has to do them in a browser / VPS console.

- [ ] Rotate the VPS root password (the old one was committed
      plaintext to `url-vault/HANDOVER.md` before this merge)
- [ ] Rotate the bookmark-manager v1 setup code if it was ever set
      on the live deploy (also in old HANDOVER.md)
- [ ] Revoke any GitHub PATs pasted into earlier sessions
- [ ] Create a Neon project, region close to Vultr region
- [ ] In Neon, create database `logto`, copy the full connection
      string (must include `sslmode=require`)
- [ ] On GoDaddy: A record `negativezero.one` → `<VPS_IP>`
- [ ] On GoDaddy: A record `auth.negativezero.one` → `<VPS_IP>`

## First deploy — DONE 2026-05-22

apex stack (landing + bookmark-manager + admin) deployed via
`platform/deploy.sh skip-auth`. Logto kept on its existing
`/srv/negativezero-services/` deployment (local Postgres, zero
users) — not redeployed from the new monorepo on first cut. See
`HANDOVER.md` for the full state and ops procedures.

Remaining one-time browser steps for the operator:

- [ ] Register a passkey at
      `https://negativezero.one/services/bookmark-manager/` using the
      bookmark-manager setup code from `/tmp/deploy4.log` on the VPS
      (or re-derive via the "regenerate everything" procedure in
      HANDOVER.md — only safe if no passkey is registered yet)
- [ ] Register a passkey at `https://negativezero.one/services/admin/`
      using the admin setup code (same source as above)
- [ ] Optional: visit `https://auth.negativezero.one/admin/` and create
      the Logto Console admin (the username/password is hard-limited
      to one account; store in 1Password)

## Logto integration (Phase 2 — agent-friendly chunks)

Sequence these in order. Each task is roughly one session of focused
work.

- [ ] Register an OIDC application `bookmark-manager` in the Logto
      Admin Console; record `client_id` (no secret needed for SPAs)
      and add redirect URIs:
      - `https://negativezero.one/services/bookmark-manager/callback`
      - post-logout: `https://negativezero.one/services/bookmark-manager/`
- [ ] `apps/bookmark-manager/client/`: add `@logto/react` dependency
- [ ] Add a `LogtoProvider` at the App.tsx root with the issuer URL
      pointing at `https://auth.negativezero.one`
- [ ] Replace `pages/Login.tsx` with a redirect to Logto sign-in
- [ ] Add a `pages/Callback.tsx` that handles the OIDC code exchange
- [ ] `apps/bookmark-manager/client/src/api.ts`: read access token
      from `useLogto().getAccessToken()`, attach as `Authorization:
      Bearer ...` on every request
- [ ] `apps/bookmark-manager/server/src/middleware/auth.ts`: replace
      session-cookie check with JWT validation against Logto JWKS
      (`https://auth.negativezero.one/oidc/jwks`); cache JWKS with
      a 10-min TTL
- [ ] DB migration: add `user_id TEXT NOT NULL` to `nodes` table; for
      existing rows, backfill with the single existing user's `sub`
      from Logto
- [ ] Scope all node CRUD by `user_id = req.auth.sub`
- [ ] Remove the WebAuthn registration + setup-code flow (no longer
      needed once Logto owns auth)
- [ ] Tests: JWT validation against a mock JWKS; cross-tenant access
      returns 404

## Polish (Phase 3)

- [~] Nightly snapshot of `platform/data/bookmark-manager/` to S3
      (or rsync to a second host) — `platform/backup.sh` written.
      Operator wires up `/etc/negativezero-backup.env` with
      `BACKUP_S3_URI` or `BACKUP_RSYNC_DEST` and adds a cron entry
      (see `docs/RUNBOOK.md`).
- [x] Operator runbook: `docs/RUNBOOK.md`
- [ ] Logto webhooks → bookmark-manager `/api/_internal/user-deleted`
      to purge bookmarks when a Logto user is deleted
- [ ] Empty-state UX for first-time users post-Logto migration

## Open dependabot PRs — major bumps — DONE (superseded)

All nine major bumps (#32–#40) were applied directly and verified on
the `claude/bookmarks-manager-status-93fgU` branch rather than merging
each dependabot PR individually. Once that branch lands, the nine
dependabot PRs are redundant and should be closed.

What shipped, both apps brought to parity:

- **server (bookmark-manager + admin):** fastify 4→5 with its
  fastify-5 plugin majors (@fastify/secure-session 7→8,
  @fastify/rate-limit 9→10, @fastify/static 7→9), better-sqlite3 11→12,
  uuid 10→14 (bookmark-manager), @simplewebauthn/server 11→13 (admin),
  dotenv 16→17 (admin). The v13 type-only imports were repointed from
  the removed `@simplewebauthn/types` to `@simplewebauthn/server`.
- **client (bookmark-manager + admin):** @simplewebauthn/browser 11→13,
  lucide-react 0→1, tailwindcss 3→4 (via the official codemod:
  `@import "tailwindcss"`, `@tailwindcss/postcss`, border-color compat
  shim, utility renames). admin also took vite 5→8 + @vitejs/plugin-react
  4→6.

Verified in-sandbox: both apps build clean (tsc + vite), the
bookmark-manager server tests pass 15/15, and runtime smoke tests
confirm secure-session cookies, rate-limit headers, WebAuthn options,
and SPA static serving all work under fastify 5.

- [ ] **Still wants a browser smoke test** (couldn't run headless here):
      Tailwind 4 preflight cosmetic defaults (e.g. button cursor) and
      the vite-8 admin dev server. Verify the two SPAs render correctly
      before relying on the deploy.

---

## Done

- [x] **2026-05-27** Cleared the dependabot major-bump backlog (#32–#40)
      directly on `claude/bookmarks-manager-status-93fgU`: fastify 5 +
      plugin majors, better-sqlite3 12, uuid 14, dotenv 17,
      @simplewebauthn 13, lucide 1, vite 8 (admin), tailwindcss 4 (both
      clients). Builds + server tests green; runtime smoke-tested.
      Browser visual smoke test still pending. The nine dependabot PRs
      are now superseded.
- [x] **2026-05-22** First deploy of merged stack on
      `45.76.88.245` — landing + bookmark-manager + admin reachable
      via `https://negativezero.one/{,services/bookmark-manager/,
      services/admin/}`. Amethyst `/vtt-transcriber/` preserved.
- [x] **2026-05-22** New `apps/admin/` service: passkey-protected
      registration-code generator. Same auth flow + Apple HIG
      look-and-feel as bookmark-manager. (PR #17)
- [x] **2026-05-22** Four `platform/` bugs found during first real
      deploy and fixed: bcrypt-via-docker → bcryptjs; chown bind-mount
      data dirs to UID 999; `$` → `$$` escape in bcrypt hashes;
      nginx `proxy_pass` trailing slash on `/services/*`. (PR #18)
- [x] **2026-05-22** `HANDOVER.md` written at repo root — captures
      deployed state, ops procedures, known issues, future work
      pointers; zero secrets by design.
- [x] **2026-05-21** Repos merged: `negativezero` + `url-vault` +
      `negativezero-services` → this monorepo (`apps/` + `platform/` +
      `docs/`)
- [x] **2026-05-21** Landing design 03 (spirograph) selected; other
      five sketches deleted
- [x] **2026-05-21** Bookmark-manager base path rewired from
      `/bookmarks-pro/` to `/services/bookmark-manager/`
- [x] **2026-05-21** Local Postgres dropped in favour of Neon
      (managed external) — *intent*; actual migration deferred,
      Logto still on local Postgres on 2026-05-22
- [x] **2026-05-21** `platform/deploy.sh` rewritten for multi-domain
      + per-service secret generation + Neon validation
- [x] **2026-05-21** Docs updated to reflect merged platform shape
      (CLAUDE / ARCHITECTURE / PLAN / DECISIONS / AGENTS / TODO)
