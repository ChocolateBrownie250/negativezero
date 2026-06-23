# Citrine Implementation Progress

Updated: 2026-06-23

## Objective

Implement a private NegativeZero Citrine service end to end:

- import or preserve the Claude Design `ISG Studio.html` source;
- build an editor foundation for aesthetically polished web-native presentations from premade elements;
- avoid a PowerPoint-like fixed-slide model by using responsive narrative scenes, semantic anchors, action navigation, and transition choreography;
- prepare the service as a scalable base for a future web presentation editor;
- test, audit, and prepare deployment wiring.

## Current Decisions

- Service path: `/services/citrine/`.
- App directory: `apps/presentation-studio/`.
- Stack: TypeScript + Fastify backend, React + Vite + Tailwind frontend, matching existing private TS services.
- Auth: admin SSO first, per-service passkey fallback, same pattern as `video-downloader`.
- V1 persistence: browser local storage plus JSON import/export; server-side saved projects are deferred.
- Presentation model: responsive narrative scenes, not fixed slide pages.
- Canvas model: pages, premade elements, and navigation relationships are editable on a freeform map instead of a slide sorter.
- Editing levels: Simple mode keeps content/action editing focused; Advanced mode exposes scene transitions, layout frames, style controls, raw data, and the full element palette.
- Editor chrome direction: Apple-HIG-inspired density, segmented controls, lower-radius utility surfaces, clear focus states, and functional inspector depth instead of appearance-only simplification.
- Imported source path: `apps/presentation-studio/server/imports/isg-studio/ISG Studio.html`.

## External Source Status

- [x] Checked local CloudDocs `negativezero` folder for `ISG Studio.html`; no local file found.
- [x] Checked for callable `claude_design` MCP tools; none were exposed in this session.
- [x] Checked installable plugin list for `claude_design`; no exact connector match found.
- [x] Tried fetching the Claude Design URL directly; `curl` received Cloudflare challenge HTTP 403.
- [x] Opened the Claude Design URL in Chrome and confirmed the project preview loads.
- [x] Imported the user-provided downloaded Claude Design archive: `/Users/magic/Downloads/[Template] tech-architecture-slides (2).zip`.
- [x] Preserved `ISG Studio.html`, runtime tokens/assets, source JSX files, changelog, and import manifest under `server/imports/isg-studio/`.
- [x] Updated the seed document from `pending_mcp_import` to `imported` with archive and HTML SHA-256 provenance.

Connector note: `claude_design` MCP tools were still unavailable in this session. The import was completed from the downloaded Claude Design archive supplied by the user.

## Progress Checklist

### 1. Workspace And Baseline

- [x] Created isolated worktree at `~/.config/superpowers/worktrees/negativezero-local/presentation-studio`.
- [x] Created branch `claude/presentation-studio-service`.
- [x] Installed Node dependencies in existing TS services for baseline checks.
- [x] Ran `npm run test` in `apps/admin` after install: 3 pass, 0 fail.
- [x] Ran `npm -w server run test` in `apps/video-downloader` after install: 10 pass, 0 fail.

### 2. Service Foundation

- [x] Create `apps/presentation-studio/` workspace package.
- [x] Add Fastify server with health endpoint, static SPA serving, secure session, auth routes, and protected API boundary.
- [x] Add React/Vite/Tailwind client with production base `/services/citrine/`.
- [x] Add Dockerfile matching existing TS service conventions.
- [x] Add package lock and TypeScript configs.

### 3. Editor Foundation

- [x] Define presentation document, scene, element, action, transition, and theme types.
- [x] Build element registry for premade scalable components.
- [x] Seed ISG-style project data with imported Claude Design archive provenance.
- [x] Build responsive app shell: scene navigator, element palette, central stage, inspector, and preview mode.
- [x] Implement element selection, editing, duplicate/delete, scene switching, preview navigation, reduced-motion handling, and local persistence.
- [x] Implement JSON export/import with validation.
- [x] Add chart/data-ready elements with accessible non-hover fallbacks.
- [x] Add Simple and Advanced editing levels for design/editing sophistication.
- [x] Add logically missing premade elements: media, quote, checklist, and divider.
- [x] Polish editor chrome for better alignment, spacing, focus states, and professional utility-pane ergonomics.
- [x] Add freeform canvas mode for positioning scenes/pages, mapped elements, and action connections.

