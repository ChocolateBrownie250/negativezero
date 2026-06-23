# Decisions

Append-only log of architectural and consequential decisions for the
negativezero platform. Most recent on top. Never edit or delete past
entries — if a decision is reversed, write a new entry referencing the
old one.

Each entry records what was decided, what alternatives were on the
table, why this option won, and what would invalidate the choice. The
last field matters most: without it, the log records what was decided
but not when to revisit it.

---

## 2026-06-23 — Citrine persistence: server is the source of truth, localStorage is an offline cache

Server-side per-presentation storage landed for Citrine: owner-scoped
`/api/presentations` CRUD backed by better-sqlite3 (see
`apps/presentation-studio/server/src/routes/presentations.ts`). This is exactly
the "server-side multi-project storage" that the earlier 2026-06-23 entry below
("Citrine as a web-native presentation editor service") named as a reason to
extend the document model — so this entry records how the two persistence
layers now relate.

**Decision:** the server is the source of truth; the browser `localStorage`
store (`apps/presentation-studio/client/src/lib/storage.ts`, key
`negativezero:citrine:v1`) is an offline cache, not a second authority. The
client may hydrate from localStorage for instant/offline first paint, but an
authenticated session reconciles against the server copy, saves write to the
server (mirrored to localStorage), and on conflict the server wins.

**Alternatives considered:** (a) localStorage-only (the V1 model) — rejected now
that decks must persist across devices; (b) server-only, dropping the
localStorage mirror — rejected because offline-first first paint is a real UX
win and the PWA already ships an app-shell cache; (c) last-write-wins between the
two stores with no designated authority — rejected as the source of exactly the
stale-overwrite bugs this decision prevents.

**Status / follow-up:** the precedence is decided here but not yet fully explicit
in code — `Dashboard.tsx` still interleaves both stores (`docs/TECH_DEBT.md`
items 6 and 7). Making it explicit should ride along with the Dashboard
decomposition. `ARCHITECTURE.md` now describes the server layer.

**What would invalidate this:** adding real-time collaboration or multi-writer
editing (which needs a CRDT/OT model rather than a single-authority cache), or
dropping the offline-first requirement (then go server-only and delete the
mirror).

## 2026-06-23 — Citrine as a web-native presentation editor service

Added `apps/presentation-studio/`, mounted at `/services/citrine/`, as a
private Negative Zero service for building polished web presentations from
premade elements. It is intentionally not a PowerPoint clone: the core model is
responsive narrative scenes, reusable semantic elements, hyperlink-style
actions, freeform canvas relationships, and web-native transitions.

**Auth and deployment:** Citrine follows the private Fastify + React service
pattern used by the other TypeScript apps. It accepts the apex `nz_session`
SSO cookie and calls admin's `/api/internal/authz` for the `citrine` grant;
local WebAuthn/setup-code auth remains as a fallback. Compose, deploy.sh,
admin `GATED_SERVICES`, and nginx all register it as a first-class gated
service. The production PWA scope is `/services/citrine/`.

**Offline/PWA boundary:** The service worker caches only the app shell and
static assets. `/api/`, auth, imported-source data, credentialed responses, and
cross-origin requests remain network-only. V1 project preservation is via
browser `localStorage`; authenticated server features are online-only.

**Source import:** The seed source is the downloaded Claude Design
`ISG Studio.html` archive. The imported source files live under
`server/imports/isg-studio/` and are served only through authenticated
`/api/source/isg-studio/...` routes.

**What would invalidate this:** wanting server-side multi-project storage,
collaborative editing, or a general-purpose slide-deck file format. Those
should extend Citrine's document model rather than turning the UI into a
PowerPoint clone.

## 2026-06-20 — timezones gated by SSO + per-account presets

