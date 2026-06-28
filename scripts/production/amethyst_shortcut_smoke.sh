#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://negativezero.one/services/amethyst}"

tmp_headers="$(mktemp)"
tmp_body="$(mktemp)"
trap 'rm -f "$tmp_headers" "$tmp_body"' EXIT

curl -fsS "$BASE_URL/api/v1/ready" | grep -F '"status":"ready"' >/dev/null

curl -sS -D "$tmp_headers" -o "$tmp_body" \
  -X POST "$BASE_URL/api/v1/shortcuts/transcribe" \
  -H 'Content-Type: audio/mp4' \
  --data-binary 'not real audio' >/dev/null
grep -i '^content-type: application/json' "$tmp_headers" >/dev/null
grep -F '"text"' "$tmp_body" >/dev/null

curl -sS -D "$tmp_headers" -o "$tmp_body" \
  -X POST "$BASE_URL/api/v1/transcribe/file" \
  -H 'Content-Type: audio/mp4' \
  --data-binary 'not real audio' >/dev/null
if grep -F '405 Method Not Allowed' "$tmp_headers" >/dev/null; then
  echo "raw file alias is still missing" >&2
  exit 1
fi
grep -i '^content-type: application/json' "$tmp_headers" >/dev/null
grep -F '"text"' "$tmp_body" >/dev/null

echo "amethyst shortcut smoke ok"
