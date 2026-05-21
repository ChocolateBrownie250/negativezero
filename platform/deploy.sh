#!/usr/bin/env bash
# Idempotent deployer for the negativezero platform.
# Run as root on the Vultr VPS.
#
# Usage:
#   bash platform/deploy.sh                        # deploys everything
#   bash platform/deploy.sh skip-auth              # skip Logto bring-up (apex only)
#
# What it does:
#   1.  Verifies prereqs (docker, compose, nginx, certbot)
#   2.  Generates .env on first run with random per-service secrets
#       (BOOKMARK_*); prompts for DATABASE_URL (Neon) if missing
#   3.  Picks free loopback ports for landing/bookmark/logto containers
#   4.  Builds + starts all containers via docker compose
#   5.  Installs nginx site files for negativezero.one + auth.negativezero.one
#   6.  certbot --nginx for TLS on both domains (skipped if DNS not yet live)
#   7.  Final smoke test
#
# Designed to coexist with other tenants (wellfit, isg, amethyst) on
# this shared VPS — only writes its own nginx files + own conf.d entry,
# never touches existing tenant configs.
#
# Re-runnable safely. Preserves .env secrets across re-runs; only ports
# and ENDPOINT lines get re-derived.

set -euo pipefail

MODE="${1:-full}"  # "full" or "skip-auth"

PLATFORM_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$PLATFORM_DIR/.env"
ENV_TEMPLATE="$PLATFORM_DIR/.env.template"
COMPOSE_FILE="$PLATFORM_DIR/docker-compose.yml"
NGINX_DIR="$PLATFORM_DIR/nginx"

