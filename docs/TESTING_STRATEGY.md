# Testing Strategy

How the negativezero platform is tested, service by service, and what
the test suite is deliberately *not* trying to do. Update this when a
service gains its first tests, a CI test step is wired (or removed), or
the testing conventions below change.

For the platform architecture see `ARCHITECTURE.md`; for the running
roster of known gaps and remediation work see the `docs/TECH_DEBT.md`
inventory.

---

## Philosophy

This is a small, single-operator, self-hosted platform. The testing
posture matches that scale: a pragmatic test pyramid, weighted toward
fast tests that catch the regressions we actually hit, with no ambition
to chase a coverage number.

- **Unit / lib tests for pure logic.** The riskiest non-obvious code —
  AES-256-GCM encryption round-trips, slug generation and validation,
  URL normalization, SSO mint/verify, backup-code hashing, text
  chunking — is tested in isolation with no I/O. These are the cheapest
  tests to write and the ones that catch the subtlest bugs (e.g. the
  bookmark double-encryption regression).
- **Route / integration tests in-process.** HTTP behaviour is tested by
  building the real app and injecting requests with Fastify's
  `app.inject()` for the TypeScript services. No network, no container —
  the handler, the router, the auth gate, and a temp SQLite database all
  run in the test process. This is the bulk of the route coverage: auth
  gating, validation rejections, CRUD round-trips, account scoping.
  (Amethyst/tts uses FastAPI's `TestClient` for the same purpose, but its
  suite now lives in the `amethyst-independent` repo, not here.)
- **Docker smoke tests in CI.** Each service workflow builds its image
  and boots the container with stub secrets to confirm it starts and
  (where applicable) serves a health endpoint. This catches runtime
  image-layout regressions that unit tests can't see.
- **No heavy e2e / browser suite today.** There is no Playwright,
  Cypress, or Selenium layer, and no plan to add one at this scale. The
  PWAs and SPAs are exercised by hand against the live deployment. The
  end-to-end signal we rely on is the Docker smoke test plus Amethyst's
  live integration tests (now run from the `amethyst-independent` repo
  against the deployed box).

The guiding rule: test the logic that would silently corrupt data or
quietly open the auth gate; smoke-test the rest.

---

## Per-service coverage matrix

Seven services live under `apps/` (plus Amethyst/tts, whose source and
tests live in the separate `amethyst-independent` repo). Test counts are
individual `test(`/`it(`/`def test_` cases as of this writing.

<!-- markdownlint-disable MD013 -->

| Service | Framework | Test command | Tests | CI | Target |
| --- | --- | --- | --- | --- | --- |
| bookmark-manager (Basalt) | vitest | `npm -w server test` | ~15 | ✅ runs | hold; add export/import coverage |
| admin | node:test (`tsx --test`) | `npm -w server test` | ~20 | ⚠️ step missing | wire test step into `admin.yml` |
| presentation-studio (Citrine) | vitest | `npm run test` | ~7 | ✅ runs | add `presentations.ts` CRUD tests |
| redirector | vitest | `npm -w server test` | ~10 | ✅ runs | add management-CRUD tests |
| timezones | vitest | `npm -w server test` | ~7 | ✅ runs | add PATCH / GET-by-id tests |
| video-downloader | vitest | `npm -w server test` | ~10 | ❌ no workflow | add `video-downloader.yml` |
| tts (Amethyst) | pytest + pytest-asyncio | _(external repo)_ | — | external | tests live + run in `amethyst-independent` |
| landing | static — no tests | n/a | 0 | n/a (static) | none — one HTML file |

<!-- markdownlint-enable MD013 -->

Notes on each row:

- **bookmark-manager (Basalt)** — `crypto.test.ts` covers the AES-256-GCM
  layer (round-trips, IV freshness, tamper detection, legacy-plaintext
  fallthrough, unicode, large strings); `nodes.test.ts` is the node
  `PATCH` double-encryption regression suite. Mocks the outbound
  fetcher. CI runs the suite as a `server tests` step.
- **admin** — pure lib tests under `apps/admin/server`: account
  seeding + per-service grants, the allow/reauth/deny authorization
  flow, SSO mint/verify, API-token mint/verify/revoke
  (`accounts.test.ts`), and backup-code hashing/normalization
  (`codes.test.ts`). The suite passes locally, but **`admin.yml` has no
  `server tests` step** — the workflow only typechecks, builds, and
  Docker-smoke-tests. This is the one wired-but-not-run gap.
- **presentation-studio (Citrine)** — `presentation.test.ts` covers
  document validation (valid docs, duplicate scenes, broken action
  targets, unsafe URL actions) and route auth via SSO cookie. CI runs
  it. The newer CRUD routes in
  `apps/presentation-studio/server/src/routes/presentations.ts` are not
  yet covered.
- **redirector** — `redirects.test.ts` covers slug generation +
  validation, URL normalization, invalid-target rejection
  (`javascript:`, `data:`, oversize), the public `302` redirect + hit
  counter, and management-route auth gating. CI runs it. The
  management CRUD handlers (create/list/delete) are only auth-gated in
  tests, not exercised end-to-end.
