# Plan

Live working state of the negativezero platform. Updated mid-session as
work progresses. **Read this first when picking up the project.**

For granular tasks (start-of-session checklist) see `TODO.md` at the
repo root. This file holds the strategic phased view.

**Discipline:**
- Start a sub-task → mark it `[~]` immediately
- Finish a sub-task → mark it `[x]` immediately
- No silent transitions; status changes happen as the work happens
- Working on something not in the plan? Stop and either add it or
  recognise it as scope creep

---

## Current focus

**Phase 0 — Monorepo merge.** Done 2026-05-21. Three predecessor
repos (`negativezero`, `url-vault`, `negativezero-services`) collapsed
into this monorepo with `apps/` + `platform/` + `docs/` layout. Local
postgres dropped in favour of Neon for Logto's identity DB. Landing
design 03 (spirograph) selected; the other five sketches discarded.

**Next:** Phase 1 (first deploy of the merged stack to the VPS).

---

## Plan

Status markers: `[ ]` todo, `[~]` in progress, `[x]` done.

### Phase 0 — Monorepo merge (DONE 2026-05-21)

- [x] Three repos identified (`negativezero`, `url-vault`,
      `negativezero-services`)
- [x] Layout chosen: `apps/` + `platform/` + `docs/`, designed to
      absorb future services by adding directories
- [x] Landing: option 03 (spirograph, dark) selected; other five
      sketches discarded
- [x] Landing content rewritten (positiveinfinity placeholder → real
      negativezero.one + bookmark-manager link)
- [x] url-vault moved to `apps/bookmark-manager/`, base path rewired
      from `/bookmarks-pro/` to `/services/bookmark-manager/`
- [x] negativezero-services infra moved to `platform/`, docs to `docs/`
- [x] HANDOVER.md (contained plaintext VPS root password + setup code)
      excluded from the merge. **Operator action: rotate both secrets.**
- [x] Neon decision recorded (DECISIONS.md). Local postgres container
      removed from docker-compose
- [x] `platform/deploy.sh` rewritten for the merged stack (multi-domain
      certbot, per-service secrets, Neon validation)
- [x] `platform/nginx/negativezero.one.conf` written (landing at /,
      bookmark-manager at /services/bookmark-manager/)
- [x] Docs updated: CLAUDE.md, ARCHITECTURE.md, PLAN.md, DECISIONS.md

### Phase 1 — First deploy of the merged stack

- [ ] Create Neon project: region close to Vultr region, Postgres 16
- [ ] Create database `logto` in the Neon project; copy connection
      string (must contain `sslmode=require`)
- [ ] DNS on GoDaddy:
      - [ ] A record `negativezero.one` → `<VPS_IP>`
      - [ ] A record `auth.negativezero.one` → `<VPS_IP>`
- [ ] On the VPS: clone this repo to `/srv/negativezero/`
- [ ] `bash platform/deploy.sh` (will prompt for `DATABASE_URL` to
      paste into `.env` on first run)
- [ ] Verify:
      - [ ] `https://negativezero.one/` renders the landing
      - [ ] `https://negativezero.one/services/bookmark-manager/` reaches
            the bookmark UI (first-time setup screen)
      - [ ] `https://auth.negativezero.one/` reaches Logto sign-in
- [ ] Save the bookmark-manager setup code (printed once during deploy)
- [ ] First-time bookmark registration via passkey

### Phase 2 — Logto integration (replace url-vault's own WebAuthn)

This is the actual identity-unification step. Currently the bookmark-
manager uses its own per-service WebAuthn flow; Phase 2 swaps that for
JWTs issued by Logto so the same identity covers all future services.

- [ ] Register `bookmark-manager` as OIDC app in Logto Admin Console;
      record `client_id`, configure redirect/post-logout URIs
- [ ] Add `@logto/react` to `apps/bookmark-manager/client/`
- [ ] Replace `Login.tsx` and `RegisterModal.tsx` with Logto SDK
      redirect + callback handler
- [ ] Replace server-side WebAuthn middleware with JWKS-based JWT
      validation (`apps/bookmark-manager/server/src/middleware/auth.ts`)
- [ ] Add `user_id` column to `nodes` table; scope reads/writes by JWT
      `sub`. Migrate existing single-user data
- [ ] Tests: JWT validation (mock JWKS), multi-tenant scoping
- [ ] Deploy + smoke test

### Phase 3 — Polish

- [ ] Backup story: nightly snapshot of `apps/bookmark-manager/data/`
      → off-host (S3 or rsync). Neon handles its own backups
- [ ] Logto webhooks for user lifecycle (delete bookmarks when user
      is deleted)
- [ ] Operator runbook (`docs/RUNBOOK.md`): how to invite a user,
      rotate a passkey, recover a stuck deploy

---

## Blockers

None at the moment.

---

## Notes / open questions

- **Logto admin bootstrap.** First-run welcome page at
  `auth.negativezero.one/admin/` will ask to create the single Console
  admin via username/password. Per Logto OSS, this Console admin is
  hard-limited to one account. Store the password in 1Password — losing
  it = manual Postgres surgery to recover.

- **SMTP for invitations.** Logto sends invitation emails via configured
  SMTP. Until SMTP is wired, admin must create users via Logto Admin API
  directly. Pick a provider (Resend / Postmark) in Phase 2.

- **Admin Console under sub-path.** `auth.negativezero.one/admin/`
  isn't documented as supported by Logto. If it breaks (broken assets,
  loops, 404s) → fall back to `admin.negativezero.one` subdomain.

- **Bookmark-manager auth migration.** During Phase 2, existing WebAuthn
  credentials in the SQLite `passkeys` table need a migration plan: the
  simplest is "delete + re-register through Logto", which is fine while
  the service has one user. Document the procedure before Phase 2 runs.