APEX_DOMAIN="negativezero.one"
AUTH_DOMAIN="auth.negativezero.one"

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31mxx  %s\033[0m\n' "$*"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run as root (sudo bash platform/deploy.sh ...)"

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
CORE_PORT=$(next_free 3010)
ADMIN_PORT=$(next_free $((CORE_PORT+1)))
log "Loopback ports: landing=$LANDING_PORT, bookmark=$BOOKMARK_PORT, logto-core=$CORE_PORT, logto-admin=$ADMIN_PORT"

# ────────────────────────────────────────────────────────────────────────
# 3. .env (first run generates secrets; re-runs preserve them)
# ────────────────────────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
    log "First-run .env: generating secrets"
    [ -f "$ENV_TEMPLATE" ] || die "Missing $ENV_TEMPLATE"
    cp "$ENV_TEMPLATE" "$ENV_FILE"

    SESSION_SECRET=$(openssl rand -hex 32)
    ENCRYPTION_KEY=$(openssl rand -hex 32)
    SETUP_CODE=$(openssl rand -hex 12 | sed -e 's/.\{4\}/&-/g' -e 's/-$//')
    SETUP_CODE_HASH=$(docker run --rm node:20-alpine sh -c \
        "npm i bcrypt --silent >/dev/null 2>&1 && node -e 'require(\"bcrypt\").hash(process.argv[1],12).then(h=>console.log(h))' '$SETUP_CODE'")

    sed -i "s|^BOOKMARK_SESSION_SECRET=.*|BOOKMARK_SESSION_SECRET=$SESSION_SECRET|" "$ENV_FILE"
    sed -i "s|^BOOKMARK_ENCRYPTION_KEY=.*|BOOKMARK_ENCRYPTION_KEY=$ENCRYPTION_KEY|" "$ENV_FILE"
    sed -i "s|^BOOKMARK_SETUP_CODE_HASH=.*|BOOKMARK_SETUP_CODE_HASH=$SETUP_CODE_HASH|" "$ENV_FILE"
    chmod 600 "$ENV_FILE"

    echo
    warn "Bookmark-manager setup code (save this — it won't be shown again):"
    echo "  $SETUP_CODE"
    echo
fi

# Validate DATABASE_URL is set (we cannot generate Neon credentials)
if ! grep -Eq '^DATABASE_URL=postgres' "$ENV_FILE"; then
    if [ "$MODE" != "skip-auth" ]; then
        warn "DATABASE_URL is not set in $ENV_FILE."
        warn "Logto needs a Neon Postgres connection string. Get one from the Neon console"
        warn "(create a project + database, then copy the connection string with sslmode=require)."
        warn "Paste it into $ENV_FILE and re-run, or pass MODE=skip-auth to deploy the apex only."
        die "DATABASE_URL required"
    else
        log "MODE=skip-auth — proceeding without Logto"
    fi
fi

# Update derived values on every run (ports + endpoints).
sed -i "s|^LANDING_HOST_PORT=.*|LANDING_HOST_PORT=$LANDING_PORT|"           "$ENV_FILE"
sed -i "s|^BOOKMARK_HOST_PORT=.*|BOOKMARK_HOST_PORT=$BOOKMARK_PORT|"        "$ENV_FILE"
sed -i "s|^LOGTO_CORE_HOST_PORT=.*|LOGTO_CORE_HOST_PORT=$CORE_PORT|"        "$ENV_FILE"
sed -i "s|^LOGTO_ADMIN_HOST_PORT=.*|LOGTO_ADMIN_HOST_PORT=$ADMIN_PORT|"     "$ENV_FILE"
sed -i "s|^ENDPOINT=.*|ENDPOINT=https://$AUTH_DOMAIN|"                      "$ENV_FILE"
sed -i "s|^ADMIN_ENDPOINT=.*|ADMIN_ENDPOINT=https://$AUTH_DOMAIN/admin|"    "$ENV_FILE"

# ────────────────────────────────────────────────────────────────────────
# 4. Docker compose
# ────────────────────────────────────────────────────────────────────────
log "Building + starting containers"
if [ "$MODE" = "skip-auth" ]; then
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build --remove-orphans landing bookmark-manager
else
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull logto >/dev/null 2>&1 || true
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build --remove-orphans
fi

log "Waiting for bookmark-manager on 127.0.0.1:$BOOKMARK_PORT"
for _ in $(seq 1 30); do
    curl -sf "http://127.0.0.1:$BOOKMARK_PORT/api/health" >/dev/null 2>&1 && { log "bookmark-manager up"; break; }
    sleep 2
done

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

    # Substitute placeholders (apex site uses __LANDING_HOST_PORT__ + __BOOKMARK_HOST_PORT__).
    sed -i "s|__LANDING_HOST_PORT__|$LANDING_PORT|g"   "$dst"
    sed -i "s|__BOOKMARK_HOST_PORT__|$BOOKMARK_PORT|g" "$dst"
    # Auth site uses 3010/3011 in source — replace with actual ports.
    sed -i "s|127\.0\.0\.1:3010|127.0.0.1:$CORE_PORT|g"  "$dst"
    sed -i "s|127\.0\.0\.1:3011|127.0.0.1:$ADMIN_PORT|g" "$dst"

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
if [ "$MODE" != "skip-auth" ]; then
    install_site "$AUTH_DOMAIN" "$NGINX_DIR/$AUTH_DOMAIN.conf"
fi

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

    if [ ! -f "/etc/letsencrypt/live/$domain/fullchain.pem" ]; then
        log "Requesting TLS cert for $domain"
        certbot --nginx -d "$domain" --redirect --non-interactive --agree-tos \
            -m "admin@$APEX_DOMAIN" \
            || warn "certbot failed for $domain"
    else
        log "Re-installing existing TLS cert into nginx for $domain"
        certbot install --installer nginx --cert-name "$domain" --redirect --non-interactive \
            || warn "certbot install failed for $domain"
    fi
}

issue_tls "$APEX_DOMAIN"
[ "$MODE" != "skip-auth" ] && issue_tls "$AUTH_DOMAIN"

systemctl reload nginx || true

# ────────────────────────────────────────────────────────────────────────
# 7. Done
# ────────────────────────────────────────────────────────────────────────
echo
log "Deploy complete"
echo "  Landing:          https://$APEX_DOMAIN/"
echo "  Bookmark manager: https://$APEX_DOMAIN/services/bookmark-manager/"
[ "$MODE" != "skip-auth" ] && echo "  Logto (sign-in):  https://$AUTH_DOMAIN/"
[ "$MODE" != "skip-auth" ] && echo "  Logto Admin:      https://$AUTH_DOMAIN/admin/"
echo "  Status:           docker compose -f $COMPOSE_FILE ps"
echo "  Logs:             docker compose -f $COMPOSE_FILE logs -f"
echo "  Env file:         $ENV_FILE  (chmod 600)"
echo "  Re-run:           bash $PLATFORM_DIR/deploy.sh"