Turned `timezones` from a public static page into a gated Fastify service so it
sits behind login like every other service, and added **server-side per-account
presets** (named snapshots of the planner's zone selection + work hours).

**Auth: SSO-cookie-only, no local login.** Unlike bookmark-manager / redirector /
admin (which also carry their own WebAuthn passkey + secure-session as a local
fallback), timezones authenticates *only* via the apex `nz_session` cookie minted
by admin. Reasons: the owner already has a passkey at the hub, the cookie works
across services, and dropping local WebAuthn/secure-session removes
`@simplewebauthn`, `bcrypt`, `@fastify/secure-session`, a `SESSION_SECRET`, and a
`SETUP_CODE_HASH` — a meaningfully smaller surface for a low-stakes utility. The
static client shell is still served publicly; `app.js` gates the UI on
`GET /api/v1/me` and bounces anonymous visitors to `/services/admin/?return=…`
(the Amethyst PWA pattern). Registered in admin's `GATED_SERVICES`, so the owner
auto-has it and friends get it via a setup code.

**Presets: server-side, per-account (not localStorage).** Each preset is a row
(`presets(id, account_id, name, selection, …)`) scoped by the SSO `sub`; the live
working selection still lives in `localStorage` for instant, offline-friendly
restore. Alternatives considered: (a) localStorage-only presets — rejected, they
wouldn't sync across devices and aren't tied to the account the new auth
introduces; (b) a shared (un-scoped) table like redirector's — rejected, presets
are personal, so every query carries `WHERE account_id = ?`.

**Client kept vanilla JS** (served via `@fastify/static`), not rewritten to React
— the planner is a self-contained ~400-line IIFE; a framework migration would be
pure churn for no user benefit.

**What changed:** new `apps/timezones/{server,public}` (Fastify + better-sqlite3,
shell moved under `public/`); the docker-compose block flipped from `nginx:alpine`
to a built image with a `data/timezones` volume; `deploy.sh` seeds the data dir +
health-checks `/api/health`; admin `GATED_SERVICES` + login `SERVICE_NAMES`;
`timezones.yml` CI now builds/tests instead of static-validating.

**Behavior change:** timezones is **no longer publicly accessible** — it now
requires login, the explicit goal.

**What would invalidate this:** wanting timezones public again (revert to the
static block); or the platform gaining a real central IdP (then the SSO-cookie
gate is replaced wholesale, not just for timezones).

## 2026-06-19 — CI auto-deploy on merge to main; isolation kept incremental

Set up push-to-deploy: `.github/workflows/deploy.yml` runs on every merge to
`main` (plus a manual `workflow_dispatch` button). The runner checks out `main`,
**rsyncs the tree to the VPS over SSH, then runs `platform/deploy.sh`** on the
box. It does NOT have the box pull from GitHub: the VPS has no GitHub credentials
(private repo, https remote), so a `git pull` on the box fails (see
docs/DEPLOY.md). `main` is the single source of truth / production branch;
day-to-day work happens on feature/`development` branches merged into `main` via
PR. The box always reflects `main` — editing files directly on the box is an
anti-pattern that a deploy overwrites.

Wired up and validated this session: repo secrets `SSH_HOST` (45.76.88.245),
`SSH_USER` (root), `DEPLOY_PATH` (/srv/negativezero), `SSH_KEY`, and
`SSH_KNOWN_HOSTS` are set; `main` was deployed to the box and every service
verified healthy before auto-deploy was enabled.

**Deploy auth & key hardening.** CI uses a DEDICATED ed25519 deploy key (not the
operator's personal key). The private half lives only in the `SSH_KEY` repo
secret (passed via `env:`, written to a file, deleted after each run); the public
half is in the box's `~/.ssh/authorized_keys`, restricted with
`no-port-forwarding,no-agent-forwarding,no-X11-forwarding`. `deploy.sh` requires
root because it writes **host** nginx/systemd/certbot, so the key is effectively
root on the shared box. A `command="…"` forced-command (locking the key to a
single command) is NOT used: the deploy needs both an `rsync` transfer and a
`bash` invocation over the same key, and pinning to one command would break the
file sync. For tighter containment, route both through one wrapper script on the
box and force-command the key to that.

**Isolation posture (decided deliberately, not by omission).** The owner wants
negativezero isolated from the other tenants on the shared VPS (wellfit,
isgroup-one). Current state: all app services already run as **Docker
containers** (process/fs/network namespaces) — the app layer is isolated. What
is NOT isolated is the deploy touching **host-level** nginx + systemd + certbot.

Chosen approach: **keep the app containerized + ship auto-deploy now; treat full
host-level isolation as a separate, server-side project — not done blind.**
Reasoning: (1) an LXC/VM or rootless-Docker migration on a **live shared
production host** with other tenants is high-risk and the operator is
non-technical, so it needs a planned maintenance window — not an incidental
change folded into a deploy task; (2) the high-value, low-risk win — privilege
containment of the CI key (dedicated least-privilege key + restrictions instead
of reusing the operator's key) — is already done; (3) blind hardening of
`docker-compose.yml` (read-only rootfs, cap drops, mem limits) was deliberately
NOT applied because it can silently break or OOM a live service and should be
validated against the running stack, not guessed.

Alternatives considered:
- **Full isolation now (LXC/VM or rootless Docker under a dedicated user).** The
  "true" isolation: the deploy key would no longer see the rest of the host.
  Deferred — biggest blast radius, requires a stack move + a `deploy.sh` rewrite,
  and a maintenance window. This is the recommended next step when there's
  appetite for it.
- **nginx-in-a-container for negativezero.** Reduces host surface, but on a
  shared box a single front proxy must still own :443 and route by domain, so the
  host keeps a small negativezero vhost regardless — partial benefit, real
  migration cost. Folded into the full-isolation project rather than done alone.

What would invalidate this: the operator wanting real host isolation (then do the
LXC/rootless project as a new entry, rewriting `deploy.sh` for the isolated
target), or negativezero getting its own VPS (isolation becomes moot).

## 2026-06-19 — rename the Amethyst public URL /services/tts/ → /services/amethyst/

The transcription service is branded "Amethyst" everywhere in the UI but lived
at `/services/tts/`. Renamed the **public URL path** to `/services/amethyst/` so
the address matches the brand.

Scope: **URL path only.** The internal service identifier stays `tts`
everywhere it already is — the compose service/container name, the
`GATED_SERVICES`/authz key, the per-account grants, and the `TTS_HOST_PORT`
env. Renaming those would mean a data migration (account_services rows) and a
broad refactor for no user-visible benefit, so it was deliberately avoided.

What changed:
- **nginx** serves the PWA + API at `/services/amethyst/` (same prefix-strip
  proxy to the unchanged `tts` container). The old `/services/tts/` now
  **308-redirects** to `/services/amethyst/` (method/body preserving), and the
  legacy `/vtt-transcriber/` redirect was retargeted to the new path — so
  existing PWA installs, bookmarks, and the iPhone Shortcut keep working.
- **PWA** `app.js` bounces to `/services/admin/?return=/services/amethyst/`; the
  manifest is already relative (`scope: "./"`) so it needs no change.
- **admin** login `SERVICE_NAMES` maps both `amethyst` and (legacy) `tts` to
  "Amethyst" for the SSO destination label.
- Landing link + the integration-test default base URL point at the new path.

Alternatives considered: a full rename to `amethyst` (container, authz key,
grants) — rejected as above (migration cost, no user benefit); dropping the old
`/services/tts/` path outright — rejected because deployed standalone PWA
installs and the Shortcut would break, so it 308-redirects instead.

What would invalidate this: deciding the internal `tts` identifier should also
become `amethyst` (then do the grants migration in a new entry), or retiring the
legacy redirects once no client uses the old paths.

## 2026-06-19 — gate the Amethyst PWA on load + neutral SSO-hub login

A signed-out visit to Amethyst (`/services/tts/`) showed the app shell for a
moment, then bounced to a passkey screen titled "Admin" that accepted any
registered account's passkey. Audited the whole authz/account system
(`docs/AUTH_AUDIT_2026-06-19.md`): WebAuthn verification and the per-service
grant model are sound; the two symptoms were a UI flash and misleading login
branding, not a crypto bypass.

What changed:

- **Amethyst PWA verifies the session before revealing the UI.** Added
  `GET /api/v1/me` (dependency-only `verify_auth`, returns `200/401/403`) and a
  boot gate in `app.js` that hides the shell behind a "Checking access…" overlay
  until `/me` succeeds — `401` → SSO login, `403` → access-denied (no loop).
  Service-worker cache bumped `v10`→`v11`. Previously the static shell rendered
  to anonymous visitors because the Record tab fires no API call; the API itself
  was always gated, so this was a presentation bug, not a data leak.
- **The shared SSO-hub login (`/services/admin/`) is no longer branded
  "Admin".** It authenticates any account and is reached by every service via
  `?return=`; rebranded to "negativezero" with a destination-aware subtitle
  ("Sign in to continue to <service>"). Tightened the `?return=` allow-list
  against open-redirect tricks.

Alternatives considered: server-rendering an auth check for the PWA shell
(rejected — the PWA is intentionally a static, cache-first shell; a client gate
plus the already-gated API is sufficient and keeps the offline story intact).

Invalidated if: the PWA stops being a static same-origin shell, or the hub login
moves out of the admin app into a dedicated `/login` surface (then revisit the
branding there). The legacy local `userId==='owner'` path in the other TS
services (audit O1) remains a separate follow-up.

## 2026-06-18 — multi-account accounts + per-service authorization

Turned the platform from single-owner into a small multi-account system
managed entirely from admin. The owner can invite friends with setup
keys and grant/revoke each friend access to individual services.

What changed:

- **Admin is the identity + authorization authority.** It owns an
  `accounts` table (+ `account_services` grants) and is the only service
  that mints the apex `nz_session` SSO cookie. The cookie's `sub` now
  carries the real account id (the owner is the literal `owner`).
- **Authentication vs authorization split.** A valid `nz_session`
  signature only proves *who* you are. *Whether* an account may use a
  given service is a separate decision owned by admin and exposed at
  `GET /api/internal/authz?account=&service=` (guarded by the shared
  `SSO_SESSION_SECRET` as a bearer; 404'd from the public by nginx).
- **Each gated service enforces authz** after verifying the SSO cookie,
  caching admin's answer ~30s (stale-served ≤10min on an admin outage,
  else fail-closed). `ADMIN_AUTHZ_URL` unset ⇒ check skipped, so the
  change rolls out service-by-service without a flag day.
- **Setup keys create accounts.** A code generated in admin carries the
  set of services it grants; redeeming it (passkey registration) creates
  the account with those grants and consumes the code.
- **Amethyst (tts) joins the model.** The browser PWA no longer has an
  API-key field — it relies on the SSO cookie + a `tts` grant. The owner
  Bearer key (`AMETHYST_API_KEY`) stays for the iPhone Shortcut.

Alternatives considered:

- **Encode the service grants directly in the JWT** (stateless). Rejected
  as the primary mechanism: a 30-day cookie would make a revoked grant
  linger until re-login, which defeats the "toggle access off" intent.
  The live check (cached) makes a toggle effective within ~30s.
- **A shared DB of grants mounted into every container.** Rejected:
  couples storage across containers; an HTTP check to the existing SSO
  hub is cleaner and keeps admin the single writer.
- **Bring back a central IdP (Logto).** Still rejected for the same
  reason as 2026-05-28 — overkill at this scale.

What would invalidate this: enough accounts/traffic that the per-request
authz hop to admin (even cached) becomes a bottleneck or an availability
risk → move to short-lived JWTs carrying grants with a refresh, or a
replicated grants store. Also revisit if admin's uptime becomes the
limiting factor for the other services.

---

## 2026-06-16 — redirector added (short-link service, no at-rest encryption)

Added `apps/redirector/`, a passkey-protected short-link service mounted
at `/services/redirector/`. The owner pastes a destination URL and gets
back a permanent 16-character hash link
(`negativezero.one/services/redirector/<hash>`) that 302-redirects to it.
It's the bookmark manager turned inside out: instead of saving a link to
click later, you mint a short link to share. Built on the TS + Fastify +
better-sqlite3 + React/Vite/Tailwind default, copied from the
`video-downloader` template (the leanest current example), so it brings
no new dependencies and no convention exceptions.

Two deliberate departures from the bookmark-manager shape, recorded
because they were choices, not oversights:

- **No at-rest encryption.** bookmark-manager encrypts names + URLs with
  `ENCRYPTION_KEY`. Redirect *targets* are public destinations — anyone
  with the shareable hash link gets 302'd to them — so encrypting them
  buys nothing and the slug (the lookup key) must be queryable plaintext
  anyway. So no `REDIRECTOR_ENCRYPTION_KEY`; the service takes only
  `SESSION_SECRET` + `SETUP_CODE_HASH` (+ shared `SSO_SESSION_SECRET`).
- **No outbound fetch / no SSRF surface.** bookmark-manager and
  video-downloader fetch remote content (metadata, HLS) and carry an
  `ssrf.ts` guard. The redirector never fetches the target; it only
  emits a `Location` header and lets the browser navigate. Targets are
  validated to be `http`/`https` (rejecting `javascript:`, `data:`,
  `mailto:`, `file:`, …) so a stored target can't be a script URL, but
  there's no server-side request to guard.

**Routing note:** the 16-char hash lives directly under the service root
(`/services/redirector/<hash>`), which nginx prefix-strips to `/<hash>`.
The public route param is regex-constrained to the exact
`[a-z0-9]{16}` shape so a hash can never shadow the SPA (`/`), the API
(`/api/...`), or a static asset (`/assets/...`).

**Alternatives considered:**
- User-chosen custom slugs (like `go/my-link`) — rejected: the spec is a
  16-char hash minted server-side; the user supplies only the
  destination. Slugs are immutable permalinks (target + label are
  editable). Revisit if vanity slugs are ever wanted.
- Encrypting targets at rest for parity with bookmark-manager —
  rejected as above; revisit only if the threat model changes (e.g. the
  service starts storing private destinations that must stay secret from
  someone with filesystem access but not the link).

**What would invalidate this:** wanting vanity/custom slugs, or the
targets becoming genuinely sensitive (then add encryption like
bookmark-manager). Either is a new entry, not an edit here.

## 2026-06-13 — timezones added as a static service (no TS+Fastify backend)

Added `apps/timezones/`, a cross-timezone meeting planner, mounted at
`/services/timezones/`. It ships as a pure static site (HTML/CSS/JS)
served by an `nginx:alpine` container with a read-only bind-mount —
the same shape as `apps/landing/`, not the TS+Fastify default that
AGENTS.md prescribes for new services.

Origin: this is the negativezero home for the planner previously
prototyped in the private `ChocolateBrownie250/isg-time-planner` repo.
That repo was not reachable from the build session, so the service was
re-implemented fresh against the negativezero design system rather than
ported file-for-file.

**Alternatives considered:**
- TS + Fastify backend (the documented default) — rejected: the planner
  needs no server. The zone catalogue comes from
  `Intl.supportedValuesOf('timeZone')` and every offset/conversion from
  `Intl.DateTimeFormat`; state is per-browser `localStorage`. A backend
  would add a build, an image, and a process for zero behaviour.
- A React+Vite SPA like bookmark-manager/admin — rejected: same reason;
  a single screen with no auth or persistence-on-server doesn't justify
  a framework or a `base`-prefixed bundle.
- Static site served by nginx-alpine + bind-mount (mirrors landing) —
  **chosen**.

**Why this was chosen:**
The TS+Fastify rule exists to stop new *server* code from sprawling
across frameworks; it isn't a mandate to add a server where none is
needed. Landing already establishes the static-via-nginx-alpine
pattern, so this reuses an in-repo precedent and keeps the deploy
surface minimal (no secrets, no SQLite, no health endpoint beyond the
static root).

**What would invalidate this:**
- The planner grows server-side state (shared/saved plans, links you
  send other people, accounts) — promote it to TS+Fastify +
  better-sqlite3, matching bookmark-manager/admin.
- It needs server-held secrets or a third-party API call that can't be
  made from the browser — same promotion.

## 2026-05-28 — Logto removed from the platform; Neon dependency dropped

This **reverses** the 2026-05-21 entries "Logto as identity provider"
and "Logto lives on auth.negativezero.one subdomain" and **partially
reverses** "Postgres on Neon, not self-hosted" (Neon is no longer
needed for Logto; if a future component needs Postgres, the Neon
preference still applies).

**Alternatives considered:**
- Re-deploy Logto from this monorepo's compose, then proceed with
  Phase 2 (bookmark-manager → OIDC) — rejected: the live deployment
  at /srv/negativezero-services/ was torn down 2026-05-28 (containers
  stopped, nginx sites + TLS certs removed); rebuilding only to satisfy
  a documented-but-unrealised future feature is overkill at single-user
  scale.
- Keep Logto in the monorepo as "future-ready" while leaving the apex
  services on their own WebAuthn flow — rejected: documented surface
  that doesn't exist invites the next agent session to try deploying
  it. Better to remove and re-add later if/when actually needed.
- Remove Logto from compose, nginx, env, deploy.sh, docs; drop Phase 2
  from PLAN.md — **chosen**.

**Why this was chosen:**
The bookmark-manager and admin services use their own per-service
WebAuthn + setup-code flow today, work for the single operator, and
have zero practical need for a separate OIDC issuer. The whole point
of Logto (one identity covers all services, magic-link invitations to
add users) only earns its complexity when there are multiple users
across multiple services — neither holds today. Carrying Logto in the
codebase made next sessions try to deploy it; removing it makes the
documented surface match the running surface.

If multi-user does become a real need, the work is well-described in
git history (this monorepo's prior Phase 2 + the archived
ChocolateBrownie250/negativezero-services repo's `services/bookmark-
manager/server/` which already had multi-user JWT validation with 26
passing tests).

**What would invalidate this:**
- A second user (friend/family/team) needs access to a service —
  re-introduce an identity layer. Don't have to use Logto; could be
  Hanko, Kratos, Clerk, or a custom WebAuthn-per-tenant shim.
- Compliance or audit need for SSO with an existing IdP — requires
  OIDC client capability in the apex services.

---

## 2026-05-28 — Amethyst absorbed as apps/tts/ (was a separate tenant)

**Alternatives considered:**
- Leave Amethyst at /opt/amethyst/ with its own compose, install.sh,
  and `/vtt-transcriber/` URL — was the status quo. Rejected: two
  deploy models on the same VPS (this monorepo's platform/ vs.
  Amethyst's standalone) is operational debt. Adding admin features
  to Amethyst (configurable prompts) would require either teaching
  admin to reach across the file system boundary or re-deploying
  Amethyst from two places.
- Rewrite Amethyst in TypeScript + Fastify to match the monorepo's
  language convention — rejected: working Python/FastAPI service with
  tests, swap-rewriting it is weeks of work for no functional gain.
- Absorb the existing source unchanged into `apps/tts/`, accept a
  Python exception to the TS+Fastify convention, wire into
  platform/docker-compose.yml + nginx — **chosen**.

**Why this was chosen:**
The work to integrate is mechanical: copy the source tree (no edits
beyond the Dockerfile, which we own), drop it into apps/tts/, add the
compose service block, add the nginx location, generate a fresh API
key in deploy.sh, set up the per-service data dir. The upside is that
admin gets natural file-system access to the tts code/config (relevant
for the upcoming "edit cleanup + proofread prompts from admin" task),
backups become uniform (snapshot platform/data/), and the deploy story
collapses to one `platform/deploy.sh` instead of two parallel setups.

The legacy /vtt-transcriber/ URL is kept as a 301 redirect to
/services/tts/ so existing iPhone Shortcuts and bookmarks keep working
until they're updated client-side.

**What would invalidate this:**
- The Python toolchain (uv, the pinned deps) becomes a maintenance
  drag (e.g., Groq SDK changes break the API and the upstream amethyst
  repo stops getting updates) — at that point either fork into our
  own maintained version or rewrite in TS.
- A multi-tenant version needs to share auth state with admin or
  bookmark-manager — would force either a shared auth layer (probably
  re-introducing Logto) or rewriting tts in TS to share session-cookie
  middleware.

---

## 2026-05-28 — Python + FastAPI exception to the "TS + Fastify only" convention

**Alternatives considered:**
- Strictly enforce "TS + Fastify everywhere" by rewriting tts —
  rejected: see Amethyst-absorbed entry above; weeks of work for no
  functional gain on a working service.
- Drop the convention entirely, let each new service pick its own
  stack — rejected: the convention exists because keeping one
  language across services makes ops simpler (one runtime to update,
  one dependency-pinning strategy, one set of debugging habits). Two
  languages is sustainable; six wouldn't be.
- Treat tts as a one-off Python exception, document it explicitly in
  AGENTS.md, default new services back to TS + Fastify — **chosen**.

**Why this was chosen:**
The convention is a strong default, not a rule of nature. Imported
services that are working and tested don't have to be rewritten to fit
the default. Future net-new services still default to TS + Fastify;
when someone proposes a new Python (or Go, Rust, etc.) service, the
AGENTS.md exception note is the prompt to record *why* the deviation
is worth it in DECISIONS.md before the work starts.

**What would invalidate this:**
- A third language enters the platform without recorded justification
  — at that point the convention has degraded to a suggestion and
  should be either re-asserted or formally dropped.
- The Python container's operational overhead (image rebuilds,
  dependency upgrades, security patches) becomes a meaningful share of
  the maintenance budget — at that point rewriting tts in TS earns its
  cost.

---

## 2026-05-21 — Monorepo with `apps/` + `platform/` + `docs/` layout

This **reverses** the 2026-05-21 entry "Fresh repo, not branch of
`url-vault`" — we now keep landing, bookmark-manager, and platform
infra in one repo.

**Alternatives considered:**
- Polyrepo (three separate GitHub repos: `negativezero`, `url-vault`,
  `negativezero-services`) — the previous state. Rejected because
  every cross-cutting change (e.g., URL prefix rename, shared docs)
  required three PRs that had to be sequenced carefully.
- Conventional `apps/` + `packages/` Nx/Turborepo monorepo with
  shared TypeScript packages — rejected as overkill. Services don't
  share runtime code today; only docs are shared.
- Three top-level folders named after the source repos (`vault/`,
  `services/`, `landing/`) — rejected because it preserves repo
  identity in folder names that won't make sense once the original
  repos are archived.
- `apps/` (user-facing) + `platform/` (shared infra) + `docs/`
  (working-memory) layout — chosen.

**Why this was chosen:**
The three repos were three points on the same trajectory: landing →
auth platform → service. Keeping them apart was the accident of how
they were started, not a real architectural boundary. The new layout
scales by adding directories: a new service is `apps/<name>/` +
service block in `platform/docker-compose.yml` + nginx location in
`platform/nginx/`. No structural change needed per service. Shared
docs (CLAUDE/ARCHITECTURE/PLAN/DECISIONS) live in one place. Single
`deploy.sh` rolls everything out. Predecessor repo histories remain
on GitHub for reference but are not carried into the merge commit,
avoiding the inherited `HANDOVER.md` plaintext-credential leak.

**What would invalidate this:**
- Services start needing fundamentally different deploy targets (one
  on edge, one in a managed PaaS) → infra abstraction would need to
  split, single docker-compose stops being adequate.
- A second team starts contributing → may want per-app code ownership
  with separate PR flows, which is awkward in a small monorepo.

---

## 2026-05-21 — Postgres on Neon (managed, external), not self-hosted

This **reverses** the implicit decision in the original
`negativezero-services/infra/docker-compose.yml` to run Postgres as
a local container.

**Alternatives considered:**
- Self-hosted Postgres container with bind-mounted data volume on the
  VPS — original plan. Pros: zero external dependencies, all state
  local. Cons: backups are our problem, single-node, the VPS now has
  a stateful container with care-and-feeding overhead.
- Supabase — rejected, more than we need (we just want Postgres, not
  realtime/storage/auth — Logto provides auth).
- Railway / Render / fly.io Postgres — comparable to Neon. Neon won
  on serverless billing (scales to zero on idle, $0 for very small
  workloads) and a clean Postgres-only product surface.
- Neon — chosen.

**Why this was chosen:**
Logto's Postgres usage is small (auth metadata only) and bursty. Neon
gives us managed backups, point-in-time restore, and HA the VPS could
not match. Moving postgres off the VPS removes the only stateful
container we'd have to back up ourselves; what remains on disk is one
SQLite file for the bookmark-manager (trivial to snapshot). Trade-off:
Logto cold-starts may be slow if Neon has been idle, and we now have a
hard dependency on Neon being up. Acceptable for a personal platform.

The bookmark-manager keeps its **local SQLite** — its data is
single-tenant, tiny, and benefits from zero-latency local access. No
reason to put it on Neon.

**What would invalidate this:**
- Logto's DB usage grows to the point where Neon's free tier becomes
  expensive and a self-hosted Postgres ends up cheaper.
- A multi-region deployment ever happens (each region wants its own DB).
- Neon shuts down or changes pricing model unfavourably — migration
  path is `pg_dump` to a new managed Postgres on any provider.

---

## 2026-05-21 — Landing uses option 03 (spirograph / hypotrochoid, dark)

**Alternatives considered:**
Six design sketches were produced as part of the predecessor
`negativezero` repo:
- 01 Footnote — editorial two-column, paper-white, marginalia
- 02 Index — structured catalogue, paper-white, mono-heavy
- 03 Spirograph — dark, hypotrochoid canvas animation
- 04 Koch — dark, Koch fractal limit animation
- 05 Taylor — dark, KaTeX-typeset series convergence
- 06 Lorenz — dark, attractor phase plot

**Why 03 was chosen:**
- **Dark** matches the bookmark-manager's Apple HIG dark mode —
  visual continuity across `/` and `/services/bookmark-manager/`.
- **Pure aesthetic with minimal text** — no semantic concept
  ("infinity", "convergence", "ODE") that would feel odd as a homepage
  for a personal services platform.
- **Animation settles to a static gold flower** — beautiful at first
  paint, doesn't become noise on revisit.
- `prefers-reduced-motion` already handled in the source.

**What would invalidate this:**
- Platform grows past "personal services" into something more
  practical-tool-shaped; the spirograph would start to feel like
  decoration rather than identity.
- A future service has a visual identity that clashes with this
  landing's palette.

---

## 2026-05-21 — Logto lives on `auth.negativezero.one` subdomain, not under `/auth/` path on apex

This **partially revises** the 2026-05-21 entry "Path-mount under
`negativezero.one/services/<name>/`, not subdomain per service." The
path-mount principle still holds for **services** under `/services/...`.
What changed: identity sits on its own subdomain.

**Alternatives considered:**
- Logto path-mounted at `negativezero.one/auth/` — rejected after deeper
  doc reading. Logto's `ENDPOINT` config configures the OIDC issuer URL,
  not an HTTP base path. The Logto Core HTTP server expects to live at
  the host root; sub-path serving via nginx prefix-strip works for Core
  endpoints in principle but is not documented as supported and risks
  breakage on any minor Logto update (absolute URLs in redirects,
  embedded JS config, OIDC discovery paths).
- Custom IdP on Fastify — rejected per the "prefer industry-standard
  over what's already written" principle, plus a week-plus of work to
  rebuild what Logto ships.
- Two subdomains (auth + admin) — rejected as overkill for one tenant.
- One subdomain `auth.negativezero.one` serving both Core and Admin
  Console — chosen.

**Why this was chosen:**
Identity providers are an architectural category where dedicated
subdomain is the industry-standard pattern (Auth0, Okta, Clerk,
Cognito all use `auth.<customer>.tld` or `<customer>.<vendor>.tld`).
Reasons: clean issuer URL semantics, isolated cookie scope, dedicated
TLS cert for the auth surface, RP_ID isolation from service domains so
a service can't impersonate the identity layer. Logto's design assumes
this pattern; fighting it with nginx rewrites would be brittle.

Services (bookmark-manager, future ones) remain on path-mount under
`negativezero.one/services/...` — that part of the original decision
is unchanged. The user's principle "не нужно subdomain bookmarks.*"
was about service URLs, not identity infra; identity is a different
architectural concern with different constraints.

Admin Console will be attempted on the same subdomain under
`auth.negativezero.one/admin/` via `ADMIN_ENDPOINT` config. Logto's
support for sub-path on Admin specifically is not documented as
explicitly supported; if it breaks at deploy time, fallback is a
second subdomain `admin.negativezero.one`.

**What would invalidate this:**
- Logto stops being suitable (license flip, project abandonment), forcing
  a switch to a different IdP — picked successor may have different
  path requirements.
- Service-isolation requirements rise to the point where each service
  needs its own subdomain (e.g., for stricter cookie scoping or
  compliance) — at that point the platform shape changes wholesale.

---

## 2026-05-21 — Fresh repo, not branch of `url-vault`

**Alternatives considered:**
- Branch `v2` inside `url-vault` — preserves one git history; main stays
  as archival.
- Monorepo named `negativezero/` with `services/` and shared infra —
  forces both repos into one history forever.
- New repo `negativezero-services` — chosen.

**Why this was chosen:**
The new architecture replaces auth wholesale, splits identity into its
own service, introduces multi-tenancy, and changes the data model
(per-user namespacing). Almost no code from `url-vault` survives untouched.
Carrying that git history forward would be misleading — it suggests an
incremental evolution where in fact this is a different system that
happens to provide the same end-user feature. A clean repo also makes
the v1 archival boundary obvious and lets the old code be browsed at
its final state without v2 commits mixed in.

**What would invalidate this:**
If we ever decide to consolidate negativezero services with unrelated
projects (wellfit, isg) into a single platform monorepo, this repo
becomes a subdirectory of that. Unlikely in current scope.

---

## 2026-05-21 — Bookmark service keeps SQLite; Postgres only for Logto

**Alternatives considered:**
- Bookmarks on shared Postgres (the one Logto uses) — unifies the
  backup story to one DB dump.
- Bookmarks on its own Postgres container — strict isolation but doubles
  the Postgres operational surface.
- Bookmarks on SQLite as today — chosen.

**Why this was chosen:**
Bookmark data is small (one user's tree fits in megabytes), purely
hierarchical, and accessed only by the bookmark service itself. SQLite
with `better-sqlite3` handles this with zero operational overhead and is
already proven in the codebase. The backup story is "snapshot one
file"; restore is "copy one file back". Promoting to Postgres would buy
nothing concrete at our scale and introduce shared-DB coupling between
identity and bookmarks (which we explicitly don't want — auth changes
should not require bookmark DB migrations and vice versa).

**What would invalidate this:**
If a future service needs to join across bookmark data and another
service's data (unlikely — bookmarks are personal), or if SQLite-on-NFS
becomes a deployment constraint (we're on local disk on a single VPS,
so no), or if per-user database size reaches GB scale (extreme).

---

## 2026-05-21 — Single server-side `ENCRYPTION_KEY` for all users' bookmark data

**Alternatives considered:**
- Per-user encryption with key derived from the user's passkey — gives
  end-to-end encryption; server cannot read user data even if compromised.
- Single shared server key — chosen.
- No at-rest encryption — rejected; we still want defense if the DB file
  is exfiltrated without the server's env.

**Why this was chosen:**
Igor explicitly wants the admin role to be able to view any user's
bookmarks and folders ("admin может смотреть всех пользователей и в
пользователях смотреть их папки с папками, закладками"). That requirement
makes E2E impossible — if the server can't decrypt, neither can the
admin. The shared key model accepts that the server (and anyone with
the server's env file) can read all bookmark contents, in exchange for
the admin-visibility feature and for a recovery model that doesn't lose
data when a user's passkey is replaced.

**What would invalidate this:**
A future shift where bookmark data must be private from the server
operator — e.g., adding users outside Igor's trust circle who need
provable confidentiality. At that point the right move is per-user E2E
encryption and dropping the admin-views-user-data feature, not patching
the single-key model.

---

## 2026-05-21 — Path-mount under `negativezero.one/services/<name>/`, not subdomain per service

**Alternatives considered:**
- One subdomain per service (`bookmarks.negativezero.one`,
  `admin.negativezero.one`, etc.) — isolates RP_ID per service; DNS
  setup per service.
- Path-mount under `negativezero.one/services/<name>/` — chosen.
- Centralized identity at apex, services on subdomains — hybrid; rejected
  for the same RP-ID-sharing concerns we'd want to avoid anyway.

**Why this was chosen:**
Igor explicitly preferred path-mounting ("но bookmarks.negativezero.xyz
не надо"). The platform shape is "one apex, several services under it,
one identity provider", which path-mount expresses cleanly:
`negativezero.one/auth/` for identity, `negativezero.one/services/<name>/`
for each service. RP_ID is `negativezero.one` for all services — a
single passkey logs the user into the platform, then they get redirected
to whichever service. This is the right shape when identity is shared
across services by design (which it is here).

**What would invalidate this:**
If a service needs a completely isolated security boundary from the rest
of the platform (e.g., a service with stricter compliance requirements
where shared RP_ID is unacceptable), it should move to its own subdomain
with its own Logto instance or a separate auth realm. Not on the
horizon for the current set.

---

## 2026-05-21 — Logto as identity provider (rejected Hanko, Kratos, custom)

**Alternatives considered:**
- **Custom IdP on Fastify** — reuse the url-vault WebAuthn code, wrap as
  service. Rejected: violates the "prefer industry-standard over what's
  already written" principle Igor stated explicitly today.
- **Hanko** (AGPL-3.0, Go) — passkey-first by design. Rejected on closer
  reading: ships only Admin API (no UI), no native invitation flow,
  AGPL license is more restrictive. Would require us to build admin UI
  and invitation glue ourselves.
- **Ory Kratos** (Apache-2.0, Go) — most established self-hosted IdP.
  Rejected: headless (we'd write the UI), Hydra needed for OAuth
  flows, broader scope than we use. Operationally heavier than warranted.
- **Keycloak / Authentik** — explicitly ruled out by Igor: "не нужно
  стандартов промышленных гигантских приложений".
- **Logto** (MPL-2.0, TypeScript) — chosen.

**Why this was chosen:**
Best fit on the specific surface we need:
- Built-in Admin Console UI — no UI work for identity-level admin (user
  list, passkey management, sessions). We still write a bookmark-specific
  admin view, but that's domain-level.
- Magic-link invitation flow is a documented first-class feature, not
  something we build on top of a create-user endpoint.
- Standard OIDC issuer with `.well-known/jwks.json` — bookmark service
  becomes a plain OIDC client, no custom protocol.
- MPL-2.0 license is friendlier than AGPL (file-level copyleft, not
  network copyleft). Easier to keep adjacent code closed-source if ever
  needed.
- Active development: v1.39.0 in April 2026, 12k+ stars, 8.5k commits.
- Multi-tenancy out of the box if we ever want it.

The principle Igor articulated ("предпочтение благосклонности к
решению относительно его репутации как стандарта индустрии, или
самого лучшего варианта для определенной задачи") points here.

**What would invalidate this:**
- Logto project becomes unmaintained (no releases for 12+ months).
- License flip to something more restrictive than MPL-2.0.
- Hard requirement for a feature Logto doesn't ship that another IdP
  does (e.g., SCIM, federated identity at a scale Logto doesn't address).
- We exit single-VPS deployment and need an IdP designed for k8s clusters
  at scale (then Ory Kratos starts to win on operational maturity).

---

## 2026-05-21 — `url-vault` repo (v1) frozen; no migration of existing data

**Alternatives considered:**
- Patch v1 to fix the passkey sign-in bug, keep using it while v2 is
  built — keeps service usable during transition.
- Export v1 data to JSON before tearing it down, import into v2 later.
- Discard v1 data entirely, start clean on v2 — chosen.

**Why this was chosen:**
Igor confirmed the existing bookmark data was test/non-critical
("данные не важны, можно выкинуть"). Patching v1 to extract the data
would burn time on throwaway code; the bug fix doesn't translate to
v2 either since v2 has different auth entirely.

**What would invalidate this:**
N/A — this decision is point-in-time and cannot be reversed (the data is
gone). If we later wish we had it, the lesson is to always export before
teardown on services with even mildly real data.
