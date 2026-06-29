#!/usr/bin/env bash
# One-off: install a new admin setup-code hash and recreate the admin container.
# $1 = deploy path, $2 = path to a temp file on the box holding the plaintext code.
# Hashes with bcryptjs (cost 12) exactly like platform/deploy.sh. Read code from a
# file (never argv); deletes it on exit. Does not print the code or the hash.
set -euo pipefail
DP="$1"
CODE_FILE="$2"
ENV_FILE="$DP/platform/.env"
COMPOSE="$DP/platform/docker-compose.yml"
trap 'rm -f "$CODE_FILE"' EXIT

[ -f "$ENV_FILE" ]  || { echo "ERROR: no $ENV_FILE"; exit 1; }
[ -f "$COMPOSE" ]   || { echo "ERROR: no $COMPOSE"; exit 1; }
[ -f "$CODE_FILE" ] || { echo "ERROR: no code file"; exit 1; }
CODE="$(cat "$CODE_FILE")"
[ -n "$CODE" ] || { echo "ERROR: empty code"; exit 1; }

echo "Hashing setup code with bcryptjs (cost 12)..."
HASH="$(docker run --rm -e CODE="$CODE" node:20-alpine sh -c 'cd /tmp && npm i bcryptjs --silent >/dev/null 2>&1 && node -e "require(\"bcryptjs\").hash(process.env.CODE,12).then(h=>console.log(h))"')"
case "$HASH" in
  '$2'*) echo "hash generated (length ${#HASH})" ;;
  *) echo "ERROR: unexpected hash output"; exit 1 ;;
esac

# Escape $ -> $$ so docker compose's env-file interpolation collapses it back to
# a literal $ in the YAML (same handling as deploy.sh for bcrypt hashes).
ESC="${HASH//\$/\$\$}"

echo "Backing up .env and updating ADMIN_SETUP_CODE_HASH..."
cp -a "$ENV_FILE" "$ENV_FILE.bak.$(date +%s)"
if grep -q '^ADMIN_SETUP_CODE_HASH=' "$ENV_FILE"; then
  awk -v val="ADMIN_SETUP_CODE_HASH=$ESC" '/^ADMIN_SETUP_CODE_HASH=/{print val; next} {print}' "$ENV_FILE" > "$ENV_FILE.tmp"
  mv "$ENV_FILE.tmp" "$ENV_FILE"
else
  printf '%s\n' "ADMIN_SETUP_CODE_HASH=$ESC" >> "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"

echo "Recreating admin container with the new env..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE" up -d --force-recreate admin

echo "Waiting for admin health..."
ok=0
for _ in $(seq 1 30); do
  if docker exec negativezero-admin node -e "require('http').get('http://127.0.0.1:3000/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))" 2>/dev/null; then ok=1; break; fi
  sleep 2
done
if [ "$ok" = "1" ]; then
  echo "ADMIN HEALTHY — new setup code is active."
else
  echo "WARN: admin health not confirmed; recent logs:"
  docker logs --tail 40 negativezero-admin 2>&1 | tail -40
fi
echo "DONE"
