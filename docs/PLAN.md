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

**Phase 1 — first deploy.** Done 2026-05-22. Landing +
bookmark-manager + admin reachable on the VPS at
`https://negativezero.one/`, `/services/bookmark-manager/`,
`/services/admin/`. TLS active on both apex domains. Amethyst's
`/vtt-transcriber/` block preserved through the new apex nginx file.
Logto NOT redeployed from this monorepo on first cut — kept the
running `negativezero-logto` + local `negativezero-postgres` from the
predecessor `/srv/negativezero-services/` setup (zero users, zero
data loss to defer this). See HANDOVER.md.

**Next:** Phase 2 (Logto integration into bookmark-manager + admin,
bundled with the Postgres → Neon migration).

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

### Phase 1 — First deploy of the merged stack (DONE 2026-05-22)

- [x] DNS on GoDaddy: A records for `negativezero.one` and
      `auth.negativezero.one` were already pointing at the VPS from
      the predecessor deploy
- [x] On the VPS: `/srv/negativezero/` synced to monorepo state
- [x] `platform/.env` regenerated via `deploy.sh skip-auth`
      (existing pre-merge `.env` discarded — bookmark-manager had
      never been deployed, no real secrets in play)
- [x] **New: `apps/admin/` built and deployed.** Passkey-protected
      registration-code generator at `/services/admin/`. Stack
      mirrors bookmark-manager (Fastify + better-sqlite3 + WebAuthn
      backend, React + Vite + Tailwind frontend).
- [x] **Four deploy.sh / nginx bugs fixed during first real run**:
      bcrypt-via-docker idealTree bug (switch to bcryptjs in /tmp);
      bind-mount permission (chown host dirs to UID 999); bcrypt-hash
      values being chopped by compose's second-pass interpolation
      (escape `$` → `$$`); nginx `proxy_pass` missing trailing slash
      on `/services/*` (source comment was wrong, ARCHITECTURE.md
      was right). See PR #18 for the patch set.
- [x] Verify:
      - [x] `https://negativezero.one/` renders the landing
      - [x] `https://negativezero.one/services/bookmark-manager/`
            reaches the bookmark UI (first-time setup screen)
      - [x] `https://negativezero.one/services/admin/` reaches the
            admin UI (first-time setup screen)
      - [x] `https://negativezero.one/vtt-transcriber/` still 200
            (Amethyst tenant preserved through the apex rewrite)
      - [x] `https://auth.negativezero.one/` still 200 (existing
            Logto untouched by `skip-auth` mode)
- [x] Setup codes captured from deploy output (in `/tmp/deploy*.log`
      on the VPS until the next reboot)
- [ ] First-time bookmark + admin passkey registration via browser
      (operator step — not done in this session)

**Deferred** (intentional, not blocking):

- [ ] Create Neon project + copy `DATABASE_URL` for Logto
- [ ] Migrate Logto's local `negativezero-postgres` data to Neon —
      no data to migrate today (0 users, 4 Logto-default app rows),
      bundle with Phase 2

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

- [~] Backup story: nightly snapshot of `apps/bookmark-manager/data/`
      → off-host (S3 or rsync). Script written
      (`platform/backup.sh`); operator wires
      `/etc/negativezero-backup.env` + cron (see RUNBOOK.md). Neon
      handles its own backups for Logto's identity DB once that
      migration lands in Phase 2.
- [ ] Logto webhooks for user lifecycle (delete bookmarks when user
      is deleted)
- [x] Operator runbook (`docs/RUNBOOK.md`): how to invite a user,
      rotate a passkey, recover a stuck deploy. Done 2026-05-26.

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
