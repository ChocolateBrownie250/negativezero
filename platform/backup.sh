#!/usr/bin/env bash
# Off-host backup of negativezero state.
#
# Idempotent: cron-safe, no destructive ops, exits 0 on a no-op.
# Run from /srv/negativezero/ on the VPS as root (needs Docker socket
# for the Logto pg dump and file ownership doesn't matter for read).
#
# What gets backed up:
#   - platform/data/bookmark-manager/ (SQLite + WAL)
#   - platform/data/admin/             (SQLite + WAL)
#   - platform/data/tts/               (transcription SQLite + audio cache)
#   - platform/.env                    (chmod-600 secrets)
#   - Logto's postgres state (pg_dumpall from negativezero-postgres)
#
# Destination is one of: an S3 bucket (default if BACKUP_S3_URI is set)
# or a remote rsync target (set BACKUP_RSYNC_DEST instead). Pick one
# in /etc/negativezero-backup.env before running.
#
# Retention: keeps the last RETAIN_DAYS days of snapshots (default 30).
# Older snapshots are deleted from the destination.
#
# Exit codes:
#   0  ok
#   1  config missing or invalid
#   2  one of the backup steps failed (see stderr)

set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────
# Sourced from /etc/negativezero-backup.env if present; falls back to
# environment variables. At least one of BACKUP_S3_URI or
# BACKUP_RSYNC_DEST must be set.
CONFIG="${CONFIG:-/etc/negativezero-backup.env}"
if [ -r "$CONFIG" ]; then
    # shellcheck disable=SC1090
    . "$CONFIG"
fi

SRC_ROOT="${SRC_ROOT:-/srv/negativezero}"
RETAIN_DAYS="${RETAIN_DAYS:-30}"
DATE_STAMP="$(date -u +%Y-%m-%d)"
WORKDIR="$(mktemp -d -t negativezero-backup.XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT

# ─── Pre-flight ──────────────────────────────────────────────────────
if [ -z "${BACKUP_S3_URI:-}" ] && [ -z "${BACKUP_RSYNC_DEST:-}" ]; then
    echo "error: neither BACKUP_S3_URI nor BACKUP_RSYNC_DEST is set" >&2
    echo "       set one in $CONFIG (or as an env var)" >&2
    echo "" >&2
    echo "       example /etc/negativezero-backup.env:" >&2
    echo "         BACKUP_S3_URI=s3://my-bucket/negativezero/" >&2
    echo "         # or:" >&2
    echo "         BACKUP_RSYNC_DEST=backup-user@host:/backups/negativezero/" >&2
    exit 1
fi

if [ ! -d "$SRC_ROOT/platform/data" ]; then
    echo "error: SRC_ROOT/$SRC_ROOT/platform/data not found" >&2
    exit 1
fi

# ─── Collect ─────────────────────────────────────────────────────────
echo "[$(date -u +%T)] collecting snapshot into $WORKDIR/$DATE_STAMP" >&2
SNAP="$WORKDIR/$DATE_STAMP"
mkdir -p "$SNAP"

# SQLite files. Each service has a `.db` + `.db-wal` + `.db-shm` — we copy
# all three. SQLite's WAL mode means the DB file alone isn't a consistent
# snapshot under concurrent writes; better-sqlite3's default checkpoint
# on close usually drains the WAL but isn't guaranteed mid-flight. For
# point-in-time consistency we'd issue a `VACUUM INTO` first, but at our
# write rate (single user, one service each) the WAL is typically empty
# or near-empty and a raw file copy is fine. Re-evaluate if data loss
# from a torn snapshot ever shows up.
for svc in bookmark-manager admin tts; do
    SRC="$SRC_ROOT/platform/data/$svc"
    if [ -d "$SRC" ]; then
        mkdir -p "$SNAP/$svc"
        # `cp -a` preserves mtime and mode; -L resolves any future symlinks
        cp -aL "$SRC"/. "$SNAP/$svc/"
    else
        echo "  warn: $SRC missing, skipping $svc" >&2
    fi
