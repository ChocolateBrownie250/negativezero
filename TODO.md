# TODO

Active checklist for the negativezero platform. Granular,
session-actionable. For the strategic / phased view see
[`docs/PLAN.md`](docs/PLAN.md).

**Maintenance rule:** when you start a task, change `[ ]` → `[~]`.
When you finish, change to `[x]` and move it to the **Done** section
at the bottom. Don't leave stale `[~]` markers across sessions — if
you put work down mid-task, write one line under the marker
explaining where you stopped.

---

## Operator (human) — one-time setup

These can't be automated from inside an agent session; the human
operator has to do them in a browser / VPS console.

- [ ] Rotate the VPS root password (the old one was committed
      plaintext to `url-vault/HANDOVER.md` before this merge)
- [x] ~~Rotate the bookmark-manager v1 setup code~~ — superseded
      2026-06-15: all setup codes regenerated in the full passkey reset
- [ ] Revoke any GitHub PATs pasted into earlier sessions
- [x] **2026-06-15** GoDaddy DNS verified (via Chrome): apex `A @ →
      45.76.88.245` correct; the stale `auth.` and `bookmarks.` records
      no longer exist (already removed) — nothing to delete. Live records:
      `A @`, `NS`×2, `CNAME tg → vercel`, `CNAME www → negativezero.one`,
      `_domainconnect`, `SOA`, `TXT _dmarc`. (Note: `tg.` → Vercel is the
      tg-downloader; left untouched.)
- [ ] On GitHub: delete `ChocolateBrownie250/negativezero-services`
      repo (archived 2026-05-28, but `gh repo delete` needs the
      `delete_repo` scope: `gh auth refresh -h github.com -s
      delete_repo` then `gh repo delete
      ChocolateBrownie250/negativezero-services --yes`)
- [ ] **Rotate the temporary Groq key (2026-06-18).** The `GROQ_API_KEY`
      now in `platform/.env` is a throwaway test key (pasted into a session to
      verify the 502 fix). Replace it with a fresh key from
      https://console.groq.com/keys, then `docker compose -f
      platform/docker-compose.yml up -d --force-recreate tts`. The deploy-time
      Groq check now confirms validity.
- [ ] **Rotate the tts Bearer key (`TTS_API_KEY` / `AMETHYST_API_KEY`).** It was
      committed as a hard-coded fallback in `apps/tts/tests/test_integration.py`
      (removed 2026-06-18) so it is exposed in **git history** — treat as leaked.
      Regenerate (admin → API tokens, or HANDOVER "Rotate the tts API key"),
      update `platform/.env`, recreate tts, and update the iPhone Shortcut header.

## First deploy — DONE 2026-05-22

apex stack (landing + bookmark-manager + admin) deployed via
`platform/deploy.sh`. See `HANDOVER.md` for the full state and ops
procedures.

Remaining one-time browser steps for the operator:

- [ ] **Register ONE passkey on admin (SSO covers the rest).** Since
      2026-06-15 the platform has single-sign-on: register a passkey at
      `https://negativezero.one/services/admin/` using the admin setup
      code from `/root/nz-setup-codes.txt` (`ssh wellfit cat …`), **save
      the backup code it shows**, and you're then signed in to
      bookmark-manager, video-downloader and tts automatically (the
      apex `nz_session` cookie). The bookmark/video-downloader setup
      codes are now only needed if you want a per-service fallback
      passkey. tts browser PWA uses the SSO session; the iPhone Shortcut
      still uses the `AMETHYST_API_KEY`.

## Admin edits tts prompts (Phase 3 — agent-friendly chunks)

Sequence in order. Each is roughly one session of focused work.

- [ ] Decide where prompts live: a small HTTP API on tts (admin calls
      it), or a shared SQLite that both services bind-mount. Trade-off
      writeup in PLAN.md Phase 3.
- [ ] On the chosen path: expose a get-prompts + set-prompts endpoint
      from tts, gated by a separate `TTS_ADMIN_TOKEN` (don't reuse
      `TTS_API_KEY` — those have different threat surfaces).
- [ ] Add a "TTS prompts" page to `apps/admin/client/`: list current
      prompts, edit + save, show diff against defaults.
- [ ] Seed values: ship the current hard-coded prompts from
      `apps/tts/backend/app/groq_client.py` (and similar) as initial
      values when admin first writes the store.