- **timezones** — `presets.test.ts` covers the public health endpoint,
  the SSO auth gate, and preset create/list/delete with per-account
  scoping. CI runs it. Preset `PATCH` and GET-by-id paths are untested.
- **video-downloader** — `download.test.ts` covers the HLS downloader
  (variant selection, TS remux, `EXT-X-MAP` init segments, encrypted /
  live-playlist rejection, segment + byte budgets, SSRF private-target
  block) with mocked fetch + ffmpeg, plus route auth. The suite is
  solid, but **there is no `video-downloader.yml` workflow**, so none
  of it runs in CI.
- **tts (Amethyst)** — pytest with `pytest-asyncio`. **The suite is no
  longer in this repo:** Amethyst's source and tests moved to the
  `amethyst-independent` repo (2026-06-29), where its own
  `web-tests.yml` workflow runs them. The former in-repo apps/tts/
  pytest suite and its `tts.yml` CI were removed here when the service
  became a pulled GHCR image. See DECISIONS.md 2026-06-29.
- **landing** — one static `index.html` plus fonts and a canvas
  animation. No build, no tests, nothing to assert.

---

## How to run each suite

**TypeScript services** (bookmark-manager, admin, presentation-studio,
redirector, timezones, video-downloader):

```bash
cd apps/<service>
npm ci
npm -w server test
```

Citrine's CI invokes the root `test` script (which itself delegates to
the server workspace), so either form works for it:

```bash
cd apps/presentation-studio
npm ci
npm run test
```

**Python service** (tts / Amethyst): its source and tests are no longer in
this repo — they live in the `amethyst-independent` repo (`web/`) and run
via that repo's `web-tests.yml`. Run `uv run pytest` from there, not here.
This platform consumes Amethyst only as the prebuilt
`ghcr.io/chocolatebrownie250/amethyst-web` image.

---

## Test conventions

**TypeScript (vitest + Fastify).**

- Vitest runs with the `forks` pool. better-sqlite3 is a native module
  and is happier without worker-thread reuse, so each test file gets a
  fresh process.
- Each suite spins up a throwaway SQLite database in a temp directory
  under the OS tmpdir (`mkdtempSync` in `setup.ts`), pointed at via
  `DATA_DIR`, and tears it down after the run. No shared state, no
  fixtures committed to the repo.
- Route tests build the real Fastify app and drive it with
  `app.inject()` — no listening socket, no HTTP client. Auth is
  exercised by minting an SSO session cookie (or bypassed where the
  handler under test is pre-auth).
- Anything outbound is mocked. The bookmark fetcher and the
  video-downloader's fetch + ffmpeg calls are replaced with `vi.mock` /
  `vi.fn`, so tests never touch the network and the SSRF guard is
  validated against stubs.

**admin (node:test).** Admin is the one TS service on Node's built-in
test runner (`tsx --test`) rather than vitest — its tests are pure lib
tests with no Fastify layer, so the lighter runner is enough. Same
temp-SQLite-under-tmpdir pattern.

**Python (pytest).** Amethyst's pytest suite now lives in the
`amethyst-independent` repo (`web/`), not here. For reference, it uses
`asyncio_mode = "auto"` so `async def test_*` functions need no per-test
decorator; shared setup in its `tests/conftest.py` injects dummy
`GROQ_API_KEY` / `AMETHYST_API_KEY` / `SSO_SESSION_SECRET` env vars at
collection time, per-file fixtures build the `TestClient` and sample
inputs, and live integration tests are `skipif`-gated on a real API key.

---

## CI wiring plan and gaps

CI is per-service: each `apps/<service>/` change triggers its own
workflow under `.github/workflows/`. The intended shape is the same for
every TS service — install, typecheck + build, **run the server
tests**, then build and smoke-test the Docker image. Four services
already follow it (bookmark-manager, presentation-studio, redirector,
timezones). The gaps below are the difference between that intent and
what runs today.

Remediation roadmap (each item is a sibling PR in the current hardening
batch; tracked in the `docs/TECH_DEBT.md` inventory):

1. **Wire the admin test step.** Add a `server tests` step
   (`npm -w server test`) to `admin.yml`. The ~20 lib tests exist and
   pass; they just aren't invoked in CI.
2. **Add `video-downloader.yml`.** The service has a ~10-test vitest
   suite and a Dockerfile but no workflow at all — create one mirroring
   `redirector.yml` (build + test + Docker smoke).
3. **(tts CI moved out of this repo.)** Amethyst's pytest CI lives in
   the `amethyst-independent` repo (`web-tests.yml`) now that its source
   is there; this platform only pulls the prebuilt image, so there is no
   `tts.yml` to add here.
4. **Backfill the untested routes.** Add tests for the Citrine
   `presentations.ts` CRUD, the redirector management CRUD, and the
   timezones preset `PATCH` / GET-by-id paths, so the new route surface
   matches the coverage the older routes already have.

Once those land, every non-static service runs its tests in CI and the
matrix above reads all-green in the CI column.
