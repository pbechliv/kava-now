# GitHub Actions Automation for the Hetzner Deployment

## Context

`plans/hetzner-deployment-plan.md` ships KavaNow on a single Hetzner CX22 with one already-sketched `deploy.yml` (Phase 6). Everything else — VM creation, DNS, OS hardening, migrations, rollbacks, backup verification, disaster recovery — is described as imperative steps a human runs from the runbook. That is fine on Day 1; it is a liability on Day 90, because the steps drift from reality and nobody remembers them under pressure.

Decisions captured from the user:

- **Images built in CI and pushed to GHCR.** The CX22 has 2 shared vCPU / 4 GB RAM; `pnpm install` + `tsc` + `vite build` on it is slow and OOM-prone. GHCR is free for private repos and uses `GITHUB_TOKEN`.
- **Initial provisioning via Terraform.** `hcloud` + `cloudflare` providers, run from a workflow. The same Terraform recreates the environment during a DR drill.
- **Prod only for now.** No staging branch / second VM.
- **Day-2 workflows in scope:** manual migrate, SHA rollback, scheduled backup verify, manual DB restore from backup. (Prune and dependency scanning deferred.)

The goal of this plan is to turn the existing deployment plan into a set of reproducible GitHub Actions workflows, replace the build-on-VM step with a registry-pull step, and codify the high-risk ops (restore, rollback, provisioning) as gated workflows rather than tribal knowledge.

---

## Workflow inventory

All files live under `.github/workflows/`. Names are deliberate so the Actions UI is browsable.

| File | Trigger | Purpose | Gated? |
|---|---|---|---|
| `ci.yml` | PR to `main`, push to non-`main` branches | typecheck, lint, `fmt:check`, build. No deploy. | No |
| `build-images.yml` | `workflow_call` only | Reusable: builds API + Caddy images, pushes to GHCR with `<sha>` and `latest` tags. | No |
| `deploy.yml` | push to `main`, `workflow_dispatch` | Calls `build-images`, SSHes to VM, `docker compose pull`, `up -d`, runs migrations, smoke-tests. | `environment: production` (optional manual approval after first weeks) |
| `provision.yml` | `workflow_dispatch` | Runs `terraform plan` or `apply` on `infra/terraform/`. Creates/updates VM + firewall + DNS. | `environment: infrastructure` (required approval) |
| `migrate.yml` | `workflow_dispatch` | Runs `pnpm db:migrate` on the VM without rebuilding. For when schema needs human-timed application separate from a deploy. | `environment: production` |
| `rollback.yml` | `workflow_dispatch` (input: `sha`) | Validates `ghcr.io/.../kava-now-api:<sha>` exists, then redeploys that tag. No new build. | `environment: production` (approval) |
| `backup-verify.yml` | `schedule` (weekly Sun 04:00 UTC) + `workflow_dispatch` | Pulls latest B2 backup, decrypts with age key, restores into a service-container Postgres in the runner, runs sanity SELECTs. Fails loudly. | No |
| `restore-backup.yml` | `workflow_dispatch` (inputs: `archive_name`, `confirm_phrase`) | DR workflow. Pulls a chosen B2 archive, decrypts, copies to VM, stops API, restores into prod Postgres, restarts. | `environment: infrastructure` (approval) + typed-phrase gate |
| `smoke-test.yml` | `workflow_call` | Reusable: hits `/api/healthz` and `/login` on `kavanow.tld` with retries. Called by deploy/rollback/restore. | No |

A user with only `repo:read` permissions cannot run any of the gated workflows; they go through the protected-environment approval flow.

---

## Changes to the existing Hetzner plan

These supersede the corresponding sections of `plans/hetzner-deployment-plan.md`:

1. **`docker-compose.prod.yml` switches `build:` → `image:`** for `api` and `caddy`. Example:
   ```yaml
   api:
     image: ghcr.io/<org>/kava-now-api:${IMAGE_TAG:-latest}
   caddy:
     image: ghcr.io/<org>/kava-now-caddy:${IMAGE_TAG:-latest}
   ```
   The VM no longer needs the source tree to deploy — only the compose file, the Caddyfile, and `.env.production`. Git clone on the VM is kept for the compose file/Caddyfile only.

2. **VM logs in to GHCR once** with a `read:packages`-scoped Personal Access Token written to `~deploy/.docker/config.json` via `docker login ghcr.io`. Documented in the bootstrap script.