- [ ] Audit-log every prompt change in admin (who, when, before/after).
- [ ] Smoke test: change a prompt from admin, transcribe a clip, verify
      the new prompt was used.

## Polish (Phase 4)

- [x] **2026-06-15** Nightly encrypted backup is live: `backup.sh` (now
      includes tts data) runs via `/usr/local/bin/negativezero-backup.sh`
      from cron (04:17 UTC) → gpg AES-256 → **local baseline**
      `/srv/backups/negativezero/`, 14-day retention; round-trip decrypt
      verified. Replaced the dead `/opt/amethyst` backup cron. Passphrase
      in `/etc/negativezero-backup.env` (chmod 600).
- [ ] **Operator: off-host backup destination** — local baseline does NOT
      survive disk/VPS loss. Set `BACKUP_S3_URI=s3://bucket/path/` (+ awscli
      creds) or a remote `BACKUP_RSYNC_DEST=user@host:/path/` in
      `/etc/negativezero-backup.env`, and **save `BACKUP_PASSPHRASE` from
      that file into your password manager** (required to decrypt).
- [x] Operator runbook: `docs/RUNBOOK.md`
- [ ] Rename bookmark-manager internal name to "Bismuth" (folder,
      package, container, README, UI title). URL stays
      `/services/bookmark-manager/` for client-side compatibility.
- [ ] Empty-state UX for first-time bookmark users.

## Open dependabot PRs — major bumps — DONE (superseded)

All nine major bumps (#32–#40) were applied directly and verified on
the `claude/bookmarks-manager-status-93fgU` branch rather than merging
each dependabot PR individually. Once that branch lands, the nine
dependabot PRs are redundant and should be closed.

What shipped, both apps brought to parity:

- **server (bookmark-manager + admin):** fastify 4→5 with its
  fastify-5 plugin majors (@fastify/secure-session 7→8,
  @fastify/rate-limit 9→10, @fastify/static 7→9), better-sqlite3
  11→12, uuid 10→14 (bookmark-manager), @simplewebauthn/server 11→13
  (admin), dotenv 16→17 (admin). The v13 type-only imports were
  repointed from the removed `@simplewebauthn/types` to
  `@simplewebauthn/server`.
- **client (bookmark-manager + admin):** @simplewebauthn/browser
  11→13, lucide-react 0→1, tailwindcss 3→4 (via the official codemod:
  `@import "tailwindcss"`, `@tailwindcss/postcss`, border-color compat
  shim, utility renames). admin also took vite 5→8 +
  @vitejs/plugin-react 4→6.

Verified in-sandbox: both apps build clean (tsc + vite), the
bookmark-manager server tests pass 15/15, and runtime smoke tests
confirm secure-session cookies, rate-limit headers, WebAuthn options,
and SPA static serving all work under fastify 5.

- [x] **2026-06-23 browser/deploy follow-up completed:** admin now builds on
      the patched Vite 7 line with a clean audit; Citrine production mobile PWA
      smoke passed with manifest/apple metadata, scoped service worker, no
      horizontal overflow, no console errors, and no failed network responses.

---

## Done

- [x] **2026-06-23** Citrine presentation builder service added to
      Negative Zero as `apps/presentation-studio/` and mounted at
      `https://negativezero.one/services/citrine/`. It is an installable PWA
      with scoped service worker, offline-safe app shell cache, iPhone/iPad
      touch layouts, freeform canvas Pan/Move modes, preview swipe navigation,
      authenticated Claude Design source import, JSON validation, admin SSO
      authorization via the `citrine` service grant, compose/deploy/nginx
      wiring, GitHub `main` sync, CI coverage, and production smoke verification.
- [x] **2026-06-18** Mobile UI polish — **Batch 1** (commits `db69761`, `57d714c`,
      `78f518e`; deployed + verified live). Fixed *why fresh UI wasn't reaching the
      device* and the clear quick wins:
      - **Caching:** bookmark-manager serves `index.html` + manifest with `no-cache`
        (via an `onSend` hook — `@fastify/static`'s `maxAge` had overridden
        `setHeaders`; verified on the wire), so deploys are instant; hashed assets
        still cached. Fixed the stale PWA manifest paths (`/bookmarks-pro/` →
        `/services/bookmark-manager/`). tts service-worker cache `v9 → v10`.
      - **tts:** removed the recording **waves** animation; **blue floating
        background** so the iOS status-bar / home-indicator safe areas no longer
        show flat **black bars** (html/body gradient + `theme-color #0d1a44` +
        manifest); **calmer/slower aurora** (was a cheap "blinking" opacity pulse).
      - **admin:** SSO return-bounce uses `location.replace` (not `assign`) so
        **Back** doesn't land on the login and re-bounce / drop out.
      - **Finding:** the giant red **"Back button pressed"** text is **NOT** in our
        code (grepped the whole repo) — it's injected on the device (browser
        extension / iOS automation / debug tool), not a negativezero bug.
      - **Deferred → Batch 2** (tracked): bookmark dropdown-menu positioning;
        admin grey→blue theme; tts themed (glass) dropdown replacing native
        `<select>`; tts simple/advanced cleaning toggle; bookmark iOS layout polish.
