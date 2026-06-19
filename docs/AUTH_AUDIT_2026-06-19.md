# Authorization & Account-System Audit — 2026-06-19

**Trigger:** the owner reported that visiting Amethyst (`/services/tts/`) while
signed out (incognito) showed the app for a second or two, then prompted for a
passkey on a screen titled **"Admin"**, and that **any** passkey — including a
test account's — got them in. Concern: an admin-only gate being opened by a
non-admin passkey.

**Scope:** all gated services (`admin`, `tts`, `bookmark-manager`,
`video-downloader`, `redirector`), the shared SSO cookie, the internal authz
endpoint, and the WebAuthn flows.

---

## What was actually happening

The two symptoms came from two **separate, non-cryptographic** issues. The
WebAuthn verification itself is sound everywhere (see "Verified correct" below).

### F1 — Flash of the app shell before the auth check (the "it lets me in") — FIXED

Amethyst is a static PWA: `index.html` + `app.js` are served with **no auth**
(only the API is gated). The **Record** tab makes **no API call**, so an
anonymous visitor saw the full Record screen render. Authentication was only
checked *lazily* — the first time a tab fired a protected request (History →
`GET /transcriptions`, Settings → `GET /usage`) it got `401` and only *then*
redirected to login. Hence: app shows for a moment, then bounces to a passkey
prompt when you navigate.

No data ever leaked — every `/api/v1/*` route carries `Depends(verify_auth)` and
returns `401/403` to anonymous/unauthorized callers. The problem was purely that
the **UI shell** rendered before the session was confirmed.

**Fix:** added `GET /api/v1/me` (dependency-only, `200`/`401`/`403`) and a
**boot-time gate** in the PWA: the shell is hidden (`body.az:not(.authed)
.screen { visibility: hidden }`) behind a "Checking access…" overlay until
`/api/v1/me` succeeds. `401` → redirect to the SSO login; `403` (valid session,
no `tts` grant) → an access-denied message instead of a redirect loop. Bumped
the service-worker cache (`amethyst-shell-v10` → `v11`) so the fix propagates to
installed PWAs.

### F2 — The SSO login was branded "Admin" (the "it asks for the admin passkey") — FIXED

`/services/admin/` is the **shared SSO hub**: every service bounces signed-out
users to `/services/admin/?return=/services/<svc>/`, and that login minted the
apex-wide `nz_session` cookie. But the page was hard-titled **"Admin"** with the
copy "No admin passkey registered yet". It is *not* an admin-only gate — it
authenticates **any** registered account and bounces it back; what that account
can then *use* is decided per-service by the authz grant.

So signing in with the test passkey produced a **test-account** session (not an
admin one) and Amethyst opened because that account holds the `tts` grant. The
"Admin" branding made a generic SSO login look like a privileged gate, which is
what made this look like a breach.

**Fix:** rebranded the hub login to neutral platform branding ("negativezero")
and a destination-aware subtitle ("Sign in to continue to Amethyst", derived
from the validated `?return=` slug). No more implication that it is an
admin-only passkey.

### F3 — `?return=` redirect hardening — FIXED (defense-in-depth)

The post-login redirect previously accepted any value starting with
`/services/`. Tightened to reject protocol-relative (`//host`), scheme
(`://`), `\` and `/services//` forms so it can't be coerced into an open
redirect. (No working bypass was found; this closes the class.)

---

## Verified correct (no change needed)

- **WebAuthn assertion verification** in every service looks the credential up
  by its asserted id and verifies the signature against *that credential's*
  stored public key, with `expectedChallenge` (from the server session),
  `expectedOrigin`, `expectedRPID`. A passkey can therefore only authenticate as
  the account that owns it — it cannot impersonate another account.
- **No default-allow** in the account model. Non-owner accounts get a service
  only via an explicit `account_services` grant (`accounts.ts:servicesFor` /
  `authorize`). The owner is the literal `owner` id.
- **Every Amethyst API route** is gated by `Depends(verify_auth)` (audited all
  of `transcribe/transcriptions/notes/settings/prompts/usage`).
- **Internal authz endpoint** (`/api/internal/authz`) is bearer-guarded by the
  shared secret, constant-time compared, and 404'd from the public by nginx.
- **Fail-closed on admin outage**: services serve a ≤15 s "last good" decision
  then deny; admin's own gate (`requireAuth`) re-evaluates live every request.

---

## Open findings (by design / operator action — NOT changed in code)

### O1 — Legacy local `userId === 'owner'` path in the TS services (LOW)

`bookmark-manager`, `video-downloader`, `redirector` still accept a passkey
registered *directly on that service* (its own `credentials` table) and set a
local `userId='owner'` session that bypasses admin's per-account authz. This is
**only reachable with the operator's per-service `SETUP_CODE`** (a secret) for
the first passkey, or by an already-authenticated owner — so it is not an
escalation path for non-operators. It is, however, a second source of truth that
diverges from "admin owns authorization." Recommend (future) folding these into
the SSO-only model and dropping the local path; tracked as a follow-up rather
than fixed here to avoid disturbing the owner's working direct-login.

### O2 — Check that your "test2" passkey isn't actually an OWNER credential (OPERATOR)

In admin, registering a passkey **while signed in as the owner** adds it to the
**owner** account (`auth.ts` "authenticated" mode → `regAccountId =
sessionAccountId`). If the "test2" passkey was created that way, it *is* an
owner credential and will open everything — which would fully explain
"opened it with the test account." **Action:** in admin → Accounts, confirm
`test2` is a separate account, that it only has the grants you intend, and that
the owner account lists only the passkeys you expect. Remove any stray owner
passkey (admin → passkeys, or rotate via the backup code).

### O3 — tts authz fail-open when `ADMIN_AUTHZ_URL` is unset (INFO)

`authorize()` returns `allow` when `ADMIN_AUTHZ_URL` is empty (an
incremental-rollout affordance). Production sets it for tts, so this is not live;
kept for local dev. If the rollout is considered complete, flip the default to
fail-closed in a future change.

---

## Operator checklist

1. Deploy this branch (`bash platform/deploy.sh` on the VPS) — rebuilds the tts
   image (new `/api/v1/me` + gated PWA) and the admin client (rebranded login).
2. Hard-reload Amethyst once on each device (or wait for the SW to roll to
   `v11`) so the gated shell replaces the cached one.
3. Verify signed-out incognito → `/services/tts/` now shows "Checking access…"
   then the login, with **no** flash of the Record screen.
4. Do O2: audit accounts/passkeys in admin and remove any unintended owner
   passkey.
