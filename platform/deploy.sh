#!/usr/bin/env bash
# Idempotent deployer for the negativezero platform.
# Run as root on the Vultr VPS.
#
# Usage:
#   bash platform/deploy.sh
#
# What it does:
#   1. Verifies prereqs (docker, compose, nginx, certbot)
#   2. Generates .env on first run with random per-service secrets
#      (BOOKMARK_*, ADMIN_*, TTS_API_KEY); operator pastes GROQ_API_KEY
#   3. Picks free loopback ports for all apex services
#   4. Builds + starts all containers via docker compose. tts (Amethyst) is
#      a prebuilt image pulled from GHCR (source lives in the separate
#      amethyst-independent repo), not built here; it is still skipped until
#      GROQ_API_KEY is present so the apex deploys cleanly before the operator
#      has wired up Groq. A private image needs `docker login ghcr.io` once.
#   4b. Installs a systemd unit (negativezero-compose) so the stack
#      comes back on boot even if it was torn down
#   5. Installs nginx site file for negativezero.one + shared upgrade map
#   6. certbot --nginx for TLS on negativezero.one (skipped if DNS not live)
#   7. Final smoke test
#
# Designed to coexist with other tenants (wellfit, isg) on this shared
# VPS — only writes its own nginx files + own conf.d entry, never
# touches existing tenant configs.
#
# Re-runnable safely. Preserves .env secrets across re-runs; only ports
# get re-derived.

set -euo pipefail

PLATFORM_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$PLATFORM_DIR/.env"
ENV_TEMPLATE="$PLATFORM_DIR/.env.template"
COMPOSE_FILE="$PLATFORM_DIR/docker-compose.yml"
NGINX_DIR="$PLATFORM_DIR/nginx"

