#!/usr/bin/env bash
# Monthly full package sweep. Lives in the repo at
# infra/maintenance/kavanow-maintenance.sh; apply.sh installs it to
# /usr/local/sbin/kavanow-maintenance and kavanow-maintenance.timer fires it.
#
# Why this exists on top of unattended-upgrades: the daily run deliberately
# skips any package that would pull in a NEW dependency, and it never runs
# dist-upgrade. Those held-back packages just accumulate. This is the sweep
# that clears them.
#
# Runs as root under systemd. Log: journalctl -u kavanow-maintenance
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

# Wait out the dpkg lock rather than failing, in case the daily
# apt-daily-upgrade run overran into this window.
apt_opts=(
  -o DPkg::Lock::Timeout=900
  -o Dpkg::Options::=--force-confdef
  -o Dpkg::Options::=--force-confold
)

# A host upgrade plus a reboot is about to happen; the nightly dump is ~2 h old
# by now. Take a fresh one, but don't let a backup failure block security
# patching — the nightly dump and the Hetzner snapshot still cover us.
if [ -x /srv/kavanow/backup.sh ]; then
  log "pre-maintenance backup"
  runuser -u deploy -- /srv/kavanow/backup.sh pre-maintenance </dev/null \
    || log "WARNING: pre-maintenance backup failed — continuing"
fi

log "apt-get update"
apt-get "${apt_opts[@]}" -qq update </dev/null

log "apt-get dist-upgrade"
apt-get "${apt_opts[@]}" -y dist-upgrade </dev/null

log "apt-get autoremove --purge / autoclean"
apt-get "${apt_opts[@]}" -y --purge autoremove </dev/null
apt-get "${apt_opts[@]}" -y autoclean </dev/null

# deploy.yml prunes images older than 168 h on every deploy; this is the
# monthly backstop for the 2026-06-28 disk-full outage (SHA-tagged images are
# never dangling, so a plain `prune -f` reclaims nothing).
log "docker image prune"
docker image prune -af --filter 'until=168h' </dev/null || log "WARNING: docker prune failed"

log "disk after sweep: $(df -h --output=avail,pcent / | tail -1 | tr -s ' ')"

if [ -f /var/run/reboot-required ]; then
  log "reboot required — rebooting now (compose services are restart:unless-stopped)"
  systemctl reboot
else
  log "no reboot required"
fi