### 4. Platform Wiring

- [x] Add `citrine` service to `platform/docker-compose.yml`.
- [x] Add `/services/citrine/` nginx location.
- [x] Add env vars to `platform/.env.template`.
- [x] Update `platform/deploy.sh` for data dir, secrets, port assignment, compose start, smoke wait, nginx token substitution, and final service URL.
- [x] Add `citrine` to the admin registration-code whitelist.
- [x] Update docs: `docs/ARCHITECTURE.md`, `docs/PLAN.md`, `TODO.md`, and `docs/DECISIONS.md` if new architectural choices are introduced.

### 5. Verification

- [x] Server tests for protected API rejection, document validation, no-op actions, and unsafe URL rejection.
- [x] Client build.
- [x] Service build.
- [x] Platform syntax/config validation.
- [x] Browser/runtime smoke test on desktop and mobile-width Chrome.
- [x] Accessibility and reduced-motion source checks.
- [x] Security review for auth, import parsing, local persistence, action URLs, and deploy env handling.
- [x] Deployment handoff with exact VPS commands and operator-only steps.

## Verification Log

- 2026-06-23: `apps/admin` baseline test passed after dependency install: 3 tests, 0 failures.
- 2026-06-23: `apps/video-downloader/server` baseline test passed after dependency install: 10 tests, 0 failures.
- 2026-06-23: Claude Design direct fetch failed with HTTP 403 Cloudflare challenge; source import was completed later from the downloaded Claude Design archive supplied by the user.
- 2026-06-23: User provided `/Users/magic/Downloads/[Template] tech-architecture-slides (2).zip`; archive SHA-256 is `5d8bb2cc6a273db54122f60773e606a6cafa8e572cf056513b0fc9511eefdf65`.
- 2026-06-23: Imported `ISG Studio.html` from the downloaded archive; HTML SHA-256 is `b62f71c5c132d0d66639cb8d83927146c7cac98463e2dda57e2a82bbd6d85783`; manifest records 15 template families.
- 2026-06-23: `apps/presentation-studio/server` test passed: 3 tests, 0 failures.
- 2026-06-23: `apps/presentation-studio` build passed: client `tsc -b && vite build`, then server `tsc -p tsconfig.json`.
- 2026-06-23: Replaced inherited native `bcrypt` dependency with `bcryptjs`; `npm audit --omit=dev` in `apps/presentation-studio` reports 0 vulnerabilities.
- 2026-06-23: Added server/client URL-action hardening. Server tests now pass: 5 tests, 0 failures.
- 2026-06-23: Rebuilt `apps/presentation-studio`: client `tsc -b && vite build`, then server `tsc -p tsconfig.json`.
- 2026-06-23: `apps/admin` build passed after adding `citrine` to the registration-code whitelist.
- 2026-06-23: `bash -n platform/deploy.sh && bash -n platform/backup.sh` passed.
- 2026-06-23: `docker compose -f platform/docker-compose.yml config` could not run locally because Docker is not installed in this environment; YAML parse confirmed the private editor service, build context, port, volume, and env keys.
- 2026-06-23: Runtime smoke passed on `127.0.0.1`: `/api/health`, SSO-authenticated `/api/auth/me`, valid document validation, unsafe URL validation rejection, and Vite frontend title check.
- 2026-06-23: Vite-origin proxy smoke passed on `127.0.0.1:5176`: SSO-authenticated `/api/auth/me` and protected document validation both route to the backend on `3000`.
- 2026-06-23: Protected source-route smoke passed for imported assets: authenticated `/api/source/isg-studio/ISG%20Studio.html` returns `<title>ISG · Studio</title>`, authenticated `/api/source/isg-studio/import-manifest.json` returns template count 15, and unauthenticated source access returns 401.
- 2026-06-23: Chrome visual smoke passed: login shell rendered, SSO-authenticated editor rendered at desktop width, and mobile-width resize showed the responsive scene/element controls in a scrollable layout.
- 2026-06-23: Chrome DOM smoke confirmed the editor now shows `Claude Design source imported`, the Source button, `ISG Studio.html`, 15 template families, and SHA prefix `b62f71c5`.
- 2026-06-23: In-app Browser QA passed for the SSO-authenticated dashboard: page title `Citrine · negativezero`, nonblank imported-source state, clean relevant dashboard console, and Preview/Edit interaction.
- 2026-06-23: Mobile QA found and fixed toolbar overflow; a 390px viewport now reports `scrollWidth` equal to `clientWidth`.
- 2026-06-23: Source audit found no `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, or `document.write`; external actions use `noopener,noreferrer` and are now limited to `http`, `https`, or `mailto`.
- 2026-06-23: Reduced-motion CSS is present through `@media (prefers-reduced-motion: reduce)` and UI controls use button semantics / ARIA where needed.
- 2026-06-23: `gitleaks` is not installed locally. Manual secret-pattern scan found documented host/variable references, not committed secret values.
- 2026-06-23: Final post-import checks passed after the responsive fix: `npm -w server run test` (6 tests), `npm run build`, `npm audit --omit=dev`, `bash -n platform/deploy.sh && bash -n platform/backup.sh`, compose YAML parse, and `git diff --check`.
- 2026-06-23: Added Simple/Advanced editing levels. Simple mode hides advanced palette items and layout/style controls; Advanced mode shows scene layout, transition duration, frame controls, style tone/radius/accent, and raw chart data.
- 2026-06-23: Added premade `media`, `quote`, `checklist`, and `divider` elements with renderers, default props, optional style metadata, and seed migration for existing localStorage seed projects.
- 2026-06-23: Polished editor chrome with Apple-HIG-style segmented controls, lower-radius utility surfaces, clearer hover/focus states, quieter rails, and structured inspector sections.
- 2026-06-23: New validation coverage confirms upgraded element types and optional style metadata. `npm -w server run test` now passes 7 tests.
- 2026-06-23: In-app Browser QA confirmed Simple mode hides advanced controls, Advanced mode exposes full controls and palette, adding Checklist works, dashboard console remains clean, and a 390px mobile viewport has no horizontal overflow.
- 2026-06-23: Added Stage/Canvas surface switch. Canvas mode renders draggable page nodes, projected element nodes, URL/action targets, and scene/anchor/url connection paths; Advanced mode exposes canvas x/y fields.
- 2026-06-23: In-app Browser QA confirmed Canvas mode renders 2 page nodes, 9 element nodes, and 2 connection paths with no console errors; dragging a page updated canvas coordinates from `70,80` to `150,140`, and selecting a canvas element opened its inspector values.
- 2026-06-23: Standalone mobile-width QA at 390px confirmed Canvas mode is contained in its own scrollable board: document `clientWidth=390`, `scrollWidth=390`, canvas board `scrollWidth=1040`, and no console errors.
- 2026-06-23: Product Design audit saved to `audits/citrine-product-audit-2026-06-23/` with desktop, advanced, canvas, preview, and mobile screenshots. Findings were remediated locally.
- 2026-06-23: Renamed public product surface to Citrine: app title, dashboard/login shell, storage/export keys, WebAuthn metadata, docs, admin service whitelist, nginx route, compose service, deploy env vars, and final URL now target `/services/citrine/`.
- 2026-06-23: Preview mode no longer shows Duplicate or Delete controls; those remain edit-only.
- 2026-06-23: Final clean Playwright QA passed on desktop and 390px mobile: title `Citrine · negativezero`, h1 `Citrine`, editor present, no visible `Presentation Studio` shell copy, Preview active with Duplicate/Delete counts `0`, Canvas with 2 pages / 8 elements / 2 links, no console errors, no warnings, and no bad network responses.
- 2026-06-23: Android emulator QA skill was checked and found not applicable: this service is a web app, and the workspace contains no Android project/package/emulator tooling.
- 2026-06-23: Final checks passed after Citrine remediations: `npm run build` in `apps/presentation-studio`, `npm -w server run test` in `apps/presentation-studio` (7 tests), `npm run build` in `apps/admin`, `npm run test` in `apps/admin` (3 tests), `npm audit --omit=dev`, `bash -n platform/deploy.sh`, `bash -n platform/backup.sh`, Python YAML compose-template parse, nginx-template checks, and `git diff --check`.
- 2026-06-23: Production deploy was not run from this agent session because `AGENTS.md` marks any Vultr VPS SSH/deploy action as human-operator-only. Deploy wiring and handoff commands are ready.
- 2026-06-23: Fresh production deploy attempt check: `~/.ssh/wellfit_prod_ed25519` is missing, `ssh-add -l` reports no identities, searching `/Users/magic` found no `wellfit_prod_ed25519*` file, and non-interactive `ssh root@45.76.88.245` fails with `Permission denied (publickey)`.
- 2026-06-23: Pre-deploy live check returned nginx `404 Not Found`; this was superseded by the production deployment and verification entries below.
- 2026-06-23: Found the active production SSH alias `wellfit`, using `~/.ssh/id_ed25519_wellfit_agent`, and confirmed `ssh wellfit` reaches the Vultr host.
- 2026-06-23: Production `/srv/negativezero` had newer live platform work not present in this local branch: Basalt/Amethyst public route names, Redirector, gated Fastify Timezones, service healthchecks, admin per-service authorization, and Groq-key deploy verification. The deploy preserved that state and added Citrine as an additional service instead of whole-repo rsyncing this older branch over production.
- 2026-06-23: Synced `apps/presentation-studio/` to `/srv/negativezero/apps/presentation-studio/`; patched production compose/deploy/nginx/admin files with backups to add `citrine`, `CITRINE_*` env seeding, `/services/citrine/`, and admin gated-service authorization.
- 2026-06-23: Updated Citrine auth to match the live per-service authorization contract: SSO cookies are verified into account claims, protected routes call admin `/api/internal/authz`, revoked cookies are cleared, and `/api/auth/me` reports authenticated only when admin authorizes the account for `citrine`.
- 2026-06-23: Ran production `platform/deploy.sh` with setup-code output redacted. Deploy built and started `negativezero-citrine`, nginx config test passed, certbot reinstalled the existing certificate, and the deploy script health check reported `citrine up`.
- 2026-06-23: Final production verification passed: `https://negativezero.one/services/citrine/` returns HTTP 200 with title `Citrine · negativezero`; `/services/citrine/api/health` returns `{"ok":true}`; unauthenticated `/api/auth/me` returns `authenticated:false`; an SSO token for owner returns `authenticated:true`; authenticated protected source manifest returns HTML SHA-256 `b62f71c5c132d0d66639cb8d83927146c7cac98463e2dda57e2a82bbd6d85783` and 15 template families; `negativezero-citrine` is healthy; production `npm audit --omit=dev` reports 0 vulnerabilities.
- 2026-06-23: Synced Citrine into GitHub `main` (`7103479`, followed by CI workflow fix `2af86f8`), added `.github/workflows/presentation-studio.yml`, verified final Actions for `platform`, `presentation-studio`, and `security` passed, manually rsynced final `main` to `/srv/negativezero`, reran `platform/deploy.sh`, and confirmed dry-run rsync parity.
- 2026-06-23: Production browser-level PWA smoke passed at 390x844 mobile viewport: title `Citrine · negativezero`, H1 `Citrine`, manifest and apple touch icon present, `apple-mobile-web-app-capable=yes`, service worker scope `https://negativezero.one/services/citrine/`, no horizontal overflow, no console warnings/errors, and no failed network responses.

## Deployment Handoff

Production is deployed at `https://negativezero.one/services/citrine/`.
The live VPS currently has newer platform state than this local branch, so
future deploys should preserve the live Basalt/Amethyst/Redirector/Timezones
state instead of whole-repo syncing this worktree over `/srv/negativezero/`.

The SSH alias used for the successful deploy was:

```bash
ssh wellfit
```

The first-run Citrine setup code was intentionally redacted from Codex output.
Admin SSO works for the owner. If a standalone Citrine passkey fallback is
needed later, rotate `CITRINE_SETUP_CODE_HASH` on the VPS and capture the new
setup code in a secure operator shell, not chat.