done

# Secrets file (read-only, chmod 600). Operator should already have
# this in 1Password too; the snapshot is the disaster-recovery copy.
if [ -r "$SRC_ROOT/platform/.env" ]; then
    cp -a "$SRC_ROOT/platform/.env" "$SNAP/env"
fi

# Logto's Postgres dump. We talk to whichever postgres container is
# running for Logto today — could be `negativezero-postgres` (from the
# pre-merge negativezero-services compose) or the one this monorepo's
# compose brings up. Try both names; quiet failure means Logto's on
# Neon by the time you read this and there's nothing to dump locally.
for pg_container in negativezero-postgres negativezero-logto-postgres; do
    if docker ps --format '{{.Names}}' | grep -qx "$pg_container"; then
        echo "  dumping $pg_container" >&2
        if docker exec "$pg_container" pg_dumpall -U postgres \
                > "$SNAP/logto-postgres.sql" 2>/dev/null; then
            break
        else
            echo "  warn: pg_dumpall failed against $pg_container" >&2
            rm -f "$SNAP/logto-postgres.sql"
        fi
    fi
done

# tarball it (smaller transfers + atomic single-object on S3)
echo "[$(date -u +%T)] archiving" >&2
ARCHIVE="$WORKDIR/negativezero-$DATE_STAMP.tar.gz"
tar -C "$WORKDIR" -czf "$ARCHIVE" "$DATE_STAMP"
SIZE="$(du -h "$ARCHIVE" | cut -f1)"
echo "  archive: $ARCHIVE ($SIZE)" >&2

# ─── Encrypt ─────────────────────────────────────────────────────────
# The tarball contains platform/.env (all service secrets) and the Logto
# Postgres dump, so it must never sit unencrypted at rest in S3 or on the
# rsync target. If BACKUP_PASSPHRASE is set we encrypt client-side before
# upload and ship only the ciphertext; the prune regex below also matches
# the encrypted suffix. If it's unset we keep the legacy behavior but warn
# loudly that an unencrypted secrets bundle is leaving the host.
if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
    if command -v gpg >/dev/null 2>&1; then
        ENC_ARCHIVE="$ARCHIVE.gpg"
        echo "[$(date -u +%T)] encrypting archive (gpg --symmetric, AES-256)" >&2
        if printf '%s' "$BACKUP_PASSPHRASE" | gpg --batch --yes --quiet \
                --pinentry-mode loopback --passphrase-fd 0 \
                --cipher-algo AES256 --symmetric \
                -o "$ENC_ARCHIVE" "$ARCHIVE"; then
            rm -f "$ARCHIVE"
            ARCHIVE="$ENC_ARCHIVE"
        else
            echo "error: gpg encryption failed; refusing to upload plaintext secrets" >&2
            exit 2
        fi
    elif command -v openssl >/dev/null 2>&1; then
        ENC_ARCHIVE="$ARCHIVE.enc"
        echo "[$(date -u +%T)] encrypting archive (openssl enc -aes-256-cbc -pbkdf2)" >&2
        if BACKUP_PASSPHRASE="$BACKUP_PASSPHRASE" openssl enc -aes-256-cbc -pbkdf2 -salt \
                -pass env:BACKUP_PASSPHRASE \
                -in "$ARCHIVE" -out "$ENC_ARCHIVE"; then
            rm -f "$ARCHIVE"
            ARCHIVE="$ENC_ARCHIVE"
        else
            echo "error: openssl encryption failed; refusing to upload plaintext secrets" >&2
            exit 2
        fi
    else
        echo "error: BACKUP_PASSPHRASE is set but neither gpg nor openssl is installed" >&2
        echo "       install one (apt-get install gnupg) or unset BACKUP_PASSPHRASE" >&2
        exit 2
    fi
    SIZE="$(du -h "$ARCHIVE" | cut -f1)"
    echo "  encrypted archive: $ARCHIVE ($SIZE)" >&2
