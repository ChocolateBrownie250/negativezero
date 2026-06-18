#!/usr/bin/env bash
# End-to-end test of cross-service authorization + instant/sticky revocation.
#
# Boots the REAL admin service and the REAL bookmark-manager service wired to it
# (ADMIN_AUTHZ_URL), seeds a friend account with bookmark-manager access, and
# drives the full lifecycle over HTTP with forged SSO cookies:
#
#   1. friend with access            → 200
#   2. owner revokes the service     → friend's existing session 403 (instant)
#   3. owner re-grants the service   → the SAME old session must re-auth (401)
#   4. a freshly-issued session      → 200
#
# Run: bash platform/e2e/authz-e2e.sh   (from the repo root)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ADMIN="$ROOT/apps/admin"
BM="$ROOT/apps/bookmark-manager"
SECRET="e2e_sso_secret_value"
HEX64="$(printf 'a%.0s' {1..64})"
ADMIN_PORT=4801
BM_PORT=4802
DATA="$(mktemp -d)"
PASS=0; FAIL=0
PIDS=()

cleanup() { for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null || true; done; rm -rf "$DATA"; }
trap cleanup EXIT

check() { # desc expected actual
  if [ "$2" = "$3" ]; then echo "  ✅ $1 ($3)"; PASS=$((PASS+1)); else echo "  ❌ $1: expected $2 got $3"; FAIL=$((FAIL+1)); fi
}

wait_health() { for _ in $(seq 1 50); do curl -fsS "$1" >/dev/null 2>&1 && return 0; sleep 0.2; done; echo "service $1 never came up"; exit 1; }

# Sign an SSO JWT with jose (resolved from the admin workspace). $1=sub $2=iat-seconds
sign() { cd "$ADMIN" && node --input-type=module -e "
import { SignJWT } from 'jose';
const k = new TextEncoder().encode('$SECRET');
const t = await new SignJWT({ name: 'e2e' }).setProtectedHeader({alg:'HS256'})
  .setSubject('$1').setIssuedAt($2).setExpirationTime('1h').sign(k);
process.stdout.write(t);"; }

echo "── build admin server ──"
( cd "$ADMIN" && npm -w server run build >/dev/null 2>&1 )

echo "── seed owner + friend account (bookmark-manager only) ──"
cd "$ADMIN" && DATA_DIR="$DATA/admin" SESSION_SECRET="$HEX64" SETUP_CODE_HASH=x SSO_SESSION_SECRET="$SECRET" \
  node --input-type=module -e "
const a = await import('./server/dist/lib/accounts.js');
a.ensureOwnerAccount();
a.createAccount({ id: 'friend', name: 'Friend', services: ['bookmark-manager'] });
console.log('seeded');" >/dev/null

echo "── start admin (:$ADMIN_PORT) and bookmark-manager (:$BM_PORT) ──"
( cd "$ADMIN" && DATA_DIR="$DATA/admin" SESSION_SECRET="$HEX64" SETUP_CODE_HASH=x \
    SSO_SESSION_SECRET="$SECRET" PORT=$ADMIN_PORT NODE_ENV=development \
    node server/dist/index.js >/dev/null 2>&1 ) & PIDS+=($!)
( cd "$BM/server" && DATA_DIR="$DATA/bm" SESSION_SECRET="$HEX64" ENCRYPTION_KEY="$HEX64" \
    SETUP_CODE_HASH=x SSO_SESSION_SECRET="$SECRET" ADMIN_AUTHZ_URL="http://localhost:$ADMIN_PORT" \
    PORT=$BM_PORT NODE_ENV=development \
    "$BM/node_modules/.bin/tsx" src/index.ts >/dev/null 2>&1 ) & PIDS+=($!)

wait_health "http://localhost:$ADMIN_PORT/api/health"
wait_health "http://localhost:$BM_PORT/api/health"

NOW=$(date +%s)
OLD_COOKIE=$(sign friend $((NOW-100)))   # issued well before any revoke
OWNER_COOKIE=$(sign owner "$NOW")
BM="http://localhost:$BM_PORT/api/nodes"
code() { curl -s -o /dev/null -w '%{http_code}' --cookie "nz_session=$1" "$BM"; }
toggle() { # enabled(true|false)
  curl -s -o /dev/null --cookie "nz_session=$OWNER_COOKIE" -H 'content-type: application/json' \
    -X POST "http://localhost:$ADMIN_PORT/api/accounts/friend/service" \
    -d "{\"service\":\"bookmark-manager\",\"enabled\":$1}"; }

echo "── scenario ──"
check "friend with access → 200"            200 "$(code "$OLD_COOKIE")"
toggle false
check "after revoke → 403 (instant)"        403 "$(code "$OLD_COOKIE")"
toggle true
check "re-grant, OLD session → 401 reauth"  401 "$(code "$OLD_COOKIE")"
NEW_COOKIE=$(sign friend $((NOW+100)))       # a fresh login after the re-grant
check "fresh session → 200"                 200 "$(code "$NEW_COOKIE")"

echo "── result: $PASS passed, $FAIL failed ──"
[ "$FAIL" -eq 0 ]