3. **Phase 1 (Day 1 provisioning) becomes Terraform-driven.** The runbook is preserved as the "what's happening underneath" reference, but the workflow runs:
   - `hcloud_ssh_key`, `hcloud_firewall`, `hcloud_server` (with `user_data: cloud-init.yaml` doing hardening), `hcloud_server_network` if needed.
   - `cloudflare_record` × 4 (A apex, A wildcard, AAAA apex, AAAA wildcard).
   - Outputs `vm_ipv4`, `vm_ipv6` to the workflow log for the human to paste into GitHub Secrets (or use `tfstate` outputs in subsequent workflows — see "State backend" below).

4. **Cloud-init replaces the hand-typed hardening commands** in Phase 1.3 of the plan. Same effect: creates `deploy` user, installs Docker from the official repo, configures UFW + fail2ban + unattended-upgrades, sets timezone, writes the deploy SSH key.

5. **The existing `deploy.yml` sketch is rewritten** around the GHCR path (no SSH-side build).

Nothing else in the existing plan changes — Caddyfile, secrets layout, backup script, Resend swap, verification checklist all stand.

---

## Repo additions

```
+ .github/workflows/
+   ci.yml
+   build-images.yml
+   deploy.yml
+   provision.yml
+   migrate.yml
+   rollback.yml
+   backup-verify.yml
+   restore-backup.yml
+   smoke-test.yml
+ infra/terraform/
+   main.tf                 # hcloud provider, server, firewall, ssh key
+   dns.tf                  # cloudflare provider, A/AAAA records
+   cloud-init.yaml         # user_data — Phase 1.3 hardening, encoded
+   variables.tf            # vm_type, location, domain, ssh_pub_key
+   outputs.tf              # vm_ipv4, vm_ipv6
+   versions.tf             # provider pins + state backend
+ scripts/
+   bootstrap-vm.sh         # one-time post-Terraform setup (GHCR login, mkdir /srv, etc.)
~ docker-compose.prod.yml   # build: → image:
~ packages/api/package.json # add resend (already in Hetzner plan)
```

---

## Secrets and environments

### GitHub repo secrets (Settings → Secrets and variables → Actions)

| Secret | Used by | Notes |
|---|---|---|
| `HETZNER_HOST` | deploy, migrate, rollback, restore-backup | VM IPv4 from Terraform output |
| `HETZNER_SSH_KEY` | deploy, migrate, rollback, restore-backup, bootstrap | Private key paired with the public key Terraform installs |
| `HETZNER_SSH_KNOWN_HOSTS` | same | `ssh-keyscan <ip>` output; rotate when VM IP changes |
| `HCLOUD_TOKEN` | provision | Hetzner Cloud API token, project-scoped |
| `CLOUDFLARE_API_TOKEN` | provision | Same Zone:DNS:Edit token from the existing plan |
| `GHCR_VM_PAT` | bootstrap-vm.sh writes this into the VM | Read-only PAT scoped to `read:packages`, used by the VM to pull images |
| `B2_KEY_ID`, `B2_APP_KEY` | backup-verify, restore-backup | Reuses the bucket's existing app key |
| `AGE_PRIVATE_KEY` | backup-verify, restore-backup | The private half of the age keypair. **Sensitive — controls all backup decryption.** Store with extra care. |
| `TF_STATE_TOKEN` | provision | If using Terraform Cloud free; skip if using B2-as-S3 backend |

`GITHUB_TOKEN` is used for GHCR push from `build-images.yml` (no PAT needed; the workflow gets `packages: write`).

### GitHub Environments

- **`production`** — applied to `deploy.yml`, `migrate.yml`, `rollback.yml`. Optional required reviewers. Holds no secrets above repo-level; the environment exists for approval gating and concurrency.
- **`infrastructure`** — applied to `provision.yml` and `restore-backup.yml`. Required reviewers = repo admins. These are the workflows that can destroy or replace state.

### Concurrency

Every workflow that touches the VM declares `concurrency: { group: deploy-prod, cancel-in-progress: false }` so deploy / migrate / rollback / restore serialize. Two deploys cannot interleave; a rollback queued during a deploy waits for the deploy to finish (or fail) first.

---

## Workflow-by-workflow specs

The contracts below are the design intent — the implementation phase fills in the YAML.

### `ci.yml` (PR checks)

