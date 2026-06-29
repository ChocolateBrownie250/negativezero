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

**No active migration focus.** The latest completed platform addition is
Citrine at `/services/citrine/` (2026-06-23); implementation details and
remaining optional work are recorded in
[`docs/CITRINE_IMPLEMENTATION_REPORT.md`](CITRINE_IMPLEMENTATION_REPORT.md).
The next strategic item remains Phase 3 — admin gains a "tts prompts" page for
editing the cleanup and proofread system prompts that the tts service uses.
Needs a small protocol between admin and tts (either a shared SQLite table or a
tiny HTTP API on tts that admin calls).

> **Note (2026-06-29):** Amethyst's app source was extracted out of this repo
> to the separate `amethyst-independent` repo (it now holds both a macOS desktop
> edition and the web/PWA edition under `web/`). This platform no longer builds
> apps/tts/; it consumes the prebuilt GHCR image
> `ghcr.io/chocolatebrownie250/amethyst-web` as the `tts` service. Routing and
> auth at `/services/amethyst/` are unchanged. Phase 3 ("admin edits tts
> prompts") would now talk to that external service over HTTP, not edit in-repo
> source. See DECISIONS.md 2026-06-29.

---

## Plan

Status markers: `[ ]` todo, `[~]` in progress, `[x]` done.

### Citrine — presentation builder service (DONE 2026-06-23)

- [x] Build `apps/presentation-studio/` as a private Fastify + React PWA
      mounted at `/services/citrine/`.
- [x] Import and preserve the downloaded Claude Design `ISG Studio.html`
      source archive under authenticated `server/imports/isg-studio/` routes.
- [x] Implement a web-native presentation model: responsive narrative scenes,
      premade scalable elements, hyperlink-style actions, transitions, preview
      mode, JSON import/export, and validation.
- [x] Implement touch/iPhone/iPad PWA polish: manifest/icons, scoped service
      worker, offline-safe app shell cache, update/offline banners, touch
      sheets/slide-over layouts, freeform canvas Pan/Move modes, zoom/fit, and
      preview swipe navigation.
- [x] Wire platform deployment: admin `citrine` service grant, compose service,
      deploy.sh secrets/ports/smoke wait, env template, nginx route, docs, and
      TODO.
- [x] Deploy to production and verify
      `https://negativezero.one/services/citrine/` plus `/api/health`, PWA
      metadata, service-worker scope/cache safety, unauthenticated 401s, and
      SSO-authorized protected source access.

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
- [x] `platform/deploy.sh` written for the merged stack
- [x] `platform/nginx/negativezero.one.conf` written (landing at /,
      bookmark-manager at /services/bookmark-manager/)
- [x] Docs updated: CLAUDE.md, ARCHITECTURE.md, PLAN.md, DECISIONS.md

### Phase 1 — First deploy of the merged stack (DONE 2026-05-22)

- [x] DNS on GoDaddy: A record for `negativezero.one` was already
      pointing at the VPS from the predecessor deploy
- [x] On the VPS: `/srv/negativezero/` synced to monorepo state
- [x] `platform/.env` regenerated via `deploy.sh`
- [x] **New: `apps/admin/` built and deployed.** Passkey-protected
      registration-code generator at `/services/admin/`. Stack
      mirrors bookmark-manager.
- [x] **Four deploy.sh / nginx bugs fixed during first real run**:
      bcrypt-via-docker idealTree bug (switch to bcryptjs in /tmp);
      bind-mount permission (chown host dirs to UID 999); bcrypt-hash
      values being chopped by compose's second-pass interpolation
      (escape `$` → `$$`); nginx `proxy_pass` missing trailing slash
      on `/services/*`. See PR #18.
- [x] Verify:
      - [x] `https://negativezero.one/` renders the landing
      - [x] `https://negativezero.one/services/bookmark-manager/`
            reaches the bookmark UI
      - [x] `https://negativezero.one/services/admin/` reaches the
            admin UI
      - [x] `https://negativezero.one/vtt-transcriber/` still 200
            (Amethyst standalone tenant preserved at the time —
            superseded by Phase 2)
- [x] Setup codes captured from deploy output
- [ ] First-time bookmark + admin passkey registration via browser
      (operator step — not done in that session)

### Phase 2 — tts absorbed (IN PROGRESS 2026-05-28)

- [x] Pull `/opt/amethyst/` source into apps/tts/ (backend, pwa,
      tests, shortcuts, pyproject.toml, uv.lock, README, SECURITY_AUDIT.md)
      — note: apps/tts/ was later extracted to the `amethyst-independent`
      repo (2026-06-29; see the Current focus note + DECISIONS.md)
- [x] Adapt apps/tts/Dockerfile: PORT env, UID 999, /data ownership
- [x] Wire into `platform/docker-compose.yml`: new `tts:` service block
- [x] Wire into `platform/nginx/negativezero.one.conf`: new
      `/services/amethyst/` location; old `/services/tts/` and
      `/vtt-transcriber/` become 308 redirects
- [x] Wire into `platform/.env.template`: `GROQ_API_KEY`,
      `TTS_API_KEY`, `TTS_HOST_PORT`
- [x] Wire into `platform/deploy.sh`: generate `TTS_API_KEY` on first
      run, chown `platform/data/tts/`, defer container start if
      `GROQ_API_KEY` is missing
- [x] Drop Logto + Neon refs from compose, env, deploy, nginx, docs
- [ ] **Operator: rsync data from /opt/amethyst/data/ to platform/data/tts/**
- [ ] **Operator: paste GROQ_API_KEY into platform/.env**
- [ ] **Operator: run `bash platform/deploy.sh` on VPS**
- [ ] **Operator: verify `/services/amethyst/` works + `/vtt-transcriber/` redirects**
- [ ] **Operator: tear down old standalone amethyst (`docker compose
      down -v` in /opt/amethyst/, rm -rf /opt/amethyst/, `docker
      network rm amethyst_default`)**

### Phase 3 — Admin edits tts prompts

The tts service uses two LLM operations: a "cleanup" pass that fixes
Whisper recognition errors using the glossary, and an optional
"polish" pass that does proofreading-quality rewriting. Both have
system prompts that are interesting to tune. Goal: edit them from
the admin UI without touching the tts source.

- [ ] Decide where prompts live: SQLite row in tts's
      `amethyst.sqlite` (admin reads/writes via small HTTP API on
      tts), or a shared SQLite at `platform/data/shared.sqlite`
      that both services bind-mount. Trade-off: tts API is cleaner
      ownership, shared SQLite is less code.
- [ ] On the chosen path, expose read/write endpoints from tts
      and a "Prompts" page in admin.
- [ ] Defaults: ship the current hard-coded prompts from Amethyst's
      backend/app/groq_client.py (and similar) — now in the
      `amethyst-independent` repo, no longer apps/tts/ here — as the
      seed values when admin first touches the prompt store.
- [ ] Audit-log every prompt change in admin (who, when, before/after).
- [ ] Smoke test: change a prompt from admin, transcribe a clip,
      verify the new prompt was used.

### Phase 4 — Polish

- [~] Backup story: nightly snapshot of `platform/data/` → off-host
      (S3 or rsync). Script written (`platform/backup.sh`); operator
      wires `/etc/negativezero-backup.env` + cron (see RUNBOOK.md).
- [x] Operator runbook (`docs/RUNBOOK.md`): how to invite a user,
      rotate a passkey, recover a stuck deploy. Done 2026-05-26.
- [ ] Bookmark-manager internal naming → Bismuth (rename folders,
      packages, container, README, UI title; URL stays
      `/services/bookmark-manager/` for client-side compatibility).

---

## Blockers

None at the moment.

---

## Notes / open questions

- **tts service exposed by Bearer-only auth.** A single API key
  protects all tts endpoints. Fine while it's just Igor's iPhone +
  PWA + scripts. If a second user is added, either rotate to per-user
  keys in the tts DB (simple) or re-introduce a real identity layer
  (large).

- **GROQ_API_KEY rotation.** Stored in `platform/.env`. Rotation = edit
  the file + `docker compose restart tts`. No tests for the rotation
  path; the path is short enough that a runbook entry isn't earning
  its keep yet.

- **Audio retention.** tts purges audio files older than
  `AUDIO_RETENTION_DAYS` (default 90). Text transcripts are kept
  forever. If audio retention is changed in `.env`, the change takes
  effect on the next purge tick (hourly).

- **Backwards compatibility window.** The `/vtt-transcriber/` 308
  redirect is kept indefinitely for old iPhone Shortcuts. No effort
  spent forcing client updates; redirect is cheap and old clients
  keep working.

- **Per-service WebAuthn vs centralised identity.** Decided 2026-05-28
  in favour of per-service WebAuthn for the current single-user scale.
  If multi-user happens, the right move is to re-introduce an identity
  layer (Logto, Hanko, Kratos, custom) — git history has the prior
  Logto integration work as reference.