APEX_DOMAIN="negativezero.one"

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31mxx  %s\033[0m\n' "$*"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run as root (sudo bash platform/deploy.sh)"

# ────────────────────────────────────────────────────────────────────────
# 1. Prerequisites
# ────────────────────────────────────────────────────────────────────────
log "Checking prerequisites"
for cmd in docker openssl curl ss sed getent; do
    command -v "$cmd" >/dev/null || die "Missing required tool: $cmd"
done
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 plugin missing"
command -v nginx >/dev/null || die "nginx not installed"
command -v certbot >/dev/null || { log "Installing certbot"; apt-get install -y certbot python3-certbot-nginx; }

mkdir -p "$PLATFORM_DIR/data/bookmark-manager"
mkdir -p "$PLATFORM_DIR/data/admin"
mkdir -p "$PLATFORM_DIR/data/tts"
mkdir -p "$PLATFORM_DIR/data/video-downloader"
# Container processes run as UID 999 (the `app` user from each Dockerfile).
# Bind-mounts inherit host ownership, so the host dirs must be writable by
# 999, otherwise SQLite fails with SQLITE_CANTOPEN on first start.
mkdir -p "$PLATFORM_DIR/data/redirector"
mkdir -p "$PLATFORM_DIR/data/timezones"
mkdir -p "$PLATFORM_DIR/data/citrine"
chown -R 999:999 \
    "$PLATFORM_DIR/data/bookmark-manager" \
    "$PLATFORM_DIR/data/admin" \
    "$PLATFORM_DIR/data/tts" \
    "$PLATFORM_DIR/data/video-downloader" \
    "$PLATFORM_DIR/data/redirector" \
    "$PLATFORM_DIR/data/timezones" \
    "$PLATFORM_DIR/data/citrine"

# ────────────────────────────────────────────────────────────────────────
# 2. Pick free loopback ports
# ────────────────────────────────────────────────────────────────────────
port_in_use() { ss -ltnp 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]$1$"; }
next_free() {
    local p=$1
    while port_in_use "$p"; do p=$((p+1)); [ "$p" -gt 3099 ] && die "no free port"; done
    echo "$p"
}

LANDING_PORT=$(next_free 3020)
BOOKMARK_PORT=$(next_free $((LANDING_PORT+1)))
ADMIN_APP_PORT=$(next_free $((BOOKMARK_PORT+1)))
TTS_PORT=$(next_free $((ADMIN_APP_PORT+1)))
TIMEZONES_PORT=$(next_free $((TTS_PORT+1)))
VIDEO_DOWNLOADER_PORT=$(next_free $((TIMEZONES_PORT+1)))
REDIRECTOR_PORT=$(next_free $((VIDEO_DOWNLOADER_PORT+1)))
CITRINE_PORT=$(next_free $((REDIRECTOR_PORT+1)))
log "Loopback ports: landing=$LANDING_PORT, bookmark=$BOOKMARK_PORT, admin=$ADMIN_APP_PORT, tts=$TTS_PORT, timezones=$TIMEZONES_PORT, video-downloader=$VIDEO_DOWNLOADER_PORT, redirector=$REDIRECTOR_PORT, citrine=$CITRINE_PORT"

# ────────────────────────────────────────────────────────────────────────
# 3. .env (first run generates secrets; re-runs preserve them)
# ────────────────────────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
    log "First-run .env: generating secrets"
    [ -f "$ENV_TEMPLATE" ] || die "Missing $ENV_TEMPLATE"
    cp "$ENV_TEMPLATE" "$ENV_FILE"

    # bookmark-manager secrets
    BOOKMARK_SESSION_SECRET=$(openssl rand -hex 32)
    BOOKMARK_ENCRYPTION_KEY=$(openssl rand -hex 32)
    BOOKMARK_SETUP_CODE=$(openssl rand -hex 12 | sed -e 's/.\{4\}/&-/g' -e 's/-$//')
    # bcryptjs (pure JS) instead of bcrypt: avoids native compilation in
    # node:20-alpine, and installing into /tmp/ sidesteps the idealTree npm
    # bug that fires when running `npm i` in /. Hashes are bit-for-bit
    # compatible with native bcrypt — both implement the same algorithm.
    BOOKMARK_SETUP_CODE_HASH=$(docker run --rm node:20-alpine sh -c \
        "cd /tmp && npm i bcryptjs --silent >/dev/null 2>&1 && node -e 'require(\"bcryptjs\").hash(process.argv[1],12).then(h=>console.log(h))' '$BOOKMARK_SETUP_CODE'")

    # admin secrets
    ADMIN_SESSION_SECRET=$(openssl rand -hex 32)
    ADMIN_SETUP_CODE=$(openssl rand -hex 12 | sed -e 's/.\{4\}/&-/g' -e 's/-$//')
    ADMIN_SETUP_CODE_HASH=$(docker run --rm node:20-alpine sh -c \
        "cd /tmp && npm i bcryptjs --silent >/dev/null 2>&1 && node -e 'require(\"bcryptjs\").hash(process.argv[1],12).then(h=>console.log(h))' '$ADMIN_SETUP_CODE'")

    # tts API key (GROQ_API_KEY is operator-supplied via the Groq console)
    TTS_API_KEY=$(openssl rand -hex 32)

    # Bcrypt hashes contain `$` separators ($2b$12$...salt...hash). Docker
    # Compose interpolates values from --env-file *again* when resolving
    # ${VAR} in the YAML, which chops anything that looks like a $variable
    # reference. Escape every `$` to `$$` in the bcrypt hashes so compose's
    # second-pass interpolation collapses them back to literal `$`.
    BOOKMARK_SETUP_CODE_HASH_ESCAPED=${BOOKMARK_SETUP_CODE_HASH//\$/\$\$}
    ADMIN_SETUP_CODE_HASH_ESCAPED=${ADMIN_SETUP_CODE_HASH//\$/\$\$}

    sed -i "s|^BOOKMARK_SESSION_SECRET=.*|BOOKMARK_SESSION_SECRET=$BOOKMARK_SESSION_SECRET|" "$ENV_FILE"
    sed -i "s|^BOOKMARK_ENCRYPTION_KEY=.*|BOOKMARK_ENCRYPTION_KEY=$BOOKMARK_ENCRYPTION_KEY|" "$ENV_FILE"
    sed -i "s|^BOOKMARK_SETUP_CODE_HASH=.*|BOOKMARK_SETUP_CODE_HASH=$BOOKMARK_SETUP_CODE_HASH_ESCAPED|" "$ENV_FILE"
    sed -i "s|^ADMIN_SESSION_SECRET=.*|ADMIN_SESSION_SECRET=$ADMIN_SESSION_SECRET|" "$ENV_FILE"
    sed -i "s|^ADMIN_SETUP_CODE_HASH=.*|ADMIN_SETUP_CODE_HASH=$ADMIN_SETUP_CODE_HASH_ESCAPED|" "$ENV_FILE"
    sed -i "s|^TTS_API_KEY=.*|TTS_API_KEY=$TTS_API_KEY|" "$ENV_FILE"
    chmod 600 "$ENV_FILE"

    echo
    warn "Setup codes (save these — they won't be shown again):"
    echo "  basalt:            $BOOKMARK_SETUP_CODE"
    echo "  admin:             $ADMIN_SETUP_CODE"
    echo "  tts API key:       $TTS_API_KEY"
    echo
    warn "GROQ_API_KEY is still empty in $ENV_FILE."
    warn "Get one from https://console.groq.com/keys, paste it in,"
    warn "then re-run this script. tts will not start without it."
    echo
fi

# ── video-downloader secrets (idempotent) ──────────────────────
# This service may have been added after .env was first generated, so seed
# its secrets on any run where they're missing — not only on first-run.
# Same bcryptjs + $$-escape handling as the first-run block above.
if ! grep -Eq '^VIDEO_DOWNLOADER_SESSION_SECRET=[0-9a-fA-F]{64}$' "$ENV_FILE"; then
    VD_SESSION_SECRET=$(openssl rand -hex 32)
    if grep -q '^VIDEO_DOWNLOADER_SESSION_SECRET=' "$ENV_FILE"; then
        sed -i "s|^VIDEO_DOWNLOADER_SESSION_SECRET=.*|VIDEO_DOWNLOADER_SESSION_SECRET=$VD_SESSION_SECRET|" "$ENV_FILE"
    else
        echo "VIDEO_DOWNLOADER_SESSION_SECRET=$VD_SESSION_SECRET" >> "$ENV_FILE"
    fi
fi
if ! grep -Eq '^VIDEO_DOWNLOADER_SETUP_CODE_HASH=.+$' "$ENV_FILE"; then
    VD_SETUP_CODE=$(openssl rand -hex 12 | sed -e 's/.\{4\}/&-/g' -e 's/-$//')
    VD_SETUP_CODE_HASH=$(docker run --rm node:20-alpine sh -c \
        "cd /tmp && npm i bcryptjs --silent >/dev/null 2>&1 && node -e 'require(\"bcryptjs\").hash(process.argv[1],12).then(h=>console.log(h))' '$VD_SETUP_CODE'")
    VD_SETUP_CODE_HASH_ESCAPED=${VD_SETUP_CODE_HASH//\$/\$\$}
    if grep -q '^VIDEO_DOWNLOADER_SETUP_CODE_HASH=' "$ENV_FILE"; then
        sed -i "s|^VIDEO_DOWNLOADER_SETUP_CODE_HASH=.*|VIDEO_DOWNLOADER_SETUP_CODE_HASH=$VD_SETUP_CODE_HASH_ESCAPED|" "$ENV_FILE"
    else
        echo "VIDEO_DOWNLOADER_SETUP_CODE_HASH=$VD_SETUP_CODE_HASH_ESCAPED" >> "$ENV_FILE"
    fi
    echo
    warn "Video downloader setup code (save this — it won't be shown again):"
    echo "  video-downloader:  $VD_SETUP_CODE"
    echo
fi
grep -q '^VIDEO_DOWNLOADER_PUBLIC_URL=' "$ENV_FILE" || \
    echo "VIDEO_DOWNLOADER_PUBLIC_URL=https://$APEX_DOMAIN/services/video-downloader" >> "$ENV_FILE"

# ── redirector secrets (idempotent) ────────────────────────────
# Added after .env was first generated, so seed its secrets on any run where
# they're missing — not only on first-run. Same bcryptjs + $$-escape handling
# as the first-run block above.
if ! grep -Eq '^REDIRECTOR_SESSION_SECRET=[0-9a-fA-F]{64}$' "$ENV_FILE"; then
    RD_SESSION_SECRET=$(openssl rand -hex 32)
    if grep -q '^REDIRECTOR_SESSION_SECRET=' "$ENV_FILE"; then
        sed -i "s|^REDIRECTOR_SESSION_SECRET=.*|REDIRECTOR_SESSION_SECRET=$RD_SESSION_SECRET|" "$ENV_FILE"
    else
        echo "REDIRECTOR_SESSION_SECRET=$RD_SESSION_SECRET" >> "$ENV_FILE"
    fi
fi
if ! grep -Eq '^REDIRECTOR_SETUP_CODE_HASH=.+$' "$ENV_FILE"; then
    RD_SETUP_CODE=$(openssl rand -hex 12 | sed -e 's/.\{4\}/&-/g' -e 's/-$//')
    RD_SETUP_CODE_HASH=$(docker run --rm node:20-alpine sh -c \
        "cd /tmp && npm i bcryptjs --silent >/dev/null 2>&1 && node -e 'require(\"bcryptjs\").hash(process.argv[1],12).then(h=>console.log(h))' '$RD_SETUP_CODE'")
    RD_SETUP_CODE_HASH_ESCAPED=${RD_SETUP_CODE_HASH//\$/\$\$}
    if grep -q '^REDIRECTOR_SETUP_CODE_HASH=' "$ENV_FILE"; then
        sed -i "s|^REDIRECTOR_SETUP_CODE_HASH=.*|REDIRECTOR_SETUP_CODE_HASH=$RD_SETUP_CODE_HASH_ESCAPED|" "$ENV_FILE"
    else
        echo "REDIRECTOR_SETUP_CODE_HASH=$RD_SETUP_CODE_HASH_ESCAPED" >> "$ENV_FILE"
    fi
    echo
    warn "Redirector setup code (save this — it won't be shown again):"
    echo "  redirector:        $RD_SETUP_CODE"
    echo
fi
grep -q '^REDIRECTOR_PUBLIC_URL=' "$ENV_FILE" || \
    echo "REDIRECTOR_PUBLIC_URL=https://$APEX_DOMAIN/services/redirector" >> "$ENV_FILE"

# ── citrine secrets (idempotent) ───────────────────────────────
# Added after .env was first generated, so seed its secrets on any run where
# they're missing — not only on first-run. Same bcryptjs + $$-escape handling
# as the first-run block above.
if ! grep -Eq '^CITRINE_SESSION_SECRET=[0-9a-fA-F]{64}$' "$ENV_FILE"; then
    CITRINE_SESSION_SECRET=$(openssl rand -hex 32)
    if grep -q '^CITRINE_SESSION_SECRET=' "$ENV_FILE"; then
        sed -i "s|^CITRINE_SESSION_SECRET=.*|CITRINE_SESSION_SECRET=$CITRINE_SESSION_SECRET|" "$ENV_FILE"
    else
        echo "CITRINE_SESSION_SECRET=$CITRINE_SESSION_SECRET" >> "$ENV_FILE"
    fi
fi
if ! grep -Eq '^CITRINE_SETUP_CODE_HASH=.+$' "$ENV_FILE"; then
    CITRINE_SETUP_CODE=$(openssl rand -hex 12 | sed -e 's/.\{4\}/&-/g' -e 's/-$//')
    CITRINE_SETUP_CODE_HASH=$(docker run --rm node:20-alpine sh -c \
        "cd /tmp && npm i bcryptjs --silent >/dev/null 2>&1 && node -e 'require(\"bcryptjs\").hash(process.argv[1],12).then(h=>console.log(h))' '$CITRINE_SETUP_CODE'")
    CITRINE_SETUP_CODE_HASH_ESCAPED=${CITRINE_SETUP_CODE_HASH//\$/\$\$}
    if grep -q '^CITRINE_SETUP_CODE_HASH=' "$ENV_FILE"; then
        sed -i "s|^CITRINE_SETUP_CODE_HASH=.*|CITRINE_SETUP_CODE_HASH=$CITRINE_SETUP_CODE_HASH_ESCAPED|" "$ENV_FILE"
    else
        echo "CITRINE_SETUP_CODE_HASH=$CITRINE_SETUP_CODE_HASH_ESCAPED" >> "$ENV_FILE"
    fi
    echo
    warn "Citrine setup code (save this — it won't be shown again):"
    echo "  citrine:           $CITRINE_SETUP_CODE"
    echo
fi
grep -q '^CITRINE_PUBLIC_URL=' "$ENV_FILE" || \
    echo "CITRINE_PUBLIC_URL=https://$APEX_DOMAIN/services/citrine" >> "$ENV_FILE"

# ── timezones (gated Fastify service; SSO-cookie-only) ─────────
# No SESSION_SECRET / SETUP_CODE_HASH — timezones has no local login; it relies
# entirely on the shared SSO cookie + admin authz. Only its public URL is seeded.
grep -q '^TIMEZONES_PUBLIC_URL=' "$ENV_FILE" || \
    echo "TIMEZONES_PUBLIC_URL=https://$APEX_DOMAIN/services/timezones" >> "$ENV_FILE"

# ── Basalt (formerly bookmark-manager): force the public URL ───
# The bookmark service derives its session-cookie path from BOOKMARK_PUBLIC_URL's
# pathname. The public URL was renamed /services/bookmark-manager/ → /services/
# basalt/, so force-update any pre-existing value (a plain seed wouldn't correct
# an old one) to keep the cookie path aligned with where nginx now serves it.
if grep -q '^BOOKMARK_PUBLIC_URL=' "$ENV_FILE"; then
    sed -i "s|^BOOKMARK_PUBLIC_URL=.*|BOOKMARK_PUBLIC_URL=https://$APEX_DOMAIN/services/basalt|" "$ENV_FILE"
else
    echo "BOOKMARK_PUBLIC_URL=https://$APEX_DOMAIN/services/basalt" >> "$ENV_FILE"
fi

# ── shared SSO session secret (idempotent) ─────────────────────
# One HS256 key shared by every service so a single apex `nz_session` cookie
# (minted by admin on passkey login) authenticates the user everywhere. The
# secret STRING is used verbatim as the HMAC key, so Node (jose) and Python
# (PyJWT) agree byte-for-byte. Seed once; never rotate casually (rotating
# invalidates all live sessions).
if ! grep -Eq '^SSO_SESSION_SECRET=[0-9a-fA-F]{64}$' "$ENV_FILE"; then
    SSO_SESSION_SECRET=$(openssl rand -hex 32)
    if grep -q '^SSO_SESSION_SECRET=' "$ENV_FILE"; then
        sed -i "s|^SSO_SESSION_SECRET=.*|SSO_SESSION_SECRET=$SSO_SESSION_SECRET|" "$ENV_FILE"
    else
        echo "SSO_SESSION_SECRET=$SSO_SESSION_SECRET" >> "$ENV_FILE"
    fi
fi

GROQ_PRESENT=0
grep -Eq '^GROQ_API_KEY=gsk_' "$ENV_FILE" && GROQ_PRESENT=1
PRESERVED_TTS_PORT=0
if [ "$GROQ_PRESENT" != "1" ]; then
    existing_tts_port="$(docker port negativezero-tts 3000/tcp 2>/dev/null \
        | sed -n 's|^127\.0\.0\.1:||p' | head -1 || true)"
    if [ -n "$existing_tts_port" ] \
        && curl -sf "http://127.0.0.1:$existing_tts_port/api/v1/health" >/dev/null 2>&1; then
        warn "GROQ_API_KEY missing, but an existing healthy tts container is serving on 127.0.0.1:$existing_tts_port."
        warn "Preserving that tts port so nginx does not route Amethyst to an empty upstream."
        TTS_PORT="$existing_tts_port"
        PRESERVED_TTS_PORT=1
    else
        previous_tts_port="$(grep -E '^TTS_HOST_PORT=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
        if [ -n "$previous_tts_port" ]; then
            warn "GROQ_API_KEY missing and no healthy existing tts container was found."
            warn "Preserving configured TTS_HOST_PORT=$previous_tts_port instead of assigning a new dead upstream."
            TTS_PORT="$previous_tts_port"
        fi
    fi
fi

# Update derived values on every run (ports). New port vars added after a
# service's first deploy won't exist in an older .env, so seed any missing
# line before the sed replace runs.
grep -q '^TIMEZONES_HOST_PORT=' "$ENV_FILE" || echo "TIMEZONES_HOST_PORT=$TIMEZONES_PORT" >> "$ENV_FILE"
grep -q '^VIDEO_DOWNLOADER_HOST_PORT=' "$ENV_FILE" || echo "VIDEO_DOWNLOADER_HOST_PORT=$VIDEO_DOWNLOADER_PORT" >> "$ENV_FILE"
grep -q '^REDIRECTOR_HOST_PORT=' "$ENV_FILE" || echo "REDIRECTOR_HOST_PORT=$REDIRECTOR_PORT" >> "$ENV_FILE"
grep -q '^CITRINE_HOST_PORT=' "$ENV_FILE" || echo "CITRINE_HOST_PORT=$CITRINE_PORT" >> "$ENV_FILE"
sed -i "s|^LANDING_HOST_PORT=.*|LANDING_HOST_PORT=$LANDING_PORT|"     "$ENV_FILE"
sed -i "s|^BOOKMARK_HOST_PORT=.*|BOOKMARK_HOST_PORT=$BOOKMARK_PORT|"  "$ENV_FILE"
sed -i "s|^ADMIN_HOST_PORT=.*|ADMIN_HOST_PORT=$ADMIN_APP_PORT|"       "$ENV_FILE"
sed -i "s|^TTS_HOST_PORT=.*|TTS_HOST_PORT=$TTS_PORT|"                 "$ENV_FILE"
sed -i "s|^TIMEZONES_HOST_PORT=.*|TIMEZONES_HOST_PORT=$TIMEZONES_PORT|" "$ENV_FILE"
sed -i "s|^VIDEO_DOWNLOADER_HOST_PORT=.*|VIDEO_DOWNLOADER_HOST_PORT=$VIDEO_DOWNLOADER_PORT|" "$ENV_FILE"
sed -i "s|^REDIRECTOR_HOST_PORT=.*|REDIRECTOR_HOST_PORT=$REDIRECTOR_PORT|" "$ENV_FILE"
sed -i "s|^CITRINE_HOST_PORT=.*|CITRINE_HOST_PORT=$CITRINE_PORT|" "$ENV_FILE"

# ────────────────────────────────────────────────────────────────────────
# 4. Docker compose
# ────────────────────────────────────────────────────────────────────────
# Deferred-failure marker. A configured-but-broken tts (dead container or a
# rejected Groq key) must FAIL the deploy so the outage can't ship green — but
# not by aborting mid-script, which would leave the OTHER healthy services
# without their nginx/TLS/systemd refresh. So we record the problem here and
# `die` on it at the very end, after every healthy service is fully wired.
DEPLOY_ERROR=""

log "Building + starting containers"
if [ "$GROQ_PRESENT" = "1" ]; then
    # Amethyst (tts) is a prebuilt image from the amethyst-independent repo
    # (see docker-compose.yml), so pull it explicitly — `up` alone reuses a
    # cached tag and would never pick up a new release. A pull failure is
    # almost always a missing registry login: warn and continue so the rest
    # of the stack still deploys and any image already on the box is reused.
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull tts \
        || warn "Could not pull the Amethyst image. If it is private, run 'docker login ghcr.io' on this box (PAT with read:packages), then re-run. Falling back to the locally cached image if present."
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build --remove-orphans
else
    warn "GROQ_API_KEY missing in .env — bringing up landing/bookmark-manager/admin/timezones/video-downloader/redirector/citrine only."
    [ "$PRESERVED_TTS_PORT" = "1" ] && warn "Leaving the existing tts container in place on 127.0.0.1:$TTS_PORT."
    warn "Paste a Groq key into $ENV_FILE and re-run to start tts."
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build landing bookmark-manager admin timezones video-downloader redirector citrine
fi

log "Waiting for bookmark-manager on 127.0.0.1:$BOOKMARK_PORT"
for _ in $(seq 1 30); do
    curl -sf "http://127.0.0.1:$BOOKMARK_PORT/api/health" >/dev/null 2>&1 && { log "bookmark-manager up"; break; }
    sleep 2
done

log "Waiting for admin on 127.0.0.1:$ADMIN_APP_PORT"
for _ in $(seq 1 30); do
    curl -sf "http://127.0.0.1:$ADMIN_APP_PORT/api/health" >/dev/null 2>&1 && { log "admin up"; break; }
    sleep 2
done

log "Waiting for timezones on 127.0.0.1:$TIMEZONES_PORT"
for _ in $(seq 1 30); do
    curl -sf "http://127.0.0.1:$TIMEZONES_PORT/api/health" >/dev/null 2>&1 && { log "timezones up"; break; }
    sleep 2
done

log "Waiting for video-downloader on 127.0.0.1:$VIDEO_DOWNLOADER_PORT"
for _ in $(seq 1 30); do
    curl -sf "http://127.0.0.1:$VIDEO_DOWNLOADER_PORT/api/health" >/dev/null 2>&1 && { log "video-downloader up"; break; }
    sleep 2
done

log "Waiting for redirector on 127.0.0.1:$REDIRECTOR_PORT"
for _ in $(seq 1 30); do
    curl -sf "http://127.0.0.1:$REDIRECTOR_PORT/api/health" >/dev/null 2>&1 && { log "redirector up"; break; }
    sleep 2
done

log "Waiting for citrine on 127.0.0.1:$CITRINE_PORT"
for _ in $(seq 1 30); do
    curl -sf "http://127.0.0.1:$CITRINE_PORT/api/health" >/dev/null 2>&1 && { log "citrine up"; break; }
    sleep 2
done

if [ "$GROQ_PRESENT" = "1" ]; then
    log "Waiting for tts on 127.0.0.1:$TTS_PORT"
    tts_up=0
    for _ in $(seq 1 30); do
        curl -sf "http://127.0.0.1:$TTS_PORT/api/v1/health" >/dev/null 2>&1 && { tts_up=1; log "tts up"; break; }
        sleep 2
    done
    # A configured-but-unreachable tts means Amethyst is DOWN: nginx returns a
    # 502 HTML page and the iOS Shortcut fails with "couldn't convert Rich Text
    # to Dictionary". The old loop only `break`ed — it never failed — so a tts
    # that crash-looped (or never started) shipped a GREEN deploy and the outage
    # stayed invisible until a user hit it. Record it (logs now, die at the end).
    if [ "$tts_up" != "1" ]; then
        warn "tts did NOT answer /api/v1/health on 127.0.0.1:$TTS_PORT after 60s. Recent container logs:"
        docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" logs --tail=40 tts 2>&1 || true
        DEPLOY_ERROR="Amethyst (tts) failed to start. Common causes: invalid GROQ_API_KEY, port conflict on $TTS_PORT, or /data permissions. See the tts logs above."
    fi
    # Actively verify the Groq key is ACCEPTED, not just present. A present-but-
    # rejected key (expired/revoked) is the classic cause of "502/503 when a
    # recording finishes" — catch it here, at deploy time, instead of leaving a
    # user to discover it on the next recording. Read-only GET; never prints the key.
    GROQ_KEY="$(grep -E '^GROQ_API_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
    groq_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
        -H "Authorization: Bearer $GROQ_KEY" https://api.groq.com/openai/v1/models || echo 000)"
    if [ "$groq_code" = "200" ]; then
        log "Groq API key accepted — transcription ready"
    elif [ "$groq_code" = "401" ] || [ "$groq_code" = "403" ]; then
        # A definitively rejected key (not a transient network blip) means every
        # recording will 503. Record it so the deploy fails at the end rather
        # than shipping a transcription service that 503s on every request.
        DEPLOY_ERROR="GROQ_API_KEY is set but REJECTED by Groq (HTTP $groq_code) — transcription would fail. Get a valid key at https://console.groq.com/keys, set it in $ENV_FILE, and re-run."
    else
        warn "Could not verify GROQ_API_KEY against Groq (HTTP $groq_code) — check connectivity; transcription may be degraded."
    fi
fi

# ────────────────────────────────────────────────────────────────────────
# 4b. Boot-survival systemd unit
# ────────────────────────────────────────────────────────────────────────
# Without this, the stack only returns after a reboot via Docker's
# restart-policy replay — which does nothing if the stack was torn down
# (compose down / prune / interrupted deploy) before the reboot. This unit
# runs `docker compose up -d` on every boot. Scoped to negativezero only;
# idempotent (re-copy + reload + enable are no-ops when already in place).
# enable (not --now): the boot symlink is what matters — the stack is
# already up from section 4, so the unit need not run during the deploy.
BOOT_UNIT_SRC="$PLATFORM_DIR/negativezero-compose.service"
BOOT_UNIT_DST="/etc/systemd/system/negativezero-compose.service"
if [ -f "$BOOT_UNIT_SRC" ] && command -v systemctl >/dev/null 2>&1; then
    # Render WorkingDirectory from the live $PLATFORM_DIR (same __TOKEN__
    # pattern as the nginx site below) so the boot unit can never drift
    # from where the repo is actually checked out.
    rendered="$(mktemp)"
    sed "s|__PLATFORM_DIR__|$PLATFORM_DIR|g" "$BOOT_UNIT_SRC" > "$rendered"
    if ! cmp -s "$rendered" "$BOOT_UNIT_DST" 2>/dev/null; then
        log "Installing boot-survival unit: $BOOT_UNIT_DST"
        cp "$rendered" "$BOOT_UNIT_DST"
        systemctl daemon-reload
    fi
    rm -f "$rendered"
    systemctl enable negativezero-compose.service >/dev/null 2>&1 \
        || warn "could not enable negativezero-compose.service"
else
    warn "boot unit not installed (missing $BOOT_UNIT_SRC or systemctl)"
fi

# ────────────────────────────────────────────────────────────────────────
# 5. nginx sites + connection-upgrade map
# ────────────────────────────────────────────────────────────────────────
SITES_AVAIL=/etc/nginx/sites-available
SITES_ENABLED=/etc/nginx/sites-enabled
[ -d "$SITES_AVAIL" ] || { SITES_AVAIL=/etc/nginx/conf.d; SITES_ENABLED=/etc/nginx/conf.d; }
UPGRADE_DEST="/etc/nginx/conf.d/negativezero-connection-upgrade.conf"

install_site() {
    local domain=$1 src=$2
    local dst="$SITES_AVAIL/$domain"
    local backup=""
    [ -f "$dst" ] && { backup="$dst.bak.$(date +%s)"; cp "$dst" "$backup"; }

    log "Installing nginx site: $dst"
    cp "$src" "$dst"

    sed -i "s|__LANDING_HOST_PORT__|$LANDING_PORT|g"   "$dst"
    sed -i "s|__BOOKMARK_HOST_PORT__|$BOOKMARK_PORT|g" "$dst"
    sed -i "s|__ADMIN_HOST_PORT__|$ADMIN_APP_PORT|g"   "$dst"
    sed -i "s|__TTS_HOST_PORT__|$TTS_PORT|g"           "$dst"
    sed -i "s|__TIMEZONES_HOST_PORT__|$TIMEZONES_PORT|g" "$dst"
    sed -i "s|__VIDEO_DOWNLOADER_HOST_PORT__|$VIDEO_DOWNLOADER_PORT|g" "$dst"
    sed -i "s|__REDIRECTOR_HOST_PORT__|$REDIRECTOR_PORT|g" "$dst"
    sed -i "s|__CITRINE_HOST_PORT__|$CITRINE_PORT|g" "$dst"

    [ "$SITES_AVAIL" != "$SITES_ENABLED" ] && ln -sf "$dst" "$SITES_ENABLED/$domain"

    if ! nginx -t 2>&1; then
        warn "nginx config test failed; rolling back $domain"
        if [ -n "$backup" ]; then mv "$backup" "$dst"; else rm -f "$dst" "$SITES_ENABLED/$domain"; fi
        nginx -t
        die "Aborted. Previous nginx state restored."
    fi
}

log "Installing shared connection_upgrade map"
cp "$NGINX_DIR/negativezero-connection-upgrade.conf" "$UPGRADE_DEST"

install_site "$APEX_DOMAIN" "$NGINX_DIR/$APEX_DOMAIN.conf"

mkdir -p /var/www/html
systemctl reload nginx

# ────────────────────────────────────────────────────────────────────────
# 6. TLS via certbot
# ────────────────────────────────────────────────────────────────────────
issue_tls() {
    local domain=$1
    local resolved server_ip
    resolved=$(getent hosts "$domain" 2>/dev/null | awk '{print $1}' | head -1 || true)
    server_ip=$(curl -sS --max-time 5 https://api.ipify.org || true)

    if [ -z "$resolved" ]; then
        warn "$domain does not resolve. Add DNS A record: $domain -> $server_ip, then re-run."
        return
    fi
    if [ -n "$server_ip" ] && [ "$resolved" != "$server_ip" ]; then
        warn "$domain resolves to $resolved but this server is $server_ip. Fix DNS, then re-run."
        return
    fi

    # certbot's nginx installer can fail transiently right after a reload (it
    # reparses the freshly-written site file). A single silent failure here
    # leaves the site HTTP-only — :443 then falls through to another tenant's
    # server block and serves the WRONG cert (observed 2026-06-18). Retry before
    # giving up, and treat a failed re-install of an EXISTING cert as fatal: it's
    # an active regression (a site that had HTTPS just lost it), not a soft warn.
    local attempt rc=1
    if [ ! -f "/etc/letsencrypt/live/$domain/fullchain.pem" ]; then
        log "Requesting TLS cert for $domain"
        for attempt in 1 2 3; do
            if certbot --nginx -d "$domain" --redirect --non-interactive --agree-tos \
                -m "admin@$APEX_DOMAIN"; then rc=0; break; fi
            warn "certbot --nginx attempt $attempt failed for $domain"
            if [ "$attempt" -lt 3 ]; then sleep 3; fi
        done
        [ "$rc" -eq 0 ] || warn "certbot failed for $domain after 3 attempts — site may be HTTP-only until DNS/TLS is fixed; re-run."
    else
        log "Re-installing existing TLS cert into nginx for $domain"
        for attempt in 1 2 3; do
            if certbot install --installer nginx --cert-name "$domain" --redirect \
                --non-interactive; then rc=0; break; fi
            warn "certbot install attempt $attempt failed for $domain"
            if [ "$attempt" -lt 3 ]; then sleep 3; fi
        done
        [ "$rc" -eq 0 ] || die "certbot install failed for $domain after 3 attempts; an existing cert is present but nginx was left HTTP-only (:443 will serve the wrong vhost). Recover with: certbot install --installer nginx --cert-name $domain --redirect --non-interactive"
    fi
}

issue_tls "$APEX_DOMAIN"

systemctl reload nginx || true

log "Amethyst Shortcut route smoke"
if [ "$GROQ_PRESENT" = "1" ]; then
    shortcut_body="$(mktemp)"
    shortcut_code="$(curl -s -o "$shortcut_body" -w '%{http_code}' \
        -X POST -H 'Content-Type: audio/mp4' \
        --data-binary 'not real audio' \
        "http://127.0.0.1:$TTS_PORT/api/v1/shortcuts/transcribe" || echo 000)"
    if [ "$shortcut_code" != "401" ]; then
        warn "Expected unauthenticated Shortcut route to return 401 JSON, got HTTP $shortcut_code"
        cat "$shortcut_body" 2>/dev/null || true
        [ -z "$DEPLOY_ERROR" ] && DEPLOY_ERROR="Amethyst Shortcut route smoke failed"
    elif ! grep -F '"text"' "$shortcut_body" >/dev/null; then
        warn "Shortcut route returned 401 without a text field"
        cat "$shortcut_body" 2>/dev/null || true
        [ -z "$DEPLOY_ERROR" ] && DEPLOY_ERROR="Amethyst Shortcut JSON contract failed"
    fi
    legacy_body="$(mktemp)"
    legacy_code="$(curl -s -o "$legacy_body" -w '%{http_code}' \
        -X POST \
        "http://127.0.0.1:$TTS_PORT/api/v1/transcribe" || echo 000)"
    if [ "$legacy_code" != "401" ] && [ "$legacy_code" != "422" ]; then
        warn "Expected legacy transcribe route error JSON, got HTTP $legacy_code"
        cat "$legacy_body" 2>/dev/null || true
        [ -z "$DEPLOY_ERROR" ] && DEPLOY_ERROR="Amethyst legacy transcribe smoke failed"
    elif ! grep -F '"text"' "$legacy_body" >/dev/null || ! grep -F '"detail"' "$legacy_body" >/dev/null; then
        warn "Legacy transcribe route error did not include both text and detail"
        cat "$legacy_body" 2>/dev/null || true
        [ -z "$DEPLOY_ERROR" ] && DEPLOY_ERROR="Amethyst legacy transcribe JSON contract failed"
    fi
    file_alias_body="$(mktemp)"
    file_alias_code="$(curl -s -o "$file_alias_body" -w '%{http_code}' \
        -X POST -H 'Content-Type: audio/mp4' \
        --data-binary 'not real audio' \
        "http://127.0.0.1:$TTS_PORT/api/v1/transcribe/file" || echo 000)"
    if [ "$file_alias_code" = "405" ]; then
        warn "Amethyst raw file alias still returns 405"
        cat "$file_alias_body" 2>/dev/null || true
        [ -z "$DEPLOY_ERROR" ] && DEPLOY_ERROR="Amethyst raw file alias is missing"
    elif ! grep -F '"text"' "$file_alias_body" >/dev/null; then
        warn "Amethyst raw file alias did not return Shortcut-readable JSON"
        cat "$file_alias_body" 2>/dev/null || true
        [ -z "$DEPLOY_ERROR" ] && DEPLOY_ERROR="Amethyst raw file alias JSON contract failed"
    fi
    rm -f "$shortcut_body" "$legacy_body" "$file_alias_body"
fi

# ────────────────────────────────────────────────────────────────────────
# 7. Landing route smoke
# ────────────────────────────────────────────────────────────────────────
log "Final landing route smoke"
LANDING_ROOT_HTML="$(mktemp)"
LANDING_RIGA_HTML="$(mktemp)"
trap 'rm -f "$LANDING_ROOT_HTML" "$LANDING_RIGA_HTML"' EXIT

# Smoke the landing CONTAINER directly on its loopback port, not via the apex
# nginx. certbot --redirect makes :80 return a 301 to https, and these curls
# don't follow redirects — so going through nginx greps the "301 Moved" body
# (no riga link) and red-failed deploys whose live site was correct (#158,
# #159). Hitting the container serves the real apps/landing/ files and also
# sidesteps a recreate race (landing isn't health-gated in section 4). Retry
# until the freshly-built content is served; only `die` if it never appears.
landing_root_ok=0
for _ in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:$LANDING_PORT/" >"$LANDING_ROOT_HTML" 2>/dev/null \
        && grep -F 'href="/dashboards/riga-real-estate/"' "$LANDING_ROOT_HTML" >/dev/null; then
        landing_root_ok=1; break
    fi
    sleep 2
done
[ "$landing_root_ok" = "1" ] \
    || die "landing root no longer links riga-estate to /dashboards/riga-real-estate/"

riga_legacy_ok=0
for _ in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:$LANDING_PORT/riga-real-estate/" >"$LANDING_RIGA_HTML" 2>/dev/null \
        && grep -F '<title>Riga real estate observations · negativezero</title>' "$LANDING_RIGA_HTML" >/dev/null \
        && grep -F 'href="./styles.css"' "$LANDING_RIGA_HTML" >/dev/null \
        && grep -F 'src="./app.js"' "$LANDING_RIGA_HTML" >/dev/null \
        && ! grep -F '/dashboards/riga-real-estate/assets/' "$LANDING_RIGA_HTML" >/dev/null; then
        riga_legacy_ok=1; break
    fi
    sleep 2
done
[ "$riga_legacy_ok" = "1" ] \
    || die "legacy /riga-real-estate/ smoke failed (title / ./styles.css / ./app.js / no dashboard assets)"

# ────────────────────────────────────────────────────────────────────────
# 8. Done
# ────────────────────────────────────────────────────────────────────────
echo
log "Deploy complete"
echo "  Landing:          https://$APEX_DOMAIN/"
echo "  Basalt:           https://$APEX_DOMAIN/services/basalt/"
echo "  Admin:            https://$APEX_DOMAIN/services/admin/"
if [ "$GROQ_PRESENT" = "1" ] || [ "$PRESERVED_TTS_PORT" = "1" ]; then
    echo "  Amethyst:         https://$APEX_DOMAIN/services/amethyst/"
else
    # Never let a skipped Amethyst be silent — that is exactly how a missing
    # GROQ_API_KEY went unnoticed while the Shortcut returned 502s.
    warn "Amethyst (tts) NOT deployed — GROQ_API_KEY missing in $ENV_FILE. Set a gsk_… key and re-run to enable transcription."
fi
echo "  Timezones:        https://$APEX_DOMAIN/services/timezones/"
echo "  Video downloader: https://$APEX_DOMAIN/services/video-downloader/"
echo "  Redirector:       https://$APEX_DOMAIN/services/redirector/"
echo "  Citrine:          https://$APEX_DOMAIN/services/citrine/"
echo "  Status:           docker compose -f $COMPOSE_FILE ps"
echo "  Logs:             docker compose -f $COMPOSE_FILE logs -f"
echo "  Env file:         $ENV_FILE  (chmod 600)"
echo "  Re-run:           bash $PLATFORM_DIR/deploy.sh"
echo "  Boot unit:        systemctl status negativezero-compose.service"

# Every healthy service is now fully deployed (containers, nginx, TLS, boot
# unit). If a configured tts/Groq problem was recorded earlier, fail NOW so the
# deploy goes red and the operator can't miss it — without having blocked the
# healthy services above.
if [ -n "$DEPLOY_ERROR" ]; then
    echo
    die "$DEPLOY_ERROR"
fi