- Triggers: `pull_request`, `push` to non-`main` branches.
- Steps: checkout → `pnpm/action-setup@v4` (v11) → `actions/setup-node@v4` reading `.node-version` with `cache: pnpm` → `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm lint` → `pnpm fmt:check` → `pnpm build`.
- No deploy, no secrets. Runs in ~3–4 min.

### `build-images.yml` (reusable)

- Trigger: `workflow_call` with input `sha`.
- Permissions: `contents: read`, `packages: write`.
- Logs in to GHCR with `GITHUB_TOKEN`.
- Builds two images via `docker/build-push-action@v5`:
  - `ghcr.io/<org>/kava-now-api:<sha>` and `:latest` — `target: api`, context `.`, Dockerfile is the existing root `Dockerfile`.
  - `ghcr.io/<org>/kava-now-caddy:<sha>` and `:latest` — uses `Caddyfile.Dockerfile`.
- Uses BuildKit cache via `cache-from: type=gha` / `cache-to: type=gha,mode=max` so subsequent builds are fast.

### `deploy.yml` (push to main → prod)

- Triggers: `push: { branches: [main] }`, `workflow_dispatch` with optional `sha` input (default `github.sha`).
- Job 1: call `ci.yml` checks inline (typecheck/lint/build).
- Job 2: call `build-images.yml` with `sha`.
- Job 3 (`environment: production`, `concurrency: deploy-prod`):
  1. Set up SSH from `HETZNER_SSH_KEY` + `HETZNER_SSH_KNOWN_HOSTS`.
  2. `scp docker-compose.prod.yml Caddyfile deploy@$HOST:/srv/kava-now/` (the VM no longer needs the full repo).
  3. SSH and run:
     ```bash
     cd /srv/kava-now
     export IMAGE_TAG=<sha>
     docker compose -f docker-compose.prod.yml --env-file .env.production pull
     docker compose -f docker-compose.prod.yml --env-file .env.production up -d
     docker compose -f docker-compose.prod.yml --env-file .env.production \
       exec -T api node dist/scripts/migrate.js  # or `pnpm db:migrate` if pnpm is in the image
     docker image prune -f
     ```
  4. Call `smoke-test.yml`.

### `provision.yml` (Terraform)

- Trigger: `workflow_dispatch` with `action` input (`plan` | `apply`).
- Permissions: `id-token: write` (for OIDC into Terraform Cloud if used) or none if using B2 backend with credentials.
- Steps: checkout → `hashicorp/setup-terraform@v3` → `terraform init` → `terraform plan -out=tfplan` → on `action=apply` and approval, `terraform apply tfplan`.
- Outputs `vm_ipv4`, `vm_ipv6` to the job summary.
- **State backend choice:** Terraform Cloud free tier is the path of least resistance (5 users, unlimited private workspaces). Alternative: S3-compatible backend on the existing Backblaze B2 bucket — saves an account but adds backend config friction. Recommend Terraform Cloud.

### Cloud-init payload (`infra/terraform/cloud-init.yaml`)

What Phase 1.3 of the existing plan does manually, encoded:

```yaml
#cloud-config
users:
  - name: deploy
    groups: [sudo, docker]
    shell: /bin/bash
    sudo: ALL=(ALL) NOPASSWD:ALL
    ssh_authorized_keys:
      - ${deploy_pub_key}
package_update: true
package_upgrade: true
packages:
  - ufw
  - fail2ban
  - unattended-upgrades
  - age
  - rclone
  - ca-certificates
  - curl
  - gnupg
runcmd:
  - install -m 0755 -d /etc/apt/keyrings
  - curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  - echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
  - apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  - sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
  - sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
  - systemctl restart ssh
  - ufw default deny incoming && ufw default allow outgoing
  - ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp
  - ufw --force enable
  - systemctl enable --now fail2ban
  - timedatectl set-timezone UTC
  - mkdir -p /srv/kava-now && chown deploy:deploy /srv/kava-now
```

`scripts/bootstrap-vm.sh` runs the one-time *post*-cloud-init steps the workflow needs (GHCR login as `deploy`, age public key install, rclone B2 remote config writeup, cron entry for backup). It is idempotent and SSHed in by a separate `bootstrap.yml` (or inlined into `provision.yml` after the first apply).

### `migrate.yml` (manual migrate without deploy)

