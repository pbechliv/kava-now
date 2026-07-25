# OS maintenance

Ubuntu package updates on the production VM. Two layers, both unattended.

| When                                | What                                                       | Reboots?                          |
| ----------------------------------- | ---------------------------------------------------------- | --------------------------------- |
| Daily, 03:00 UTC ±15 min            | `unattended-upgrades` — `-security` **and** `-updates`      | At 03:30 UTC, only if required    |
| First Sunday of the month, 04:00 UTC | `kavanow-maintenance` — full `dist-upgrade` + prune         | Immediately, only if required     |

03:30 UTC is 06:30 Athens; 04:00 is 07:00. All compose services are
`restart: unless-stopped`, so the stack comes back by itself — expect a 30–60 s
outage on the nights a reboot actually happens (kernel/glibc, roughly monthly).

## Why two layers

`unattended-upgrades` deliberately skips any package that would pull in a **new
dependency**, and it never runs `dist-upgrade`. Those held-back packages just
pile up, so the monthly sweep clears them. The daily run is what keeps the
security window short; the monthly run is housekeeping.

Two defaults are overridden because the stock combination doesn't work:

- Stock `Allowed-Origins` is `-security` only, so bugfix updates never land.
  `52kavanow-upgrades` appends `-updates` (APT list options accumulate across
  `conf.d` files).
- Stock `apt-daily-upgrade.timer` fires at 06:00 with up to 60 min of jitter.
  With `Automatic-Reboot-Time "03:30"` the reboot is then scheduled for the
  *next* 03:30 — ~20 h later, so the box runs a patched disk on an unpatched
  kernel all day. The drop-in moves the run to 03:00.

## Files

| Repo                              | VM                                                        |
| --------------------------------- | --------------------------------------------------------- |
| `52kavanow-upgrades`              | `/etc/apt/apt.conf.d/52kavanow-upgrades`                   |
| `apt-daily-upgrade-override.conf` | `/etc/systemd/system/apt-daily-upgrade.timer.d/kavanow.conf` |
| `kavanow-maintenance.sh`          | `/usr/local/sbin/kavanow-maintenance`                      |
| `kavanow-maintenance.service`     | `/etc/systemd/system/kavanow-maintenance.service`           |
| `kavanow-maintenance.timer`       | `/etc/systemd/system/kavanow-maintenance.timer`             |

This directory is the **single source of truth**. `cloud-init.yaml` installs
the `unattended-upgrades` package on first boot but does not configure it —
`apply.sh` owns the config, for both fresh and running VMs.

## Applying a change

Edit the file here, then either run `provision.yml` with `action=maintenance`
(preferred — no secrets are touched), or from your laptop:

```bash
infra/maintenance/apply.sh deploy@167.233.66.226
```

`install.sh` validates the result with `unattended-upgrade --dry-run` before it
exits — a syntax error in the apt conf otherwise silently disables the entire
daily run with no error anywhere.

## Checking on it

```bash
systemctl list-timers apt-daily-upgrade.timer kavanow-maintenance.timer
apt-config dump 'Unattended-Upgrade::Allowed-Origins'
tail -50 /var/log/unattended-upgrades/unattended-upgrades.log
journalctl -u kavanow-maintenance -n 100
```

## Running the sweep by hand

```bash
sudo systemctl start kavanow-maintenance   # will reboot if required
```

To patch without the reboot, run `sudo unattended-upgrade -v` and reboot
yourself when `/var/run/reboot-required` shows up.

## Before a planned window

Silence the Better Stack monitor for the window, and don't schedule it against
a pending deploy — a `production` approval sitting in "waiting" holds the
`deploy-prod` concurrency group and blocks every later run.