else
    warn_line() { printf '\033[1;33m!!  %s\033[0m\n' "$*" >&2; }
    warn_line "WARNING: BACKUP_PASSPHRASE is not set."
    warn_line "WARNING: shipping UNENCRYPTED archive containing platform/.env"
    warn_line "WARNING: (all service secrets) and the Logto Postgres dump."
    warn_line "WARNING: set BACKUP_PASSPHRASE in $CONFIG to encrypt at rest."
fi

# ─── Ship ────────────────────────────────────────────────────────────
exit_code=0
if [ -n "${BACKUP_S3_URI:-}" ]; then
    echo "[$(date -u +%T)] uploading to $BACKUP_S3_URI" >&2
    if command -v aws >/dev/null 2>&1; then
        aws s3 cp "$ARCHIVE" "${BACKUP_S3_URI%/}/" || exit_code=2
    else
        echo "  error: aws CLI not installed (apt-get install awscli)" >&2
        exit_code=2
    fi
fi

if [ -n "${BACKUP_RSYNC_DEST:-}" ]; then
    echo "[$(date -u +%T)] rsyncing to $BACKUP_RSYNC_DEST" >&2
    # rsync with -z for over-the-wire compression (the tar.gz is already
    # compressed, but ssh's compression can still squeeze a few %),
    # --partial in case the link drops mid-transfer, --timeout to fail
    # the script instead of hanging cron.
    if rsync -avz --partial --timeout=900 \
            "$ARCHIVE" "$BACKUP_RSYNC_DEST"; then
        :
    else
        echo "  error: rsync failed" >&2
        exit_code=2
    fi
fi

# ─── Prune ───────────────────────────────────────────────────────────
# Best-effort retention. We compute the cutoff date in YYYY-MM-DD form
# and ask the destination to delete anything older. For S3 we use a
# lifecycle policy normally — this script just nudges with an
# explicit list-and-delete in case the bucket has no policy yet.
echo "[$(date -u +%T)] pruning > $RETAIN_DAYS days" >&2
CUTOFF="$(date -u -d "$RETAIN_DAYS days ago" +%Y-%m-%d 2>/dev/null \
       || date -u -v"-${RETAIN_DAYS}d" +%Y-%m-%d 2>/dev/null \
       || echo "")"
if [ -z "$CUTOFF" ]; then
    echo "  warn: couldn't compute cutoff date (bsd vs gnu date) — skipping prune" >&2
elif [ -n "${BACKUP_S3_URI:-}" ] && command -v aws >/dev/null 2>&1; then
    # Match both plaintext (.tar.gz) and encrypted (.tar.gz.gpg/.enc) objects
    # so retention works regardless of whether BACKUP_PASSPHRASE is set, and
    # also cleans up older snapshots from before encryption was enabled.
    aws s3 ls "${BACKUP_S3_URI%/}/" \
        | awk '{print $4}' \
        | grep -E '^negativezero-[0-9]{4}-[0-9]{2}-[0-9]{2}\.tar\.gz(\.gpg|\.enc)?$' \
        | while read -r key; do
            d="${key#negativezero-}"
            d="${d%.tar.gz.gpg}"; d="${d%.tar.gz.enc}"; d="${d%.tar.gz}"
            if [ "$d" \< "$CUTOFF" ]; then
                echo "  pruning $key" >&2
                aws s3 rm "${BACKUP_S3_URI%/}/$key" || true
            fi
        done
fi
# For rsync destination, prune is the remote box's responsibility
# (a simple `find /backups -name 'negativezero-*.tar.gz' -mtime +30
# -delete` cron there). Adding it here would require a second SSH hop
# we'd rather not embed in the backup script.

echo "[$(date -u +%T)] done (exit $exit_code)" >&2
exit $exit_code
