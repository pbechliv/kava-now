#!/usr/bin/env bash
# Runs ON the production VM, from the staging dir apply.sh scp'd it into.
# Idempotent. Never invoke this from your laptop — use apply.sh.
#
# This is a real file executed by path rather than a heredoc piped to `bash -s`
# on purpose: several commands below would otherwise eat the rest of the script
# off stdin (the trap that silently skipped a whole deploy on 2026-06-10).
set -Eeuo pipefail

src="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Installing config"
sudo install -m 0644 -o root -g root "$src/52kavanow-upgrades" \
  /etc/apt/apt.conf.d/52kavanow-upgrades

sudo install -d -m 0755 /etc/systemd/system/apt-daily-upgrade.timer.d
sudo install -m 0644 -o root -g root "$src/apt-daily-upgrade-override.conf" \
  /etc/systemd/system/apt-daily-upgrade.timer.d/kavanow.conf

sudo install -m 0755 -o root -g root "$src/kavanow-maintenance.sh" \
  /usr/local/sbin/kavanow-maintenance
sudo install -m 0644 -o root -g root "$src/kavanow-maintenance.service" \
  /etc/systemd/system/kavanow-maintenance.service
sudo install -m 0644 -o root -g root "$src/kavanow-maintenance.timer" \
  /etc/systemd/system/kavanow-maintenance.timer

# cloud-init used to `>>` these two keys onto the stock conffile, which makes
# dpkg prompt about a modified conffile on every unattended-upgrades update.
# 52kavanow-upgrades owns them now. The stock file ships them commented out
# (`//Unattended-Upgrade::…`), so the `^` anchor can't touch the defaults.
sudo sed -i \
  -e '/^Unattended-Upgrade::Automatic-Reboot "true";$/d' \
  -e '/^Unattended-Upgrade::Automatic-Reboot-Time "03:30";$/d' \
  /etc/apt/apt.conf.d/50unattended-upgrades

echo "==> Enabling units"
sudo systemctl daemon-reload </dev/null
sudo systemctl enable --now unattended-upgrades.service </dev/null
sudo systemctl enable --now apt-daily.timer apt-daily-upgrade.timer </dev/null
sudo systemctl enable --now kavanow-maintenance.timer </dev/null

# A syntax error in the apt conf doesn't fail loudly — it just silently drops
# the whole unattended-upgrades run. Prove it parses before we walk away.
echo "==> Verifying"
apt-config dump 'Unattended-Upgrade::Allowed-Origins' </dev/null
if ! out=$(sudo unattended-upgrade --dry-run --debug </dev/null 2>&1); then
  echo "ERROR: unattended-upgrade --dry-run failed" >&2
  printf '%s\n' "$out" >&2
  exit 1
fi
printf '%s\n' "$out" | grep -E '^(Allowed origins|Packages that will be upgraded|No packages found)' || true

systemctl list-timers --no-pager --all \
  apt-daily-upgrade.timer kavanow-maintenance.timer </dev/null

echo "==> Maintenance config installed"