- [x] **2026-06-18** UI: theme-matched the bookmark-manager **selection toolbar**
      (`client/src/components/SelectionToolbar.tsx`, commit `72b367f`, deployed).
      It still used the pre-blue-theme palette — a flat grey `rgba(20,20,24)` bar
      and a loud solid-coral delete button. Re-pointed the bar to the app's
      deep-blue glass recipe and switched delete to the destructive idiom used
      everywhere else (red glyph on a translucent red tint). Client build clean;
      bookmark-manager rebuilt + healthy.
- [x] **2026-06-18** Fixed the Amethyst tts **"502 when a recording finishes"**
      + a repo-wide hardening pass (main `1596667`→`af685bf`, deployed to the box
      via targeted `docker compose build && up -d`). Root cause was a
      *present-but-rejected* `GROQ_API_KEY` (Groq 401) that the code mapped to a
      misleading 502. Changes (4 commits):
      - **A (tts):** rejected key now → honest **503** (not 502), surfaced in the
        PWA; new `GET /api/v1/ready` probe + a loud startup credential log;
        removed a committed Bearer key from `tests/test_integration.py`.
      - **B (security):** `verifySsoSession`/`mintSsoSession` now **fail closed on
        an empty SSO secret** across admin/bookmark-manager/redirector/
        video-downloader (was fail-open); admin `/api/internal/authz` wrapped in
        try/catch → 503 instead of crashing the gate.
      - **C (resilience):** **healthchecks on all 7 compose services**;
        `deploy.sh` pings Groq at deploy time and warns loudly if the key is
        rejected.
      - **D (docs):** new root `README.md` + `apps/landing/README.md`; de-staled
        the tts (Caddy→monorepo) + bookmark-manager (dropped dead "Logto phase 2")
        READMEs; HANDOVER records the 502 gotcha.
      Verified live: 7/7 containers healthy, real transcription → 200, `/ready`
      ok, HTTPS cert `CN=negativezero.one`, internal authz 404, legacy 308; tts 49
      + admin 20 tests green; authz e2e 4/4; all 5 images rebuilt clean. Two
      operator follow-ups added above (rotate the temp Groq key + the leaked tts
      Bearer key).
