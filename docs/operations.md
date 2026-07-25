# Operations

Production runbook for [kavanow.gr](https://kavanow.gr). One Hetzner CX23 in
Falkenstein, SSH as `deploy@` (key `kavanow-deploy`, 1Password vault **KavaNow**
— not the separate `Hetzner` item in the same vault). The stack lives in
`/srv/kavanow`: Postgres, api, api-jobs (`--profile jobs`), and Caddy as the
reverse proxy, all under `docker-compose.yml` with `.env.production`.

```bash
cd /srv/kavanow
docker compose --env-file .env.production ps
```

## Scheduled maintenance

| When                                 | What                                                    | Reboots?                       |
| ------------------------------------ | ------------------------------------------------------- | ------------------------------ |
| Nightly 02:17 UTC                    | `backup.sh nightly` — logical `pg_dump`                  | no                             |
| Daily 03:00 UTC ±15 min              | `unattended-upgrades` — `-security` **and** `-updates`   | 03:30 UTC, only if required    |
| First Sunday of the month, 04:00 UTC | `kavanow-maintenance` — full `dist-upgrade` + image prune | immediately, only if required  |

Reboots take production down for 30–60 s. Every compose service is
`restart: unless-stopped`, so recovery is automatic; nothing needs a human. In
practice a reboot is required roughly monthly (kernel or glibc).

Config and full details: [infra/maintenance/README.md](../infra/maintenance/README.md).
Backups: [infra/backup/README.md](../infra/backup/README.md).

### Changing the schedule or the config

Everything is declared in `infra/maintenance/`. Edit the file there and re-apply
— never edit the config on the VM, it will be overwritten on the next
provision run.

```bash
gh workflow run provision.yml -f action=maintenance
```

Or directly, if you'd rather not wait on the workflow:

```bash
infra/maintenance/apply.sh deploy@167.233.66.226
```

### Patching now, outside the window

```bash
ssh deploy@167.233.66.226 'sudo unattended-upgrade -v'          # security + updates, no reboot
ssh deploy@167.233.66.226 'sudo systemctl start kavanow-maintenance'  # full sweep, reboots if required
```

`kavanow-maintenance` takes a `pre-maintenance` dump before it touches
anything, so this is safe to trigger by hand.

### Verifying it's alive

```bash
systemctl list-timers apt-daily-upgrade.timer kavanow-maintenance.timer
tail -50 /var/log/unattended-upgrades/unattended-upgrades.log
journalctl -u kavanow-maintenance -n 100
```

A silent `unattended-upgrades` is the failure mode to watch for: a syntax error
in `/etc/apt/apt.conf.d/*` disables the run without logging an error anywhere.
`infra/maintenance/install.sh` guards against this with a `--dry-run` check on
every apply, but if the log has gone quiet for more than a couple of days, run
`sudo unattended-upgrade --dry-run --debug` and read the output.

### Before a planned window

- Silence the Better Stack monitor for the window.
- Check no deploy is mid-flight. A `production` approval sitting in "waiting"
  holds the `deploy-prod` concurrency group and queues every later run with
  zero jobs — it looks like Actions is broken. Find it with
  `gh api '/repos/:owner/:repo/actions/runs?per_page=50' --jq '.workflow_runs[] | select(.status != "completed") | .html_url'`.

## Disk

The 2026-06-28 outage was disk exhaustion: images are SHA-tagged, so they are
never *dangling* and `docker image prune -f` reclaimed nothing while a fresh
set of three accumulated per deploy. Postgres could not write, `/api/health`
503'd, and `/` stayed 200 because Caddy serves the SPA statically.

Both deploy.yml and the monthly sweep now run
`docker image prune -af --filter 'until=168h'`. To recover live:

```bash
cd /srv/kavanow
docker image prune -af
docker compose --env-file .env.production up -d
```

## Health

`GET /api/health` does a guarded `select 1` and reports the deployed SHA.
Cloudflare Bot Fight Mode 403s *unverified* automated traffic, so probe the
origin directly from CI rather than through the edge:

```bash
curl --resolve kavanow.gr:443:167.233.66.226 -k https://kavanow.gr/api/health
```
