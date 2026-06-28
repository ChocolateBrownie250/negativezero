#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${1:-https://negativezero.one}"
DASHBOARD_URL="$BASE_URL/dashboards/riga-real-estate/"
DASHBOARD_JSON_URL="$BASE_URL/dashboards/riga-real-estate/data/dashboard.json"
DASHBOARD_GZ_URL="$BASE_URL/dashboards/riga-real-estate/data/dashboard.json.gz"
LEGACY_URL="$BASE_URL/riga-real-estate/"

die() {
  printf 'public riga route verification failed: %s\n' "$*" >&2
  exit 1
}

extract_title() {
  local file="$1"
  perl -0ne 'print "$1\n" if m{<title>([^<]+)</title>}s' "$file"
}

extract_dashboard_asset_hint() {
  local file="$1"
  perl -0ne 'print "$1\n" if m{(/dashboards/riga-real-estate/assets/[^"\047<]+)}s' "$file"
}

require_status() {
  local url="$1"
  local expected="$2"
  local status
  status="$(curl -sS -o /dev/null -w '%{http_code}' "$url")" || die "request failed: $url"
  [ "$status" = "$expected" ] || die "$url returned $status, expected $expected"
}

require_status "$DASHBOARD_URL" 200
require_status "$DASHBOARD_JSON_URL" 200
require_status "$DASHBOARD_GZ_URL" 200

DASHBOARD_HTML="$(mktemp)"
LEGACY_HTML="$(mktemp)"
trap 'rm -f "$DASHBOARD_HTML" "$LEGACY_HTML"' EXIT

curl -fsS "$DASHBOARD_URL" >"$DASHBOARD_HTML" || die "could not read canonical dashboard HTML"
grep -F '<title>Riga SS Apartment History</title>' "$DASHBOARD_HTML" >/dev/null || \
  die "canonical dashboard title mismatch (observed: $(extract_title "$DASHBOARD_HTML" || true))"
grep -F '/dashboards/riga-real-estate/assets/' "$DASHBOARD_HTML" >/dev/null || \
  die "canonical dashboard HTML missing dashboard asset refs"

curl -fsS "$LEGACY_URL" >"$LEGACY_HTML" || die "could not read legacy /riga-real-estate/ HTML"
grep -F '<title>Riga real estate observations · negativezero</title>' "$LEGACY_HTML" >/dev/null || \
  die "legacy /riga-real-estate/ title mismatch (observed: $(extract_title "$LEGACY_HTML" || true); asset hint: $(extract_dashboard_asset_hint "$LEGACY_HTML" || true))"
grep -F 'href="./styles.css"' "$LEGACY_HTML" >/dev/null || \
  die "legacy /riga-real-estate/ missing ./styles.css (observed title: $(extract_title "$LEGACY_HTML" || true))"
grep -F 'src="./app.js"' "$LEGACY_HTML" >/dev/null || \
  die "legacy /riga-real-estate/ missing ./app.js (observed title: $(extract_title "$LEGACY_HTML" || true))"
if grep -F '/dashboards/riga-real-estate/assets/' "$LEGACY_HTML" >/dev/null; then
  die "legacy /riga-real-estate/ unexpectedly serves dashboard assets (observed title: $(extract_title "$LEGACY_HTML" || true); asset hint: $(extract_dashboard_asset_hint "$LEGACY_HTML" || true))"
fi

printf 'public riga route verification passed\n'
