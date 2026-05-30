#!/usr/bin/env bash
# =============================================================================
# KavaNow — One-time VM bootstrap
#
# Runs on the production VM (after Terraform + cloud-init have provisioned it)
# as the `deploy` user. Wires up the operational secrets and files that we
# deliberately keep out of Terraform state:
#   - GHCR docker login
#   - Cloudflare Origin CA cert + key under /etc/kavanow/tls/
#   - /srv/kavanow/.env.production
#
# Secrets are pasted into editors (never piped via argv/env) so they never
# land in shell history.
#
# Usage:
#   ssh -i ~/.ssh/kavanow_deploy deploy@<vm_ip>
#   curl -fsSL https://raw.githubusercontent.com/pbechliv/kava-now/main/scripts/bootstrap-vm.sh -o bootstrap.sh
#   chmod +x bootstrap.sh && ./bootstrap.sh
# =============================================================================
set -euo pipefail

if [ "$(whoami)" != "deploy" ]; then
  echo "ERROR: must run as the 'deploy' user. Got: $(whoami)" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker not installed. cloud-init may still be running — try again in a few minutes." >&2
  exit 1
fi

echo "==> Creating directories"
sudo mkdir -p /srv/kavanow /etc/kavanow/tls /var/log/kavanow
sudo chown deploy:deploy /srv/kavanow /var/log/kavanow
sudo chown root:root /etc/kavanow/tls
sudo chmod 755 /etc/kavanow/tls

echo
echo "==> GHCR login"
echo "    GitHub username:"
read -r GHCR_USER
echo "    GHCR PAT (read:packages scope, will not be echoed):"
read -rs GHCR_PAT
echo
printf '%s' "$GHCR_PAT" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
unset GHCR_PAT

echo
echo "==> Cloudflare Origin CA certificate"
echo "    Paste the FULL certificate (-----BEGIN CERTIFICATE----- … -----END CERTIFICATE-----)"
echo "    Press Ctrl-O to save, Ctrl-X to exit."
read -rp "    [press enter to open editor]" _
sudo nano /etc/kavanow/tls/origin.pem
sudo chown root:root /etc/kavanow/tls/origin.pem
sudo chmod 644 /etc/kavanow/tls/origin.pem

echo
echo "==> Cloudflare Origin CA private key"
echo "    Paste the FULL key (-----BEGIN PRIVATE KEY----- … -----END PRIVATE KEY-----)"
echo "    Press Ctrl-O to save, Ctrl-X to exit."
read -rp "    [press enter to open editor]" _
sudo nano /etc/kavanow/tls/origin.key
sudo chown root:root /etc/kavanow/tls/origin.key
sudo chmod 600 /etc/kavanow/tls/origin.key

echo "    Validating cert + key match…"
CERT_MOD=$(sudo openssl x509 -noout -modulus -in /etc/kavanow/tls/origin.pem | openssl md5)
KEY_MOD=$(sudo openssl rsa  -noout -modulus -in /etc/kavanow/tls/origin.key 2>/dev/null | openssl md5 \
        || sudo openssl pkey -pubout -in /etc/kavanow/tls/origin.key | openssl md5)
if [ "$CERT_MOD" != "$KEY_MOD" ]; then
  echo "ERROR: cert and key modulus do not match. Re-paste both." >&2
  exit 1
fi
echo "    OK — cert and key match."

echo
echo "==> /srv/kavanow/.env.production"
echo "    Use the .env.production.example in the repo as a template."
echo "    Paste secrets from 1Password. Press Ctrl-O to save, Ctrl-X to exit."
read -rp "    [press enter to open editor]" _
sudo -u deploy nano /srv/kavanow/.env.production
chmod 600 /srv/kavanow/.env.production

echo
echo "==> Hetzner backups sanity check"
echo "    Confirm in the Hetzner Console that 'Backups' is enabled on this server."
echo "    (Terraform sets backups = true on hcloud_server.kavanow.)"

echo
echo "==> Done. Next step: trigger deploy.yml from GitHub Actions."
