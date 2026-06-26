#!/usr/bin/env bash
# Upsert a single KEY=<value> into platform/.env, preserving every other line.
#
# Why this exists: the CI deploy seeds/rotates GROQ_API_KEY from a repo secret,
# but platform/.env lives only on the box and — when the deploy runs as a
# non-root SSH_USER via passwordless sudo — is created root-owned and chmod 600
# by deploy.sh. A non-sudo rewrite there can't read the file, would clobber it
# down to a single line, and break every other service. So this runs with the
# SAME privilege as deploy.sh (the caller invokes it as root or via `sudo -n`),
# reads the secret VALUE from stdin (never argv / the process list), and writes
# atomically while preserving the file's owner and 600 mode.
#
# Usage:   printf '%s' "$VALUE" | bash platform/seed-env-key.sh KEY_NAME
# No-op if platform/.env does not exist yet (a fresh box gets a full .env from
# deploy.sh's first-run generation; the key is seeded on the next deploy).
set -euo pipefail

key_name="${1:?usage: seed-env-key.sh KEY_NAME  (value on stdin)}"
script_dir="$(cd "$(dirname "$0")" && pwd)"
env_file="$script_dir/.env"

if [ ! -f "$env_file" ]; then
    echo "seed-env-key: $env_file absent — skipping; $key_name will be set on first-run generation."
    exit 0
fi

value="$(cat)"

tmp="$(mktemp "$script_dir/.env.XXXXXX")"
trap 'rm -f "$tmp"' EXIT

# Keep all other lines verbatim; drop any existing entry for this key, then add
# the new value once at the end. `|| true`: grep exits 1 when the key is absent.
grep -v "^${key_name}=" "$env_file" > "$tmp" || true
printf '%s=%s\n' "$key_name" "$value" >> "$tmp"

# Match the original file's mode + owner so a root:600 .env stays root:600.
chmod 600 "$tmp"
chown --reference="$env_file" "$tmp" 2>/dev/null || true
mv -f "$tmp" "$env_file"
trap - EXIT

echo "seed-env-key: ${key_name} updated in $env_file"