- [x] **2026-06-15** Cross-service SSO (PR #69 + tts Dockerfile fix):
      lightweight single-sign-on — admin mints an apex-wide `nz_session`
      HS256-JWT cookie on passkey login; bookmark-manager,
      video-downloader and tts all accept it (additive — each service's
      own login stays as a fallback). Shared `SSO_SESSION_SECRET` (seeded
      by deploy.sh), `jose` (Node) / `PyJWT` (tts), secret used verbatim
      so both languages agree. tts keeps Bearer-key auth for the iPhone
      Shortcut. Verified live: one minted cookie → `authenticated:true` on
      all 4 services, bad tokens → 401, Bearer key → 200. (One snag fixed:
      the tts Dockerfile pins an explicit pip list, so PyJWT had to be
      added there, not just pyproject.)
- [x] **2026-06-15** Ops maintenance: nightly encrypted backups wired
      (see Polish section), tts data included in snapshots, dead amethyst
      backup cron removed. Confirmed the "TTS absorbed" migration fully
      done (old `/opt/amethyst` gone, data migrated, all endpoints live)
      and dropped its stale checklist.
- [x] **2026-06-15** Security hardening (PR #64 + cap follow-ups): fixed all
      24 findings from the 2026-06-14 audit across admin / bookmark-manager /
      video-downloader / tts / platform. admin: backup-code lockout +
      setup-code global cap + append-only audit_log + required UV; bookmark &
      vd: SSRF DNS-rebinding IP-pinning; bookmark: import scheme guard (XSS) +
      recursion caps + rate limits; vd: hard byte budget (+2 regression tests
      after the adversarial verifier caught a concurrency regression) + IPv6
      gaps; tts: FTS5 sanitize (fixes 500s) + CORS lock + XSS textContent +
      model allowlist; platform: container hardening (no-new-privileges,
      cap_drop:[ALL] + minimal nginx caps, pids/mem limits) + nginx security
      headers + XFF reset + encrypted backups. Every service adversarially
      verified; all suites green; deployed + smoke-tested live (6/6 endpoints
      200, security headers present, all containers stable).
- [x] **2026-06-14** Shipped tts PWA redesign (#62), video-downloader
      service (#63), and tracked riga-real-estate in git (#61);
      deployed all 6 services on 45.76.88.245. Ran a full 5-service
      code audit (results feeding the Security hardening section above).
- [x] **2026-06-13** timezones planner live at `/services/timezones/`
      (#59/#60); VPS fast-forwarded to main + redeployed. Repo + VPS
      cleanup: deleted 8 stale branches, freed ~20 GB Docker build
      cache / unused images, removed 19 nginx `.bak` + stale `.env.bak`.
- [x] **2026-05-28** Logto + Neon removed from the platform. Logto
      deployment torn down on VPS (containers, /srv/negativezero-services/,
      nginx sites, TLS certs); cosmetic `bookmarks.negativezero.one`
      cert deleted. Phase 2 (Logto integration) removed from PLAN.md.
      See DECISIONS.md 2026-05-28.
- [x] **2026-05-28** Amethyst absorbed into apps/tts/. Code, compose,
      nginx, env, deploy wired. Python+FastAPI exception to the
      TS+Fastify convention recorded in DECISIONS.md.
- [x] **2026-05-27** Cleared the dependabot major-bump backlog (#32–#40)
      directly on `claude/bookmarks-manager-status-93fgU`: fastify 5 +
      plugin majors, better-sqlite3 12, uuid 14, dotenv 17,
      @simplewebauthn 13, lucide 1, vite 8 (admin), tailwindcss 4 (both
      clients). Builds + server tests green; runtime smoke-tested.
      Browser visual smoke test still pending. The nine dependabot PRs
      are now superseded.
- [x] **2026-05-22** First deploy of merged stack on `45.76.88.245` —
      landing + bookmark-manager + admin reachable via
      `https://negativezero.one/{,services/bookmark-manager/,services/admin/}`.
      Amethyst `/vtt-transcriber/` preserved (until absorbed 2026-05-28).
- [x] **2026-05-22** New `apps/admin/` service: passkey-protected
      registration-code generator. Same auth flow + Apple HIG
      look-and-feel as bookmark-manager. (PR #17)
- [x] **2026-05-22** Four `platform/` bugs found during first real
      deploy and fixed: bcrypt-via-docker → bcryptjs; chown bind-mount
      data dirs to UID 999; `$` → `$$` escape in bcrypt hashes;
      nginx `proxy_pass` trailing slash on `/services/*`. (PR #18)
- [x] **2026-05-22** `HANDOVER.md` written at repo root — captures
      deployed state, ops procedures, known issues, future work
      pointers; zero secrets by design.
- [x] **2026-05-21** Repos merged: `negativezero` + `url-vault` +
      `negativezero-services` → this monorepo (`apps/` + `platform/` +
      `docs/`)
- [x] **2026-05-21** Landing design 03 (spirograph) selected; other
      five sketches deleted
- [x] **2026-05-21** Bookmark-manager base path rewired from
      `/bookmarks-pro/` to `/services/bookmark-manager/`
- [x] **2026-05-21** `platform/deploy.sh` rewritten for multi-domain
      + per-service secret generation
- [x] **2026-05-21** Docs updated to reflect merged platform shape
      (CLAUDE / ARCHITECTURE / PLAN / DECISIONS / AGENTS / TODO)