- Trigger: `workflow_dispatch`.
- `environment: production`, `concurrency: deploy-prod`.
- Steps: set up SSH → `ssh deploy@$HOST 'cd /srv/kava-now && docker compose -f docker-compose.prod.yml --env-file .env.production exec -T api node dist/scripts/migrate.js'`.
- Captures stdout to the job summary so the migration log is auditable in the Actions UI.

### `rollback.yml` (deploy a specific prior SHA)

- Trigger: `workflow_dispatch` with required `sha` input.
- Pre-check: `docker manifest inspect ghcr.io/<org>/kava-now-api:<sha>` — fail fast if the tag does not exist.
- Same deploy steps as `deploy.yml` but `IMAGE_TAG=<input sha>` and no migrations.
- Call `smoke-test.yml`.
- **Migrations are not auto-reverted.** Document in the rollback step's summary: "Schema as of `current_sha` is still applied. If the rolled-back image is schema-incompatible, restore a backup instead."

### `backup-verify.yml` (scheduled restore drill)

- Triggers: `schedule: cron: '0 4 * * 0'` (Sun 04:00 UTC), `workflow_dispatch`.
- Uses GitHub-hosted runner only — does **not** touch the VM. The point is to prove the B2 archive + age key can be turned back into a working DB without depending on prod.
- Services block: `postgres:17-alpine`.
- Steps:
  1. `pip install b2 && b2 authorize_account "$B2_KEY_ID" "$B2_APP_KEY"`
  2. Download `b2://kava-now-backups/daily/<latest>` to `/tmp/`.
  3. `echo "$AGE_PRIVATE_KEY" > /tmp/age.key && age -d -i /tmp/age.key /tmp/kava-*.sql.gz.age | gunzip > /tmp/restore.sql`
  4. `psql -h localhost -U postgres -f /tmp/restore.sql` against the service container.
  5. Sanity SELECTs: `SELECT count(*) FROM kavas`, `SELECT count(*) FROM users`, `SELECT count(*) FROM orders`. Each must be > 0. RLS policies must be present (`SELECT count(*) FROM pg_policies WHERE schemaname='public'`).
  6. On failure: open or update a GitHub Issue tagged `backup-broken` so silent regressions can't pile up.
- Total runtime: 2–5 min depending on DB size at pre-release.

### `restore-backup.yml` (DR — restore prod from a chosen archive)

- Trigger: `workflow_dispatch` with inputs:
  - `archive_name` (e.g. `kava-2026-05-15T03-00-00Z.sql.gz.age`)
  - `confirm_phrase` — must equal literal string `RESTORE PROD <archive_name>` or the job aborts at step 1.
- `environment: infrastructure`, required reviewers, `concurrency: deploy-prod`.
- Steps:
  1. Validate `confirm_phrase`.
  2. Download archive from B2 on the runner, decrypt with `AGE_PRIVATE_KEY`, gunzip → `restore.sql`.
  3. SCP `restore.sql` to `deploy@$HOST:/tmp/`.
  4. SSH and run (each `docker compose` command goes through `--env-file .env.production`, omitted below for brevity):
     ```bash
     cd /srv/kava-now
     docker compose stop api caddy
     docker compose exec -T postgres pg_dump -U kava kava | gzip > /tmp/pre-restore-$(date -u +%s).sql.gz   # last-chance dump
     docker compose exec -T postgres psql -U kava -d postgres -c "DROP DATABASE IF EXISTS kava;"
     docker compose exec -T postgres psql -U kava -d postgres -c "CREATE DATABASE kava OWNER kava;"
     docker compose exec -T postgres psql -U kava kava < /tmp/restore.sql
     docker compose up -d
     ```
  5. Call `smoke-test.yml`.
  6. Post-run: leave the `/tmp/pre-restore-*.sql.gz` on the VM for 7 days (so a botched restore can be undone), then a follow-up cron prunes it.

### `smoke-test.yml` (reusable)

- Inputs: `host` (default `kavanow.tld`).
- Steps: `curl -fS https://$host/api/healthz` with 10× retry / 3s sleep. Then `curl -fS -o /dev/null https://$host/` to confirm Caddy serves the SPA. Then a TLS check: `openssl s_client -servername $host -connect $host:443 < /dev/null 2>/dev/null | openssl x509 -noout -subject -dates` — fail if `notAfter` is within 7 days.

---

## Critical files referenced

