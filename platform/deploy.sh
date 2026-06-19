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
#   3. Picks free loopback ports for landing/bookmark/admin/tts
#   4. Builds + starts all containers via docker compose. tts is skipped
#      until GROQ_API_KEY is present so the apex deploys cleanly before
#      the operator has wired up Groq.
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
chown -R 999:999 \
    "$PLATFORM_DIR/data/bookmark-manager" \
    "$PLATFORM_DIR/data/admin" \
    "$PLATFORM_DIR/data/tts" \
    "$PLATFORM_DIR/data/video-downloader" \
    "$PLATFORM_DIR/data/redirector"

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
log "Loopback ports: landing=$LANDING_PORT, bookmark=$BOOKMARK_PORT, admin=$ADMIN_APP_PORT, tts=$TTS_PORT, timezones=$TIMEZONES_PORT, video-downloader=$VIDEO_DOWNLOADER_PORT, redirector=$REDIRECTOR_PORT"

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
    echo "  bookmark-manager:  $BOOKMARK_SETUP_CODE"
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

# Update derived values on every run (ports). New port vars added after a
# service's first deploy won't exist in an older .env, so seed any missing
# line before the sed replace runs.
grep -q '^TIMEZONES_HOST_PORT=' "$ENV_FILE" || echo "TIMEZONES_HOST_PORT=$TIMEZONES_PORT" >> "$ENV_FILE"
grep -q '^VIDEO_DOWNLOADER_HOST_PORT=' "$ENV_FILE" || echo "VIDEO_DOWNLOADER_HOST_PORT=$VIDEO_DOWNLOADER_PORT" >> "$ENV_FILE"
grep -q '^REDIRECTOR_HOST_PORT=' "$ENV_FILE" || echo "REDIRECTOR_HOST_PORT=$REDIRECTOR_PORT" >> "$ENV_FILE"
sed -i "s|^LANDING_HOST_PORT=.*|LANDING_HOST_PORT=$LANDING_PORT|"     "$ENV_FILE"
sed -i "s|^BOOKMARK_HOST_PORT=.*|BOOKMARK_HOST_PORT=$BOOKMARK_PORT|"  "$ENV_FILE"
sed -i "s|^ADMIN_HOST_PORT=.*|ADMIN_HOST_PORT=$ADMIN_APP_PORT|"       "$ENV_FILE"
sed -i "s|^TTS_HOST_PORT=.*|TTS_HOST_PORT=$TTS_PORT|"                 "$ENV_FILE"
sed -i "s|^TIMEZONES_HOST_PORT=.*|TIMEZONES_HOST_PORT=$TIMEZONES_PORT|" "$ENV_FILE"
sed -i "s|^VIDEO_DOWNLOADER_HOST_PORT=.*|VIDEO_DOWNLOADER_HOST_PORT=$VIDEO_DOWNLOADER_PORT|" "$ENV_FILE"
sed -i "s|^REDIRECTOR_HOST_PORT=.*|REDIRECTOR_HOST_PORT=$REDIRECTOR_PORT|" "$ENV_FILE"

# ────────────────────────────────────────────────────────────────────────
# 4. Docker compose
# ────────────────────────────────────────────────────────────────────────
GROQ_PRESENT=0
grep -Eq '^GROQ_API_KEY=gsk_' "$ENV_FILE" && GROQ_PRESENT=1

log "Building + starting containers"
if [ "$GROQ_PRESENT" = "1" ]; then
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build --remove-orphans
else
    warn "GROQ_API_KEY missing in .env — bringing up landing/bookmark-manager/admin/timezones/video-downloader/redirector only."
    warn "Paste a Groq key into $ENV_FILE and re-run to start tts."
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build landing bookmark-manager admin timezones video-downloader redirector
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
    curl -sf "http://127.0.0.1:$TIMEZONES_PORT/" >/dev/null 2>&1 && { log "timezones up"; break; }
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

if [ "$GROQ_PRESENT" = "1" ]; then
    log "Waiting for tts on 127.0.0.1:$TTS_PORT"
    for _ in $(seq 1 30); do
        curl -sf "http://127.0.0.1:$TTS_PORT/api/v1/health" >/dev/null 2>&1 && { log "tts up"; break; }
        sleep 2
    done
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
        warn "GROQ_API_KEY is set but REJECTED by Groq (HTTP $groq_code) — transcription will fail (503)."
        warn "Get a valid key at https://console.groq.com/keys, set it in $ENV_FILE, and re-run."
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

# ────────────────────────────────────────────────────────────────────────
# 7. Done
# ────────────────────────────────────────────────────────────────────────
echo
log "Deploy complete"
echo "  Landing:          https://$APEX_DOMAIN/"
echo "  Bookmark manager: https://$APEX_DOMAIN/services/bookmark-manager/"
echo "  Admin:            https://$APEX_DOMAIN/services/admin/"
[ "$GROQ_PRESENT" = "1" ] && echo "  Amethyst:         https://$APEX_DOMAIN/services/amethyst/"
echo "  Timezones:        https://$APEX_DOMAIN/services/timezones/"
echo "  Video downloader: https://$APEX_DOMAIN/services/video-downloader/"
echo "  Redirector:       https://$APEX_DOMAIN/services/redirector/"
echo "  Status:           docker compose -f $COMPOSE_FILE ps"
echo "  Logs:             docker compose -f $COMPOSE_FILE logs -f"
echo "  Env file:         $ENV_FILE  (chmod 600)"
echo "  Re-run:           bash $PLATFORM_DIR/deploy.sh"
echo "  Boot unit:        systemctl status negativezero-compose.service"
