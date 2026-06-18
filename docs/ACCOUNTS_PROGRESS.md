# Multi-account + per-service authorization — PROGRESS LOG

> Living document. Updated as work proceeds so an interrupted session can resume
> without losing context. See `docs/ACCOUNTS_PLAN.md` for the full design.

**Branch:** `claude/pull-latest-bgmt6t`
**Last updated:** 2026-06-18

## Final goal (owner's words, distilled)
1. From admin, generate **setup keys** for any service (incl. Amethyst/tts).
2. A setup key redeemed → **creates one account**, usable across services via SSO.
3. Amethyst: **no PWA key**; Groq key stays a server secret; but an account is required.
4. Only owner + invited friends (given setup keys) can use the services.
5. Admin can **toggle each account's access per service** (e.g. bookmarks yes, Amethyst no).

## Key design decisions
- Admin is the single identity + authorization authority.
- SSO `nz_session` JWT now carries the real `account_id` in `sub` (`owner` for the owner).
- Authentication (valid JWT) is separate from authorization (per-service grant).
- Per-service authz is checked live against admin `GET /api/internal/authz`
  (guarded by the shared `SSO_SESSION_SECRET`, never exposed via nginx), cached ~30s
  → toggles take effect within ~30s. Stale cache served ≤10min on admin outage, else deny.
- `ADMIN_AUTHZ_URL` empty ⇒ check skipped (legacy allow) for safe incremental rollout;
  docker-compose sets it to `http://admin:3000`.
- Friends never receive per-service env setup codes, so they cannot get a local
  `owner` session on a service; their SSO carries their account id and is authz-checked.
- iPhone Shortcut keeps its owner Bearer key; only the browser PWA key field is removed.
- Gated services: `bookmark-manager`, `video-downloader`, `redirector`, `tts`, `admin`.
  (`landing`, `timezones` are public — no backend auth.)

## Task list

### Phase 1 — Admin backend (identity + authz authority)
- [x] DB schema: `accounts`, `account_services`, `credentials.account_id`,
      `generated_codes` extra cols + lightweight column migrations (`db.ts`)
- [x] `lib/accounts.ts`: gated-services list, account CRUD, per-service grant,
      `isAllowed`, `ensureOwnerAccount`
- [x] `lib/ssoSession.ts`: mint with `{sub, name}`, verify returns claims|null
- [x] `middleware/auth.ts`: resolve account from session/SSO, gate admin on `admin` service
- [x] `routes/codes.ts`: generate codes with multi-service grant + name
- [x] `routes/accounts.ts`: list / toggle service / enable-disable / delete
- [x] `routes/internal.ts`: bearer-guarded `/api/internal/authz`
- [x] `routes/auth.ts`: multi-account registration (`first`/`enroll`/`authenticated`/`reset`),
      login resolves account, mints account-scoped SSO
- [x] `index.ts`: wire account + internal routes, `ensureOwnerAccount()` on boot
- [x] Admin server typechecks (`tsc --noEmit`) ✅
- [x] Admin server unit tests (accounts/authz/SSO round-trip) — 11/11 green ✅

### Phase 2 — Consuming services enforce authz
- [x] bookmark-manager: ssoSession verify, `lib/authz.ts`, config, middleware — typechecks ✅
- [x] redirector: mirror bookmark-manager enforcement — typechecks + 10/10 tests ✅
- [x] video-downloader: mirror bookmark-manager enforcement — typechecks + 10/10 tests ✅
- [ ] tts/Amethyst backend: account-scoped SSO authz in `auth.py` (httpx, cached);
      keep owner Bearer for Shortcut
- [ ] tts/Amethyst PWA: remove the API-key field; rely on SSO; purge stale localStorage key

### Phase 3 — Admin client UI (React) — build passes ✅
- [x] Accounts panel: list accounts, per-service toggles, enable/disable, delete
- [x] Code generation: multi-select services + name
- [x] Registration: optional name field; client `api.ts` for new endpoints

### Phase 4 — Platform + docs
- [x] docker-compose: `ADMIN_AUTHZ_URL=http://admin:3000` for bookmark-manager,
      redirector, video-downloader, tts ✅
- [x] nginx: 404 `/services/admin/api/internal/` from the public ✅
- [x] `.env.template`: documented reuse of `SSO_SESSION_SECRET` as internal authz bearer
      (no new secret / no deploy.sh change needed) ✅
- [x] docs: ARCHITECTURE.md + DECISIONS.md (ADR) ✅
- [x] docs: HANDOVER.md operator note (inviting friends) ✅

### Phase 5 — Self-check
- [x] Typecheck/build every touched Node service (admin, bookmark, redirector,
      video-downloader all `tsc` clean; admin client `vite build` ok) ✅
- [x] vitest (node) + node:test (admin) + pytest (tts) green:
      admin 11, bookmark 15, redirector 10, video-downloader 10, tts 28 ✅
