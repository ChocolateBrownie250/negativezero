# Citrine Implementation Report

Updated: 2026-06-23

## Status

Citrine is implemented, synced to GitHub `main`, deployed on the
NegativeZero VPS, and available at:

`https://negativezero.one/services/citrine/`

There are no blocking Citrine implementation tasks left for the requested
scope. Remaining items are optional product extensions or broader platform
operator tasks already tracked in `TODO.md`.

## What Was Built

Citrine is a private NegativeZero presentation-builder service for creating
web-native, aesthetically polished presentations from premade scalable
elements. It is intentionally not a PowerPoint clone: the core model is made
of responsive narrative scenes, semantic anchors, action links, preview
transitions, and a freeform canvas for arranging pages, elements, and
navigation relationships.

Implemented capabilities:

- Full editor shell with scene navigation, element palette, central stage,
  inspector, preview mode, and local document persistence.
- Premade element system for scalable presentation blocks, including text,
  callouts, metrics, charts, media, quotes, checklists, dividers, and
  navigation actions.
- Simple and Advanced editing modes, so the default surface is focused while
  layout, transition, frame, raw-data, and style controls remain available.
- Freeform canvas mode with page nodes, projected element nodes, visible action
  connections, Pan/Move modes, zoom/fit controls, and selected-page visibility.
- Responsive PWA UX for desktop, iPad, and iPhone: safe-area handling,
  touch-sized controls, bottom mobile navigation, sheets/drawers, touch-safe
  canvas gestures, and preview swipe navigation.
- Offline-safe PWA shell: app shell/static assets are cacheable; API, auth,
  imported sources, user data, and cross-origin requests are not cached.
- JSON import/export and server-side validation for presentation documents.
- Authenticated preservation of the downloaded Claude Design source archive,
  including `ISG Studio.html`, tokens, assets, source JSX, changelog, and import
  manifest.
- Existing NegativeZero SSO integration through admin-issued `nz_session`
  authorization plus per-service passkey fallback.

## Where It Was Done

Primary app:

- `apps/presentation-studio/` - Citrine service root.
- `apps/presentation-studio/client/` - React/Vite/Tailwind PWA editor.
- `apps/presentation-studio/client/public/manifest.webmanifest` - PWA
  manifest scoped to `/services/citrine/`.
- `apps/presentation-studio/client/public/sw.js` - scoped service worker with
  app-shell-only caching rules.
- `apps/presentation-studio/client/public/icon.svg`,
  `icon-192.png`, `icon-512.png`, and `apple-touch-icon.png` - PWA icons.
- `apps/presentation-studio/server/` - Fastify API, auth, static serving, and
  validation.
- `apps/presentation-studio/server/imports/isg-studio/` - preserved imported
  Claude Design project source.

Platform integration:

- `apps/admin/server/src/lib/accounts.ts` - added the `citrine` service grant.
- `apps/admin/client/src/pages/Login.tsx` - updated login/service copy for
  Citrine access.
- `platform/docker-compose.yml` - added the `citrine` service.
- `platform/deploy.sh` - added Citrine secrets, data directory setup, dynamic
  port handling, health wait, and deploy output.
- `platform/.env.template` - added Citrine environment variables.
- `platform/nginx/negativezero.one.conf` - added `/services/citrine/` routing.
- `.github/workflows/presentation-studio.yml` - Citrine build/test/audit CI.
- `.github/workflows/platform.yml` - platform deploy coverage for the service.

Documentation touched before this report:

- `README.md`
- `HANDOVER.md`
- `TODO.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/PLAN.md`
- `docs/presentation-studio-progress.md`

## Imported Design Source

The requested `claude_design` MCP connector was not available as a callable
tool in the session, and direct fetch of the Claude Design URL was blocked by a
Cloudflare challenge. The implementation therefore used the local design
template supplied by the user:

`/Users/magic/Downloads/[Template] tech-architecture-slides (2).zip`

The imported archive is preserved inside the Citrine service under:

`apps/presentation-studio/server/imports/isg-studio/`

Recorded provenance:

- Archive SHA-256:
  `5d8bb2cc6a273db54122f60773e606a6cafa8e572cf056513b0fc9511eefdf65`
- Imported `ISG Studio.html` SHA-256:
  `b62f71c5c132d0d66639cb8d83927146c7cac98463e2dda57e2a82bbd6d85783`
