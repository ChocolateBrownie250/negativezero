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
- [ ] Rotate the bookmark-manager v1 setup code if it was ever set
      on the live deploy (also in old HANDOVER.md)
- [ ] Revoke any GitHub PATs pasted into earlier sessions
- [ ] On GoDaddy: A record `negativezero.one` → `<VPS_IP>` (already
      pointing, no action unless the VPS is reprovisioned)
- [ ] On GoDaddy: **delete** A records `auth.negativezero.one` and
      `bookmarks.negativezero.one` (both point at the VPS but
      nothing serves them anymore — Logto was removed 2026-05-28,
      `bookmarks.*` was retired in Phase 0)
- [ ] On GitHub: delete `ChocolateBrownie250/negativezero-services`
      repo (archived 2026-05-28, but `gh repo delete` needs the
      `delete_repo` scope: `gh auth refresh -h github.com -s
      delete_repo` then `gh repo delete
      ChocolateBrownie250/negativezero-services --yes`)

## First deploy — DONE 2026-05-22

apex stack (landing + bookmark-manager + admin) deployed via
`platform/deploy.sh`. See `HANDOVER.md` for the full state and ops
procedures.

Remaining one-time browser steps for the operator:

- [ ] Register a passkey at
      `https://negativezero.one/services/bookmark-manager/` using the
      bookmark-manager setup code from `/tmp/deploy*.log` on the VPS
      (or re-derive via the "regenerate everything" procedure in
      HANDOVER.md — only safe if no passkey is registered yet)
- [ ] Register a passkey at `https://negativezero.one/services/admin/`
      using the admin setup code (same source as above)

## TTS absorbed — IN PROGRESS 2026-05-28

Code-side changes are landed in this PR (`claude/add-tts-drop-logto`);
operator has to do the data migration + first deploy.

- [x] Pull `/opt/amethyst/` source into `apps/tts/` (backend, pwa,
      tests, shortcuts, pyproject, uv.lock, README, SECURITY_AUDIT)
- [x] Adapt `apps/tts/Dockerfile`: PORT env, UID 999, /data ownership
- [x] Wire into `platform/docker-compose.yml` (new `tts:` service block)
- [x] Wire into `platform/nginx/negativezero.one.conf` (new
      `/services/tts/` location; old `/vtt-transcriber/` → 301
      redirect)
- [x] Wire into `platform/.env.template` (`GROQ_API_KEY`,
      `TTS_API_KEY`, `TTS_HOST_PORT`)
- [x] Wire into `platform/deploy.sh` (generate `TTS_API_KEY`, chown
      `platform/data/tts/`, defer container start if `GROQ_API_KEY`
      is empty)
- [x] Drop Logto + Neon refs from compose/env/deploy/nginx/docs
- [ ] **Operator: copy GROQ_API_KEY and AMETHYST_API_KEY (renamed to
      TTS_API_KEY) values from old `/opt/amethyst/.env` into
      `/srv/negativezero/platform/.env`** — preserve the same keys so
      existing iPhone Shortcut keeps working without re-pairing
- [ ] **Operator: rsync data**
      ```bash
      ssh root@45.76.88.245
      mkdir -p /srv/negativezero/platform/data/tts
      rsync -av /opt/amethyst/data/ /srv/negativezero/platform/data/tts/
      chown -R 999:999 /srv/negativezero/platform/data/tts
      ```
- [ ] **Operator: deploy**
      ```bash
      # from the local repo on this branch
      rsync -av --exclude='.git/' --exclude='node_modules/' \
            --exclude='dist/' --exclude='platform/.env' \
            --exclude='platform/data/' --delete-after \
            ./ root@45.76.88.245:/srv/negativezero/
      ssh root@45.76.88.245 'cd /srv/negativezero && bash platform/deploy.sh'
      ```
- [ ] **Operator: verify**
      - [ ] `https://negativezero.one/services/tts/` reaches the PWA
      - [ ] `https://negativezero.one/services/tts/api/v1/health` returns OK
      - [ ] `https://negativezero.one/vtt-transcriber/` 301s to
            `/services/tts/`
      - [ ] iPhone Shortcut still successfully transcribes a clip
            (uses the new redirect transparently)
- [ ] **Operator: tear down old standalone amethyst**
      ```bash
      ssh root@45.76.88.245
      cd /opt/amethyst
      docker compose down -v
      docker network rm amethyst_default
      rm -rf /opt/amethyst
      ```

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

- [~] Nightly snapshot of `platform/data/` to S3 (or rsync to a
      second host) — `platform/backup.sh` written. Operator wires up
      `/etc/negativezero-backup.env` with `BACKUP_S3_URI` or
      `BACKUP_RSYNC_DEST` and adds a cron entry (see
      `docs/RUNBOOK.md`).
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

- [ ] **Still wants a browser smoke test** (couldn't run headless
      here): Tailwind 4 preflight cosmetic defaults (e.g. button
      cursor) and the vite-8 admin dev server. Verify the two SPAs
      render correctly before relying on the deploy.

---

## Done

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
