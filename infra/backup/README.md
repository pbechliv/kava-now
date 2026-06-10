# Postgres backups

Logical `pg_dump` backups of the production database, layered on top of the
daily Hetzner VM snapshots (`backups = true` in Terraform).

## What runs

| When                   | What                             | How it got there                                                            |
| ---------------------- | -------------------------------- | --------------------------------------------------------------------------- |
| Nightly 02:17 UTC      | `/srv/kavanow/backup.sh nightly` | cron in the `deploy` user's crontab, installed idempotently by every deploy |
| Before every migration | `backup.sh pre-migrate-<sha7>`   | step in `deploy.yml` — a failed backup **blocks** the migration             |

- Dumps: `/srv/kavanow/backups/kavanow-<label>-<utc-stamp>.dump` (`pg_dump -Fc`)
- Retention: 14 days, pruned by the script itself
- Log: `/srv/kavanow/backups/backup.log`
- The daily Hetzner VM snapshot (7 retained) includes the backups directory,
  so every snapshot carries a _consistent logical dump_ at most 24 h old —
  restoring no longer depends on WAL crash recovery of a live data volume.
  True offsite storage (Storage Box / S3) is a follow-up; see issue #44.

## Restore

```bash
ssh deploy@<vm>
cd /srv/kavanow

# 1. Stop writers (Caddy keeps serving a 502 for /api; static SPA stays up).
docker compose --env-file .env.production stop api

# 2. Recreate the database and restore the dump. ACLs (kavanow_app grants)
#    and RLS policies are part of the dump; --no-owner makes everything owned
#    by the restoring role (kavanow, the owner role).
docker compose --env-file .env.production exec -T postgres \
  sh -c 'dropdb --force -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose --env-file .env.production exec -T postgres \
  sh -c 'pg_restore --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < backups/kavanow-<label>-<stamp>.dump

# 3. Restart and smoke-check.
docker compose --env-file .env.production up -d api
curl -fsS https://kavanow.gr/api/health
```

To restore from a VM snapshot instead (machine lost entirely): restore the
snapshot in the Hetzner console, then restore the newest dump from
`/srv/kavanow/backups` as above — don't trust the snapshotted live data
volume over the logical dump.

## Verify a dump without restoring

```bash
docker compose --env-file .env.production exec -T postgres pg_restore --list \
  < backups/kavanow-<label>-<stamp>.dump | head
```

A periodic full restore drill is tracked in issue #24.
