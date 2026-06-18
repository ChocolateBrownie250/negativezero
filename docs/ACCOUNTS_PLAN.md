# Multi-account + per-service authorization — implementation plan

## Goal (from owner)
- Admin generates **setup keys** for any service (incl. Amethyst/tts).
- A setup key, when redeemed, **creates one user account** that works across services via the existing SSO cookie.
- Amethyst needs **no PWA key**; the Groq key stays a server-side secret. But an **account is required** to use it.
- Only the owner + invited friends (given setup keys) can use the services.
- Admin can **toggle each account's access per service** (e.g. allow bookmarks, deny Amethyst).

## Current state (researched)
- Admin is the SSO hub; it is the only service that mints `nz_session` (HS256 JWT, `{sub:'owner'}`).
- Every service is single-owner: it checks `sub === 'owner'` → full access. No accounts, no per-service authz.
- Setup codes today are an audit log only; the real gate is a per-service `SETUP_CODE_HASH` env var.

## Target architecture
**Admin = identity + authorization authority.**

### Data (admin sqlite)
- `accounts(id, name, status, is_owner, created_at)` — `id='owner'` is the seeded owner.
- `account_services(account_id, service, enabled)` — per-account per-service grant.
- `credentials.account_id` — passkeys belong to an account (existing rows migrate to `owner`).
- `generated_codes` gains `granted_services` (JSON), `name`, `used_at`, `account_id`.

### SSO JWT
- Mint `{ sub: <accountId>, name }`. Verify returns the payload (or null), not a bool.
- Legacy `sub:'owner'` tokens keep working (owner account id is `owner`).

### Authorization enforcement
- Source of truth = admin. Admin exposes `GET /api/internal/authz?account=&service=`
  guarded by `Authorization: Bearer <SSO_SESSION_SECRET>` (reused shared secret; never
  exposed through nginx).
- Each consuming service: verify SSO → accountId → check service allowed (cached ~30s) → else 403.
  When `ADMIN_AUTHZ_URL` is unset the check is skipped (legacy allow) so rollout is incremental.
- Admin's own management routes check authz locally (account must have the `admin` service).

### Amethyst
- Add `tts` to gateable services; enforce account+authz in the FastAPI dependency.
- Keep the owner Bearer key for the iPhone Shortcut; remove the key field from the browser PWA.

### Registration
- Setup code redeemed at admin: matches an unused `generated_codes` row → create account with the
  code's `granted_services`, tie the new passkey to it, consume the code, mint SSO for that account.
- Owner bootstrap still uses the env `SETUP_CODE_HASH` when no owner account exists.

### Admin UI
- Accounts panel: list accounts, per-service toggles, enable/disable, delete.
- Code generation: pick granted services (multi-select) + a name.

## Gateable services
`bookmark-manager`, `video-downloader`, `redirector`, `tts`, `admin`
(`landing`, `timezones` are public — no backend auth).

## Verification
- `tsc` build for each Node server; `vitest` unit tests; `pytest` for tts.
- Dev-server + curl of `/api/internal/authz` and a protected route with a forged-account cookie.
