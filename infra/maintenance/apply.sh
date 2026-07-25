#!/usr/bin/env bash
# Install/refresh the unattended-maintenance config on the production VM.
# Idempotent — safe to re-run after editing any file in this directory.
#
#   infra/maintenance/apply.sh                      # uses the `vm` ssh alias (CI)
#   infra/maintenance/apply.sh deploy@167.233.66.226
#
# Also run automatically by .github/workflows/provision.yml
# (action=apply|bootstrap|maintenance).
set -Eeuo pipefail

target="${1:-vm}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
staging='.kavanow-maintenance'

echo "==> Shipping maintenance config to $target"
ssh "$target" "rm -rf ~/$staging && mkdir -p ~/$staging"
scp -q \
  "$here/52kavanow-upgrades" \
  "$here/apt-daily-upgrade-override.conf" \
  "$here/kavanow-maintenance.sh" \
  "$here/kavanow-maintenance.service" \
  "$here/kavanow-maintenance.timer" \
  "$here/install.sh" \
  "$target:$staging/"

ssh "$target" "bash ~/$staging/install.sh && rm -rf ~/$staging"