- [x] Live e2e: booted admin, `/api/internal/authz` returns allowed:true for
      owner, false for unknown, 401 without/with wrong bearer; `/api/accounts`
      401 without auth ✅
- [x] Commit, push, open draft PR — **PR #76** (draft) ✅
- [ ] CI green on PR #76 (watching)

## Status: phase 1-5 in PR #76; phase 6 (owner refinements) in progress

### Phase 6 — refinements from owner answers (2026-06-18)
Owner clarified four things; implementing on the same branch/PR:

- [x] **Instant, sticky revocation.** ✅ admin: `revoked_at`/`sessions_revoked_at`
      cols, `authorize()` → allow/deny/reauth, internal endpoint takes `iat`,
      SSO carries `iat`. Consumers switched to live check (no positive cache,
      15s stale-on-error, fail-closed). bookmark-manager + redirector +
      video-downloader (live, reauth clears cookie→401) + tts (live, 401 reauth).
      Tests: admin 16, tts 30, redirector/video 10 each, bookmark 15.
- [x] **Per-account API tokens for tts.** ✅ admin `api_tokens` table +
      `lib/apiTokens.ts` (mint/list/revoke/state), owner-gated routes
      `POST|GET|DELETE /api/accounts/:id/tokens` (tts-only), internal authz
      checks `jti` for instant token revocation, tts accepts the token as Bearer
      (scope `api`). Admin client UI (`AccountTokens.tsx`) to create (shown
      once) / list / revoke. Tests: admin 19, tts 33. Owner legacy key intact.

## Phase 6 COMPLETE — pushed (commits e588104 instant revocation, ca68b9b API tokens)
Everything the owner asked for is implemented, tested, and on PR #76:
instant+sticky per-service revocation, per-account tts API tokens, accounts-only
identity, and a real cross-service e2e.

## Phase 7 — consolidation + deploy prep (2026-06-18)
- [x] Audited the 8 leftover `claude/*` branches against current main.
      Stale/already-merged: add-timezones-service, bookmarks-bad-gateway (#74),
      bottom-nav-positioning (#71), redirect-service (#72), tts-amethyst-redesign,
      redirector-deploy-notes (#73 — already in HANDOVER).
      **Useful + unmerged, salvaged via cherry-pick (clean, builds):**
      landing harmonograph hero (`c440acd`) + bookmark-manager liquid-glass
      (`e452e1b`, client builds ✅).
- [x] `docs/DEPLOY.md` — runbook a desktop agent executes (transfer → set
      GROQ_API_KEY → deploy.sh → verify → accounts/first-login). The box deploy
      needs SSH, done from the desktop session, not here.
- [ ] Consolidation PR → merge to main, then desktop agent deploys.

## SHIPPED — PR #76 merged to main (2026-06-18, squash 7a82c06); CI was fully green.
- Repo cleanup: 13 stale PRs closed; Dependabot auto-deleted its 10 branches.
  8 `claude/*` branch refs remain — proxy + safety boundary block me from
  deleting them; operator deletes in UI or via `git push origin --delete …`.
  (3 of those — #70 landing redesign, #73 redirector notes, #75 bm liquid-glass
  — were unmerged real work; closed but reopenable.)
- PROD DEPLOY is still pending and is operator-run on the VPS (no SSH from here):
    ssh root@45.76.88.245
    cd /srv/negativezero && git pull origin main
    # ensure the Groq key is set (this also fixes the live 502):
    grep -q '^GROQ_API_KEY=gsk_' platform/.env || $EDITOR platform/.env
    bash platform/deploy.sh
  After deploy, sign in once via /services/admin/ to mint the SSO cookie
  (owner account auto-seeds with all services).
- [x] **Identity model confirmed** — accounts created only via owner-issued
      keys; no open self-registration. Current enroll flow already matches. ✅
- [x] **Production e2e** — `platform/e2e/authz-e2e.sh` boots REAL admin +
      bookmark-manager and proves: access→200, revoke→403 (instant),
      re-grant + old session→401 (sticky reauth), fresh session→200. 4/4 ✅
All five requirements met. tts `test_integration.py` (49) talk to the live
production host and fail identically on baseline (pre-existing; not in scope).

## Where we are right now
- Phase 1 complete and compiling. Phase 2 reference (bookmark-manager) complete and compiling.
- Next: fan out enforcement to redirector + video-downloader + tts, build the admin UI,
  then platform wiring, docs, and the full self-check.

## Notes / gotchas discovered
- The `Write` tool was appending a stray `</content>` line to new files in this
  environment; strip the last line if it equals `</content>` after each Write.
- `npx tsc` without local deps fetches the deprecated `tsc` shim (TS 1.x) → bogus
  "Type expected" EOF errors. Always use `node_modules/.bin/tsc`.