- Imported template families: 15

## Verification Performed

Local checks:

- `apps/presentation-studio` production build passed.
- `apps/presentation-studio/server` test suite passed.
- `apps/presentation-studio` production audit reported 0 runtime
  vulnerabilities for the production dependency set.
- `apps/admin` build and tests passed after adding the `citrine` grant.
- `platform/deploy.sh` and `platform/backup.sh` shell syntax checks passed.
- Compose/nginx template checks passed.
- `git diff --check` passed before commits.

Browser and product checks:

- Desktop editor smoke tested.
- Mobile viewport smoke tested at 390px width with no horizontal document
  overflow.
- In-app browser QA verified Citrine title, editor shell, preview/edit
  behavior, canvas nodes/connections, and clean relevant console output.
- PWA mobile smoke verified manifest, Apple mobile metadata, scoped service
  worker, no failed network responses, and no console errors/warnings.
- Product audit screenshots and notes were saved during implementation and the
  identified layout issues were remediated.

Security checks:

- Unauthenticated protected source access returns 401.
- Owner SSO authorization reaches protected source metadata.
- Imported source is served through authenticated routes with path traversal
  protection.
- URL actions are limited to safe schemes.
- Service worker avoids caching `/api/`, auth responses, imported source data,
  user documents, credentialed responses, and cross-origin requests.
- Manual source scan found no `dangerouslySetInnerHTML`, `innerHTML`, `eval`,
  `new Function`, or `document.write` usage in the Citrine editor path.

Production checks:

- GitHub `main` reached commit `87953750bb19503db966533a63ce7913886d7bc9`
  for the final Citrine sync before this report.
- After the GitHub Actions issue was fixed, the final `docs`, `security`, and
  `Deploy` workflows were rerun and passed.
- VPS `/srv/negativezero` matched GitHub `main` after dry-run rsync parity
  verification.
- `negativezero-citrine` was running healthy.
- Public health check passed:
  `https://negativezero.one/services/citrine/api/health` returned `{"ok":true}`.
- `sw.js` production headers included `Service-Worker-Allowed:
  /services/citrine/` and no-store cache controls.

## Deployment State

Production branch:

- `main` is the deployment branch for NegativeZero.
- Citrine implementation was committed and pushed to `main`.
- GitHub Actions deploy syncs the repo to the VPS and runs
  `platform/deploy.sh`.

Production location:

- Repo on VPS: `/srv/negativezero`
- Service path: `/services/citrine/`
- Container name: `negativezero-citrine`
- Data directory: `platform/data/citrine/`

Operational command pattern:

```bash
ssh wellfit
cd /srv/negativezero
bash platform/deploy.sh
```

The Citrine loopback host port is assigned dynamically by deploy logic and
should not be hardcoded. Use `docker ps` or the nginx template output to inspect
the current port when needed.

## What Is Left

No blocking work remains for the requested Citrine v1 implementation.

Optional Citrine product extensions:

- Server-side project persistence, project list, version history, and
  collaborative editing.
- Richer export targets beyond JSON, such as static publish bundles or deck
  package formats.
- Larger premade element library and a formal element/plugin authoring model.
- More import pipelines for Figma, local folders, and future design sources.
- Dedicated rotation flow for standalone Citrine fallback setup codes, if
  per-service passkeys are needed beyond admin SSO.
- Deeper visual regression coverage for a larger device matrix.

Platform/operator tasks still tracked elsewhere:

- Rotate the VPS root password.
- Revoke old GitHub PATs pasted into earlier sessions.
- Rotate the temporary Groq key.
- Rotate the exposed tts bearer key.
- Configure an off-host backup destination.

Those are platform security/operations items, not missing Citrine application
work. See `TODO.md` for the active checklist.

## Notes For Future Agents

- The real repo checkout used for this work is:
  `/Users/magic/Documents/Claude/01_Claude Code/negativezero-local`
- The CloudDocs `negativezero` folder can look like the working area but is not
  the Git checkout used for deployment.
- Do not overwrite `/srv/negativezero` from an older local tree. Pull/fetch
  current `main`, check for drift, and preserve live platform state before any
  deploy.
- The preserved local stash named `pre-citrine-main-sync-20260623T102502Z`
  contains unrelated pre-Citrine dirty work and should not be dropped unless the
  user explicitly requests it.
