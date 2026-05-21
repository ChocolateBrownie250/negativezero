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

## First deploy (on the VPS)

- [ ] `git clone` this repo to `/srv/negativezero/`
- [ ] `cd /srv/negativezero && bash platform/deploy.sh`
- [ ] When prompted, paste the Neon `DATABASE_URL` into
      `platform/.env`, then re-run `bash platform/deploy.sh`
- [ ] Save the bookmark-manager setup code from the deploy output
      (printed once, won't be shown again)
- [ ] Verify `https://negativezero.one/` renders the landing
- [ ] Verify `https://negativezero.one/services/bookmark-manager/`
      shows the bookmark-manager first-run screen
- [ ] Register the first bookmark-manager passkey with the setup code
- [ ] Verify `https://auth.negativezero.one/admin/` loads the Logto
      Admin Console welcome page; create the single Console admin

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

- [x] **2026-05-21** Repos merged: `negativezero` + `url-vault` +
      `negativezero-services` → this monorepo (`apps/` + `platform/` +
      `docs/`)
- [x] **2026-05-21** Landing design 03 (spirograph) selected; other
      five sketches deleted
- [x] **2026-05-21** Bookmark-manager base path rewired from
      `/bookmarks-pro/` to `/services/bookmark-manager/`
- [x] **2026-05-21** Local Postgres dropped in favour of Neon
      (managed external)
- [x] **2026-05-21** `platform/deploy.sh` rewritten for multi-domain
      + per-service secret generation + Neon validation
- [x] **2026-05-21** Docs updated to reflect merged platform shape
      (CLAUDE / ARCHITECTURE / PLAN / DECISIONS / AGENTS / TODO)
