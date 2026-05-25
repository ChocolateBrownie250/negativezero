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

- [ ] Nightly snapshot of `platform/data/bookmark-manager/` to S3
      (or rsync to a second host)
- [ ] Operator runbook: `docs/RUNBOOK.md`
- [ ] Logto webhooks → bookmark-manager `/api/_internal/user-deleted`
      to purge bookmarks when a Logto user is deleted
- [ ] Empty-state UX for first-time users post-Logto migration

---

## Done

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