- `plans/hetzner-deployment-plan.md:394` — `docker-compose.prod.yml` is defined here; needs the `build:` → `image:` change.
- `plans/hetzner-deployment-plan.md:825` — the existing `deploy.yml` sketch; this plan replaces it.
- [Dockerfile:55](Dockerfile:55) — existing multi-stage `target: api` already exists; reused unchanged.
- [Dockerfile:80](Dockerfile:80) — existing `caddy` target. The Hetzner plan introduces a *separate* `Caddyfile.Dockerfile` for the Cloudflare DNS plugin; that file is what `build-images.yml` pushes as `kava-now-caddy`.
- [package.json:5](package.json:5) — the `pnpm` scripts (`db:migrate`, `typecheck`, `lint`, `fmt:check`, `build`) used by `ci.yml` and `migrate.yml` are already wired and need no changes.
- [scripts/deploy.sh:1](scripts/deploy.sh:1) — keep as a local convenience for SSH-in manual deploys; the workflows do not call it.

---

## Verification

End-to-end, in order:

1. **CI**: Open a no-op PR. `ci.yml` runs all four checks green in ~4 min.
2. **Provision**: From a clean Hetzner project, run `provision.yml` with `action=plan`, then `apply`. Confirm VM exists, firewall attached, DNS records visible at Cloudflare, cloud-init completed (`ssh deploy@<ip>` works and `docker --version` returns 27.x).
3. **First deploy**: Manually run `bootstrap-vm.sh` once over SSH (or extend `provision.yml`'s post-apply step to do it). Push to `main`. Watch `deploy.yml` build images, push to GHCR, SSH-pull, smoke-test. Confirm `https://kavanow.tld/api/healthz` returns 200.
4. **Migrate alone**: Make a no-op schema change (add nullable column on a low-traffic table), push, ensure migration ran. Then revert the column with a new migration and trigger `migrate.yml` manually — confirm only the migration runs, no image pull.
5. **Rollback**: Note the current `sha`. Push a deliberately-bad change (e.g. wrong env var) and let it deploy. Trigger `rollback.yml` with the previous `sha`. Confirm prod returns to working state in <2 min.
6. **Backup verify**: Trigger `backup-verify.yml` manually. Confirm it completes green and the sanity SELECTs report sensible counts.
7. **Restore drill** (do this once before you trust it): create a throwaway tenant via superadmin, fill it with a few rows, take a manual backup, trigger `restore-backup.yml` with that archive and the correct confirm phrase. Confirm the tenant's rows persist and the smoke test passes.
8. **Failure modes**: With `restore-backup.yml`, deliberately submit the wrong `confirm_phrase` — the job must abort at step 1 before any side effect.
9. **Approval gating**: As a user without `infrastructure` environment access, attempt to run `provision.yml` or `restore-backup.yml`. Confirm the run sits in "Waiting for approval".

---

## Risks

| Risk | Mitigation |
|---|---|
| `AGE_PRIVATE_KEY` in GitHub Secrets means a compromised repo settings page = readable backups | Restrict who can read/edit repo secrets. Backups themselves still require B2 credentials to download. Consider a separate "verify-only" age key whose pubkey signs every archive, while a different "restore" key — held only by humans — does prod restores. (Costs one extra encryption step in the backup script; defer until post-launch.) |
| Terraform state divergence (someone edits the VM in the Hetzner Console) | Quarterly `terraform plan` as a reminder; treat any drift as a bug. Keep human-edited resources out of Terraform (e.g. don't put backups bucket in TF if you also manage it via the B2 UI). |
| GHCR pull failure on the VM (rotated PAT) breaks deploys | The PAT for VM pulls is `read:packages`-only and has a calendar reminder for annual rotation; the rotation is a 2-min `docker login` over SSH, documented in `scripts/bootstrap-vm.sh`. |
| `restore-backup.yml` accidentally fires against the wrong archive | Two-layer gate: `environment: infrastructure` approval + typed `confirm_phrase` matching the archive name. A "last-chance dump" before the DROP DATABASE buys 7 days to undo. |
| Backup verify silently flakes (cron miss, B2 outage) | The verify job opens/updates a GH Issue on failure; a second metric — alert if no successful run in 14 days — should be added to UptimeRobot/Better Stack as a Heartbeat check. |
| Schema-incompatible rollback corrupts state | The rollback workflow explicitly does **not** revert migrations and the job summary states this. The documented escape hatch is `restore-backup.yml` to a pre-deploy archive. |
