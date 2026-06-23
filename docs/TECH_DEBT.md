# Technical debt

A concrete, file-referenced inventory of technical debt across the
negativezero platform, ranked by severity. Each item names the files
involved, the impact if left alone, and a remediation. This is a
point-in-time audit (2026-06-23) — update it when an item is paid down
or a new one lands; don't let it drift into a wishlist.

For how the platform is built see `docs/ARCHITECTURE.md`; for the
reasoning behind structural choices see `docs/DECISIONS.md`. Two sibling
audits ship alongside this one and are referenced inline below:
`docs/TESTING_STRATEGY.md` (the coverage plan) and
`docs/DESIGN_SYSTEM.md` (the shared-token plan). Those paths are sibling
PRs and may not exist yet in this branch.

**Severity key:**

- **High** — actively erodes safety or correctness now (untested
  security-relevant code, CI that silently doesn't run, leaked
  credentials). Fix soon.
- **Med** — real maintenance drag or latent risk that hasn't bitten
  yet (copy-paste drift, oversized modules). Schedule it.
- **Low** — cosmetic or housekeeping; do it opportunistically.

---

## Summary table

| # | Item | Theme | Severity | Status |
|---|------|-------|----------|--------|
| 1 | tts + video-downloader have no CI workflow | CI gaps | High | ✅ Resolved (#129, #130) |
| 2 | Admin tests never run in CI | CI gaps | High | ✅ Resolved (#137) |
| 3 | Operator key-rotation backlog | Operational | High | ⏳ Operator action |
| 4 | Untested new routes (Citrine CRUD, Basalt clone/icon) | Test coverage | High | ✅ Resolved (#132, #135; +#141, #142) |
| 5 | Copy-pasted shared modules, no workspace package | Duplication | Med | ◑ Audited: drift is cosmetic, no security gap; extraction deferred |
| 6 | `Dashboard.tsx` monolith (~2.5k lines) | Maintainability | Med | ◑ Started (#147); rest → Citrine Phase 5 |
| 7 | Citrine dual persistence (localStorage + server) | Maintainability | Med | ◑ Decision recorded; code precedence pending |
| 8 | No root workspace / shared tooling baseline | Duplication | Med | Open — deferred (breaks per-service Docker `npm ci`) |
| 9 | Stray iCloud `" 2"` duplicate assets | Housekeeping | Low | ✅ Resolved (#144) |

> **Update log — 2026-06-23 hardening pass.** A platform-wide docs+tests batch
> (PRs #128–#143) plus follow-ups closed the High-severity CI/coverage block:
> items **1, 2, 4** are resolved (CI now runs admin/video-downloader/tts; Citrine
> and Basalt routes are tested; the Citrine 2 MB cap and the timezones
> `GET`/`PATCH /api/presets/:id` routes were fixed in #141/#142), and item **9**
> is swept (#144). Item **7**'s canonical model is now recorded in
> `docs/DECISIONS.md` (server is source of truth, localStorage is an offline
> cache); the code-level precedence still rides with item 6. Items **5, 6, 8**
> remain open and are deliberately deferred — see each item for why (the
> workspace/shared-package work would change the per-service Docker build model,
> so it needs a deliberate, separately-reviewed effort, not an autonomous sweep).
> Item **3** is operator-only.

> **Update log — 2026-06-23 follow-up round.** Item **5**: the duplicated
> security modules were **audited for drift** — every `ssoSession.ts` copy
> fails closed on an empty secret, every `authz.ts` copy fails closed (`deny`)
> on an admin error, every passkey `auth.ts` verifies `expectedOrigin` +
> `expectedRPID`, and `codes.ts` diverges by *purpose* (registration vs backup
> codes), not by a missed fix. So the drift is cosmetic/structural and the
> "silent hole" risk is **not realized today** — that removes the security
> urgency from the extraction (it stays deferred as pure maintenance). Item
> **6**: the first safe slice landed — 14 pure element helpers extracted to
> `apps/presentation-studio/client/src/lib/elementHelpers.ts` (#147); the
> heavyweight component blocks are sequenced into Phase 5. The pre-existing
> Dependabot bumps (#95–#104) were reviewed (incl. the runtime majors
> node-html-parser 7→8 and @fastify/rate-limit 10→11, both safe for their
> actual usage) and merged.

---

## Theme: CI gaps

### 1. tts and video-downloader have no CI workflow at all (High)

`.github/workflows/` has a per-service workflow for admin,
bookmark-manager, landing, presentation-studio, redirector, and
timezones — but **no `video-downloader.yml` and no `tts.yml`**. Both
services ship a real test suite that consequently never runs on a push
or PR:

- `apps/video-downloader/server/src/__tests__/download.test.ts` — 10
  test cases; `package.json` defines `"test": "vitest run"`.
- `apps/tts/tests/` — `test_auth.py`, `test_chunker.py`,
  `test_groq_errors.py`, `test_integration.py`, ~82 pytest cases total
  (`pyproject.toml` configures `pytest` with `asyncio_mode = "auto"`).

These are exactly the services where regressions are most expensive:
video-downloader carries SSRF / byte-budget guards and tts carries
Bearer-auth and Groq error-mapping logic, both hardened in the
2026-06-18 security pass (see `TODO.md` Done section). Today nothing
stops a future edit from breaking them silently.

**Impact:** security-relevant code can regress with a green PR.

**Remediation:** add `.github/workflows/video-downloader.yml` (mirror
`presentation-studio.yml`: install → build → `npm run test` → docker
smoke) and `.github/workflows/tts.yml` (Python lane: `uv sync` →
`ruff check` → `pytest` → docker smoke). Track in
`docs/TESTING_STRATEGY.md`.

### 2. Admin's lib tests never run in CI (High)

`apps/admin/server` has a test script (`"test": "tsx --test
src/**/*.test.ts"`) and ~20 cases across two files —
`apps/admin/server/src/lib/accounts.test.ts` (17) and
`apps/admin/server/src/lib/codes.test.ts` (3). But
`.github/workflows/admin.yml` only runs `npm run build` and a docker
smoke; it has **no test-execution step** (the header comment even says
"No `server tests` step yet"). Admin owns the multi-account authz table
and the registration-code generator — the highest-trust surface on the
platform — so untested-in-CI here is worse than the line count
suggests.

**Impact:** the account/authz and setup-code logic can regress
unnoticed; `accounts.ts` is what every gated service consults via
`GET /api/internal/authz`.

**Remediation:** add a `server tests` step to `admin.yml` (run
`npm run test` for the server workspace), matching `bookmark-manager.yml`
and `presentation-studio.yml`.

### 3. Operator key-rotation backlog (High — operational)

`TODO.md` carries unchecked operator rotation items that are security
debt until done. Two are credential exposures:

- The temporary **Groq key** in `platform/.env` is a throwaway test key
  pasted in to verify the 502 fix (2026-06-18); it needs replacing with
  a fresh key and a tts recreate.
- The **tts Bearer key** (`TTS_API_KEY` / `AMETHYST_API_KEY`) was once
  committed as a hard-coded fallback in
  `apps/tts/tests/test_integration.py` (removed 2026-06-18) and is
  therefore **exposed in git history** — treat as leaked and rotate.

Also outstanding in `TODO.md`: rotate the VPS root password (previously
committed plaintext) and revoke any GitHub PATs pasted into earlier
sessions.

No key, hash, or token value is reproduced here by design — see
`TODO.md` and `HANDOVER.md` for the exact rotation procedures.

**Impact:** a leaked credential remains valid until rotated; git-history
exposure cannot be undone by deletion.

**Remediation:** complete the rotation checklist in `TODO.md` (operator
browser/VPS steps), then check the items off. The deploy-time Groq
validity check already warns on a rejected key, so a stale Groq key
surfaces loudly; the Bearer key has no equivalent and should be rotated
first.

---

## Theme: test coverage

### 4. New routes shipped without tests (High)

Two recently added route surfaces carry persistence and validation logic
but have no tests:

- **Citrine** — `apps/presentation-studio/server/src/routes/presentations.ts`
  is full owner-scoped CRUD (`GET`/`POST`/`GET :id`/`PUT :id`/`DELETE
  :id`) with a 2 MB document cap, a structural `isStorableDocument`
  gate, and per-owner row scoping. The only server test,
  `apps/presentation-studio/server/src/__tests__/presentation.test.ts`,
  covers `validatePresentationDocument` and the source-import auth gate
  — it never touches the `/presentations` routes. Owner-isolation
  (account A cannot read account B's deck) is precisely the property
  that needs a regression test and has none.
- **Basalt / bookmark-manager** — `apps/bookmark-manager/server/src/routes/nodes.ts`
  defines `POST /nodes/clone` (recursive `cloneSubtree`, line ~393) and
  the `icon` validation branch in `PATCH /nodes/:id` (emoji/lucide/`bg`
  rules, line ~234). The existing
  `apps/bookmark-manager/server/src/__tests__/nodes.test.ts` is a
  6-case double-encryption regression suite for `PATCH` move/rename/url
  only — it exercises neither clone nor icon validation.

**Impact:** owner-scoping and input-validation bugs in
security-relevant CRUD can ship green.

**Remediation:** add route-level tests — for Citrine, a cross-owner
isolation case plus the size/shape rejections; for Basalt, a
clone-subtree integrity case plus icon accept/reject cases. Fold into
`docs/TESTING_STRATEGY.md`. (Note this compounds with items 1–2: even
written, video-downloader/tts/admin tests still wouldn't run in CI.)

---

## Theme: duplication

### 5. Copy-pasted shared modules with no shared package (Med)

The same handful of modules is physically copied into each service
instead of imported from one place. There is **no shared workspace
package** — every service is a standalone npm project under `apps/`.

Client design tokens — `colors.ts` is duplicated across five clients:

- `apps/bookmark-manager/client/src/lib/colors.ts`
- `apps/admin/client/src/lib/colors.ts`
- `apps/redirector/client/src/lib/colors.ts`
- `apps/video-downloader/client/src/lib/colors.ts`
- `apps/presentation-studio/client/src/lib/colors.ts`

Server auth/util modules — `authz.ts`, `ssoSession.ts`, `webauthn.ts`,
and `codes.ts` each appear in five-to-six service `server/src/lib/`
directories.

The important nuance: **these copies have already drifted.** They are
not byte-identical. For `authz.ts`, three services
(bookmark-manager, video-downloader, redirector) share one hash while
presentation-studio and timezones differ; `ssoSession.ts` shows the same
split. `webauthn.ts` diverges meaningfully — bookmark-manager's copy
carries an `isLikelyLocalhost()` helper and a different `RP_NAME` that
admin's copy lacks. `colors.ts` shares the palette values but the
comments and exact entries vary. This is copy-and-drift, which is the
worst kind: a security fix to one `ssoSession.ts` (e.g. the
2026-06-18 fail-closed-on-empty-secret change) has to be hand-applied
to every copy, and a missed copy is a silent hole.

**Impact:** N-place edits for every shared-logic change; drift creates
inconsistent security behavior across services.

**Remediation:** extract a shared workspace package (e.g.
`packages/platform-auth` for `authz`/`ssoSession`/`webauthn`/`codes`
and `packages/ui-tokens` for `colors`), convert `apps/` into npm
workspaces, and import from the package. Reconcile the existing drift
during extraction — pick the canonical version per module deliberately.
Pair with `docs/DESIGN_SYSTEM.md` for the token half.

### 8. No root workspace or shared tooling baseline (Med)

There is no root `package.json` and no workspaces declaration — each
service vendors its own `package-lock.json`, tsconfig, lint, and test
runner config. This is the structural reason item 5 exists (nowhere to
put shared code) and the reason CI is one workflow per service rather
than a single matrix. It also means tooling versions drift per service
(e.g. some clients on Vite 7, some on 8) with no single place to align
them.

**Impact:** no home for shared packages; per-service config drift;
CI sprawl.

**Remediation:** introduce a root `package.json` with an `apps/*` +
`packages/*` workspaces glob (npm workspaces, no new tooling). This
unblocks item 5 and lets CI consolidate. Low risk — it's additive and
doesn't change how individual services build.

---

## Theme: maintainability

### 6. `Dashboard.tsx` is a ~2.5k-line monolith (Med)

`apps/presentation-studio/client/src/pages/Dashboard.tsx` is ~2,468
lines and mixes several concerns in one component: the slide editor,
edit-history/undo, dual persistence (localStorage + server sync),
deck switching across multiple saved presentations, and preview/canvas
interaction. It is the single largest source file in the repo and the
hardest to review safely.

**Impact:** every Citrine change is a high-risk edit to one giant file;
hard to test units in isolation; merge-conflict magnet.

**Remediation:** decompose by concern — extract the persistence/sync
layer (which would also make item 7 testable), the deck-list/switching
UI, and the editor canvas into separate modules/hooks. No behavior
change; pure structural refactor. Do it in slices behind the existing
build + smoke checks rather than one big-bang rewrite.

### 7. Citrine runs two overlapping persistence layers (Med)

Citrine V1 stored the active project in browser `localStorage`
(`apps/presentation-studio/client/src/lib/storage.ts`, key
`negativezero:citrine:v1`). Server-side persistence then landed via the
`/presentations` routes (item 4), but the localStorage path was **not
retired** — `Dashboard.tsx` still loads from localStorage first
(offline-safe initial state) and mirrors edits there while syncing to
the server when authenticated.

This is deliberate offline-first design, not dead code — but it is
under-documented dual-write complexity. `docs/ARCHITECTURE.md` still
describes Citrine V1 persistence as browser-local only and doesn't
mention the server layer that now coexists with it. The open questions
are real: which store wins on conflict, and when (if ever) the
localStorage mirror should be dropped or downgraded to a pure offline
cache.

**Impact:** two sources of truth with implicit precedence; a stale
localStorage copy can mask or override server state; the doc no longer
matches the code.

**Remediation:** decide and document the canonical model — likely
"server is source of truth; localStorage is an offline cache" — in
`docs/ARCHITECTURE.md` and `docs/DECISIONS.md`. Then make the precedence
explicit in code (extracted as part of item 6) and cover it with the
tests from item 4. No code is dead today, so nothing to delete yet;
revisit once the model is decided.

---

## Theme: housekeeping

### 9. Stray iCloud `" 2"` duplicate assets (Low)

The repo working tree on the operator's machine carries iCloud-style
duplicate files (untracked, never committed) under three clients'
`public/` directories:

- `apps/admin/client/public/icon 2.svg`,
  `apps/admin/client/public/manifest 2.webmanifest`
- `apps/redirector/client/public/icon 2.svg`,
  `apps/redirector/client/public/manifest 2.webmanifest`
- `apps/video-downloader/client/public/icon 2.svg`,
  `apps/video-downloader/client/public/manifest 2.webmanifest`

These are iCloud Drive sync conflict copies (the trailing `" 2"`), not
intentional assets. They are untracked, so they don't affect builds or
deploys, but they're cruft that can confuse `git status` and risks
being accidentally committed.

**Impact:** none functionally; noise in `git status`, accidental-commit
risk.

**Remediation:** delete the six files (`rm "apps/.../icon 2.svg"` etc.)
and optionally add a `.gitignore` rule for `* 2.*` to stop new sync
copies from showing up. Not removed in this audit PR — this is a
documentation pass.

---

## Suggested next actions

In priority order:

1. **Wire the missing CI** (items 1, 2) — add `tts.yml` and
   `video-downloader.yml`, and an admin test step. Highest
   safety-per-effort: it makes ~110 already-written tests actually
   guard the platform.
2. **Rotate the exposed credentials** (item 3) — operator task; the
   git-history-leaked tts Bearer key first, then the temp Groq key.
3. **Test the new routes** (item 4) — Citrine owner-isolation and
   Basalt clone/icon, then ensure they run in CI (depends on item 1).
4. **Stand up workspaces + extract shared packages** (items 8, 5) —
   root `package.json` first, then lift `authz`/`ssoSession`/
   `webauthn`/`codes`/`colors` into shared packages, reconciling the
   existing drift. Coordinate with `docs/DESIGN_SYSTEM.md`.
5. **Decompose `Dashboard.tsx` and settle Citrine persistence**
   (items 6, 7) — refactor in slices, then document and test the
   canonical store.
6. **Sweep the stray `" 2"` files** (item 9) — opportunistic cleanup.

Items 1–4 are the High-severity block and should land before the Med
refactors; the refactors are safer once tests exist to catch
regressions.
