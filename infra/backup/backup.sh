#!/usr/bin/env bash
# Logical Postgres backup for kavanow. Lives in the repo at
# infra/backup/backup.sh; deploy.yml copies it to /srv/kavanow/backup.sh,
# runs it before every migration, and installs the nightly cron.
#
# Usage: backup.sh [label]     (label defaults to "nightly")
# Dumps: /srv/kavanow/backups/kavanow-<label>-<utc-stamp>.dump  (pg_dump -Fc)
# Restore procedure: infra/backup/README.md
set -euo pipefail
cd /srv/kavanow

BACKUP_DIR=/srv/kavanow/backups
KEEP_DAYS=14       # nightly logical backups — the disaster-recovery window
KEEP_PREMIGRATE=5  # pre-migrate dumps are short-lived deploy rollback nets
mkdir -p "$BACKUP_DIR"

compose() { docker compose --env-file .env.production "$@"; }

# Wait for postgres: deploys call this right after `up -d postgres`, and the
# cron may fire while the VM is still booting.
for i in $(seq 1 30); do
  if compose exec -T postgres sh -c 'pg_isready -q -U "$POSTGRES_USER"' </dev/null 2>/dev/null; then
    break
  fi
  if [ "$i" = 30 ]; then
    echo "postgres not ready after 60s — no backup written" >&2
    exit 1
  fi
  sleep 2
done

label="${1:-nightly}"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
out="$BACKUP_DIR/kavanow-$label-$stamp.dump"

# -Fc: compressed custom format, restorable with pg_restore. Write to a
# .partial first so a failed dump never looks like a usable backup.
# </dev/null is load-bearing: this script runs inside deploy.yml's
# `bash -s` heredoc, and an exec with attached stdin would swallow the rest
# of the deploy script (the post-backup migrate/restart steps).
compose exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' </dev/null > "$out.partial"
mv "$out.partial" "$out"

# Prune old dumps and stale partials. The daily Hetzner VM snapshot picks up
# whatever lives in BACKUP_DIR, so retention here also bounds snapshot growth.
#
# Every push to main writes a pre-migrate-* dump, so on busy dependency-bump
# days those pile up fast — cap them by COUNT (keep the most recent
# KEEP_PREMIGRATE). The age sweep below is the absolute ceiling for every label.
ls -1t "$BACKUP_DIR"/kavanow-pre-migrate-*.dump 2>/dev/null \
  | tail -n +"$((KEEP_PREMIGRATE + 1))" | xargs -r rm -f || true
find "$BACKUP_DIR" -name 'kavanow-*.dump' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name '*.partial' -mmin +120 -delete

echo "$(date -u +%FT%TZ) backup written: $out ($(du -h "$out" | cut -f1))"
