#!/usr/bin/env bash

set -euo pipefail

if [ "${1:-}" != "" ]; then
  ROOT_DIR="$(cd "$1" && pwd)"
else
  ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
fi
LANDING_INDEX="$ROOT_DIR/apps/landing/index.html"
LEGACY_INDEX="$ROOT_DIR/apps/landing/riga-real-estate/index.html"
LEGACY_APP="$ROOT_DIR/apps/landing/riga-real-estate/app.js"
LEGACY_STYLES="$ROOT_DIR/apps/landing/riga-real-estate/styles.css"
NGINX_CONF="$ROOT_DIR/platform/nginx/negativezero.one.conf"

die() {
  printf 'riga route validation failed: %s\n' "$*" >&2
  exit 1
}

[ -f "$LANDING_INDEX" ] || die "missing apps/landing/index.html"
[ -f "$LEGACY_INDEX" ] || die "missing apps/landing/riga-real-estate/index.html"
[ -f "$LEGACY_APP" ] || die "missing apps/landing/riga-real-estate/app.js"
[ -f "$LEGACY_STYLES" ] || die "missing apps/landing/riga-real-estate/styles.css"
[ -f "$NGINX_CONF" ] || die "missing platform/nginx/negativezero.one.conf"

grep -F 'href="/dashboards/riga-real-estate/"' "$LANDING_INDEX" >/dev/null || \
  die "landing index does not point riga-estate at /dashboards/riga-real-estate/"

grep -F 'location = /dashboards/riga-real-estate {' "$NGINX_CONF" >/dev/null || \
  die "nginx config is missing the canonical dashboard redirect location"
grep -F 'location /dashboards/riga-real-estate/ {' "$NGINX_CONF" >/dev/null || \
  die "nginx config is missing the canonical dashboard static location"
grep -F 'try_files $uri $uri/ /dashboards/riga-real-estate/index.html;' "$NGINX_CONF" >/dev/null || \
  die "nginx config is missing the canonical dashboard try_files rule"

grep -F '<title>Riga real estate observations · negativezero</title>' "$LEGACY_INDEX" >/dev/null || \
  die "legacy /riga-real-estate/ title does not match the tracked micro-site"
grep -F 'href="./styles.css"' "$LEGACY_INDEX" >/dev/null || \
  die "legacy /riga-real-estate/ index is not using relative ./styles.css"
grep -F 'src="./app.js"' "$LEGACY_INDEX" >/dev/null || \
  die "legacy /riga-real-estate/ index is not using relative ./app.js"

if grep -F '/dashboards/riga-real-estate/assets/' "$LEGACY_INDEX" >/dev/null; then
  die "legacy /riga-real-estate/ index unexpectedly references dashboard assets"
fi

printf 'riga route validation passed\n'
