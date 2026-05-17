# KavaNow Deployment Superplan

**Goal:** get `https://kavanow.gr` live, with automated CI/CD, encrypted offsite backups, error reporting, and reproducible infrastructure-as-code — for ~€8/mo.

**Stack:** Hetzner CX22 (Falkenstein) · Docker Compose · Caddy · Postgres 17 · Resend · Backblaze B2 · **Cloudflare proxied DNS + edge cache** · Sentry · Terraform · GitHub Actions + GHCR.

**Decisions captured:** path-based tenancy, **Cloudflare proxy ON from day 1** (DDoS + edge caching for the SPA), full Terraform + 9 GH Actions workflows, Resend for email, domain `kavanow.gr` to be purchased, new superplan file.

---

## 0. Plan reconciliation (what's wrong in the existing plans)

The three plans in `plans/` were written before the path-based tenancy refactor. Read them as **reference** — this superplan is the executable runbook. Specific drifts to ignore:

| Existing plan claim                                                       | Reality after refactor                                                      |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Wildcard DNS `*.kavanow.gr` + DNS-01 challenge + custom Caddy build       | Single A record on `kavanow.gr`. Plain HTTP-01 with stock `caddy:2-alpine`. |
| `BASE_DOMAIN`/`APP_DOMAIN` env var                                        | `APP_ORIGIN=https://kavanow.gr` (full URL)                                  |
| `SESSION_SECRET`                                                          | `COOKIE_SECRET` + `BETTER_AUTH_SECRET`                                      |
| `kava_memberships`, `users.kavaId`/`role`/`realEmail`, `decodeAuthEmail`  | `tenant_memberships`, global `users` with `isSuperAdmin`                    |
| Magic-link auth                                                           | Email + password; invites go through password-set flow                      |
| `header_up Host {host}` to preserve subdomain                             | Not needed — `tenantMiddleware` reads slug from URL path                    |
| Caddy needs Cloudflare API token for DNS-01                               | Not needed for Caddy. Cloudflare token only used by Terraform.              |
| Backup verify SQL uses `kavas` table and `users.role`                     | Use `tenants` and `tenant_memberships`                                      |
| `pnpm db:reset` requires `postgres` superuser                             | Already fixed; works against the kava user                                  |

Repo files already drifted that **must be fixed before deploy**:

- `Caddyfile` — has apex + wildcard blocks with `dns cloudflare`. Replace with single host block.
- `.env.production.example` — uses old var names. Replace.
- `docker-compose.yml` — currently builds locally. Will switch to `image: ghcr.io/...` once CI exists.
- Sentry — `config.ts` already has the `sentry` block, but `packages/api/src/sentry.ts`, the middleware, and `app.onError` aren't wired. Finish per `plans/sentry-integration-plan.md` (Phases 1.3–1.5 + 2).

---

## 1. Manual prerequisites (the "buy stuff and create accounts" list)

Do all of these before any code or VM work. Allow ~2 hours.

### 1.1 Domain — `kavanow.gr`

- **Registrar:** [Papaki](https://www.papaki.gr) or [Pointer.gr](https://www.pointer.gr) (both Greek). Namecheap and most international registrars do **not** sell `.gr`. Gandi supports `.gr` via reseller, expect ~€20/yr.
- Register `kavanow.gr` for ≥1 year. Enable auto-renew + WHOIS privacy if offered.
- **Do not configure nameservers yet** — you'll point them to Cloudflare in step 1.3.

### 1.2 Hetzner Cloud account

- Sign up at [console.hetzner.com](https://console.hetzner.com).
- Verify email + add a payment method (SEPA or credit card).
- Create a project named `kavanow`.
- **Generate an API token:** project → Security → API Tokens → New token → Read & Write. Save in 1Password as `HCLOUD_TOKEN`. Terraform needs this.

### 1.3 Cloudflare account + DNS + proxy + edge cache

- Sign up at [cloudflare.com](https://www.cloudflare.com) (free plan).
- Add site → `kavanow.gr` → Free plan.
- Cloudflare assigns 2 nameservers (e.g. `xxx.ns.cloudflare.com`). **Go back to Papaki/Pointer and change the domain's nameservers** to those two. Propagation: 15 min – 24 h. You can continue with the rest while waiting.
- Generate an API token: My Profile → API Tokens → Create token → **Custom token** with permissions: `Zone:DNS:Edit` + `Zone:Cache Rules:Edit` + `Zone:SSL and Certificates:Edit` on zone `kavanow.gr` only. Save as `CLOUDFLARE_API_TOKEN`. Terraform needs all three permissions.
- **SSL/TLS settings → Overview:** mode = **Full (strict)**.
- **SSL/TLS → Edge Certificates:** enable **Always Use HTTPS** + **Automatic HTTPS Rewrites** + **Opportunistic Encryption**. Minimum TLS = 1.2.
- **SSL/TLS → Origin Server:** click **Create Certificate**. Defaults are fine (RSA 2048, 15-year validity, hostnames: `kavanow.gr` + `*.kavanow.gr`). Save the **certificate** as `origin.pem` and the **private key** as `origin.key` to 1Password. These get pasted onto the VM later (§5 step 6).
- DNS A/AAAA records get created by Terraform with `proxied = true` (orange cloud). Skip manual record creation for the apex — but **the Resend DNS records from §1.4 stay grey cloud (DNS only)** since Resend needs to talk to a real mail server, not Cloudflare's proxy.
- Cache Rules get created by Terraform (see §4) — they bypass cache for `/api/*` and short-TTL the SPA shell.

### 1.4 Resend (transactional email)

- Sign up at [resend.com](https://resend.com).
- Add domain `kavanow.gr` → Resend gives you 3-4 DNS records (SPF TXT, DKIM CNAME, optional DMARC TXT). Add them in **Cloudflare → DNS** (keep them DNS-only / grey cloud).
- Wait for "Verified" (usually <10 min).
- Generate API key with **Sending access** scope. Save as `RESEND_API_KEY`.
- Configure `RESEND_FROM="KavaNow <noreply@kavanow.gr>"`.

### 1.5 Backblaze B2 (offsite backups)

- Sign up at [backblaze.com/b2](https://www.backblaze.com/b2/cloud-storage.html).
- Create a **private** bucket: `kavanow-backups`.
- Generate an Application Key **scoped to that bucket only**, with read + write. Save **Key ID** and **Application Key** (the latter is shown once — copy now).
- Configure bucket Lifecycle Rules: `daily/` keep 7 days, `weekly/` 28 days, `monthly/` 365 days.

### 1.6 Sentry

- Sign up at [sentry.io](https://sentry.io) (Developer free tier covers <5k errors/mo).
- Organization slug: `kavanow`.
- Create two projects:
  - `kavanow-api` (platform: Node.js)
  - `kavanow-web` (platform: React)
- Copy both DSNs (`SENTRY_DSN_API`, `SENTRY_DSN_WEB`).
- Generate an org-scoped Auth Token with `project:releases` + `project:write` for later sourcemap upload (`SENTRY_AUTH_TOKEN`).

### 1.7 Google OAuth (optional — "Continue with Google" button)

The repo already supports Google OAuth via better-auth — the web SPA renders the button only when `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` are set. Skip this section if you want password-only login at launch; come back to it later (just add the env vars and redeploy).

- Go to [Google Cloud Console](https://console.cloud.google.com) → create project `kavanow-prod` (or reuse an existing project).
- **OAuth consent screen** (APIs & Services → OAuth consent screen):
  - User Type: **External** (for B2B SaaS where customers have their own Google accounts). Internal only works if all users are in your Google Workspace org.
  - App name: `KavaNow`
  - User support email: `ops@kavanow.gr`
  - App logo: optional but recommended (square PNG, ≥128 px)
  - **Authorized domains:** `kavanow.gr`
  - Developer contact: `ops@kavanow.gr`
  - **Scopes:** add `.../auth/userinfo.email` + `.../auth/userinfo.profile` + `openid` (the three defaults for sign-in). No sensitive scopes → no verification required.
  - **Publishing status:** start in **Testing** mode (Google shows a "this app isn't verified" interstitial but works for up to 100 test users). Click **Publish App** once you're ready for general availability — for the basic scopes above no Google review is needed.
- **Credentials** → Create Credentials → **OAuth client ID**:
  - Application type: **Web application**
  - Name: `KavaNow Production`
  - **Authorized JavaScript origins:** `https://kavanow.gr`
  - **Authorized redirect URIs:** `https://kavanow.gr/api/auth/callback/google` (this is the exact path better-auth registers — must match character-for-character)
- Save **Client ID** and **Client Secret** to 1Password as `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`. These go into `.env.production` on the VM and into GitHub Secrets so the deploy workflow can pipe them through.
- **Optional second client for local dev:** repeat with redirect URI `http://localhost:3200/api/auth/callback/google` so devs can test the flow without sharing the prod credential.

### 1.8 Better Stack (uptime monitoring)

- Sign up at [betterstack.com/uptime](https://betterstack.com/uptime) (free tier: 10 monitors, 3-min interval).
- Create one HTTP(S) monitor: `https://kavanow.gr/api/healthz`, expect 200, alert via email.
- Add a Heartbeat monitor named `backup-verify` (URL ping every 7 days). The weekly backup-verify workflow will POST to it on success; if it stops pinging, you get alerted.

### 1.9 GitHub repo prep

- Push the current repo to GitHub if not already (`gh repo create kavanow --private --source=. --push`).
- Create two **GitHub Environments** at repo Settings → Environments:
  - `production` — required reviewer: you. No deployment branch restrictions (deploy is gated by `main` branch implicitly).
  - `infrastructure` — required reviewer: you. Used for `provision.yml` and `restore-backup.yml`.

### 1.10 Local crypto material (one-time, on your laptop)

```bash
# SSH key for VM access (separate from your personal key — easier to rotate)
ssh-keygen -t ed25519 -f ~/.ssh/kavanow_deploy -C "kavanow-deploy" -N ""

# Age key for backup encryption — PRIVATE half goes nowhere near git
mkdir -p ~/.config/age && age-keygen -o ~/.config/age/kavanow-backup.key
# The file contains both keys. Public key is the line starting `age1...` (also printed to stderr).
```

Save both to 1Password. Add a printed paper copy of the age private key to a safe place — if you lose it, your backups become unreadable.

### 1.11 Pre-generate production secrets (on your laptop, never on the VM)

```bash
openssl rand -base64 32   # → POSTGRES_PASSWORD
openssl rand -hex 32      # → COOKIE_SECRET
openssl rand -hex 32      # → BETTER_AUTH_SECRET
```

Save in 1Password. Will go into the VM's `.env.production` later.

### 1.12 Inventory checklist before moving on

You should now have:

- [ ] `kavanow.gr` registered, NS pointed to Cloudflare, zone active
- [ ] Cloudflare API token (Zone:DNS + Cache Rules + SSL on `kavanow.gr`)
- [ ] Cloudflare SSL mode = Full (strict), Always Use HTTPS on
- [ ] Cloudflare **Origin CA cert** (`origin.pem` + `origin.key`) saved in 1Password
- [ ] Hetzner API token (Read & Write on `kavanow` project)
- [ ] Resend domain verified + API key
- [ ] Backblaze B2 bucket `kavanow-backups` + Key ID + App Key
- [ ] Sentry org + 2 projects + 2 DSNs + auth token
- [ ] Google OAuth client (`GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`) — or skip if launching password-only
- [ ] Better Stack monitor + heartbeat URL
- [ ] GitHub repo with `production` + `infrastructure` environments
- [ ] `~/.ssh/kavanow_deploy{,.pub}` and `~/.config/age/kavanow-backup.key`
- [ ] Three pre-generated production secrets in 1Password

---

## 2. Code changes (do these locally on `main` before any VM work)

### 2.1 Fix `Caddyfile` for path-based tenancy + Cloudflare proxy

Replace the entire file with:

```caddy
{
    email ops@kavanow.gr
    servers {
        # Cloudflare IPv4 + IPv6 ranges (refresh annually from https://cloudflare.com/ips/).
        # Required so Caddy treats CF as a trusted reverse proxy and reads the real client IP.
        trusted_proxies static \
            173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 \
            141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20 \
            197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 \
            104.24.0.0/14 172.64.0.0/13 131.0.72.0/22 \
            2400:cb00::/32 2606:4700::/32 2803:f800::/32 2405:b500::/32 \
            2405:8100::/32 2a06:98c0::/29 2c0f:f248::/32
        client_ip_headers CF-Connecting-IP
    }
}

kavanow.gr {
    # Cloudflare Origin CA cert — 15-year validity, valid only for CF↔origin.
    # Files mounted into the Caddy container at /etc/caddy/origin.{pem,key}.
    tls /etc/caddy/origin.pem /etc/caddy/origin.key

    # API: never cached, real client IP forwarded for rate-limiting + Sentry tags.
    handle /api/* {
        reverse_proxy api:3000 {
            header_up X-Real-IP {client_ip}
            header_up X-Forwarded-For {client_ip}
            header_up X-Forwarded-Proto {scheme}
            health_uri /api/healthz
            health_interval 30s
        }
    }

    # SPA shell: short cache so new deploys reach users within ~1 minute.
    @html path / /index.html
    header @html Cache-Control "no-cache, must-revalidate"

    # Hashed Vite assets: cache forever — filename changes on every build.
    header /assets/* Cache-Control "public, max-age=31536000, immutable"

    handle {
        root * /srv/web
        try_files {path} /index.html
        file_server
    }

    encode gzip zstd

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        Referrer-Policy "strict-origin-when-cross-origin"
        Permissions-Policy "geolocation=(), microphone=(), camera=()"
        -Server
    }

    log {
        output stdout
        format json
        level INFO
    }
}
```

No Caddy plugins needed (stock `caddy:2-alpine`). No ACME on the origin — the Cloudflare Origin CA cert handles CF↔origin. Cloudflare handles visitor↔CF via Universal SSL.

### 2.1.1 Mount the Origin CA cert into Caddy

Update `docker-compose.yml`'s `caddy` service to mount the cert files (which sit on the VM at `/etc/kavanow/tls/origin.{pem,key}` — created by `scripts/bootstrap-vm.sh`):

```yaml
caddy:
  image: ghcr.io/<your-gh-username>/kavanow-caddy:${IMAGE_TAG:-latest}
  volumes:
    - caddy-data:/data
    - caddy-config:/config
    - /etc/kavanow/tls/origin.pem:/etc/caddy/origin.pem:ro
    - /etc/kavanow/tls/origin.key:/etc/caddy/origin.key:ro
  # ... rest unchanged
```

### 2.1.2 Use real client IP in the API

`packages/api/src/middleware/rate-limit.ts` (or wherever the rate limiter keys on IP) currently reads `c.req.header("x-forwarded-for")` — make sure it falls back through `X-Real-IP` first, since Caddy sets that to the CF-Connecting-IP value. One-line tweak.

Same idea in the Sentry context middleware if you want IPs on events — though `sendDefaultPii: false` already suppresses IP from Sentry by default, so this is optional.

### 2.2 Fix `.env.production.example`

Replace with:

```bash
# PostgreSQL
POSTGRES_USER=kavanow
POSTGRES_PASSWORD=                    # openssl rand -base64 32
POSTGRES_DB=kavanow
DATABASE_URL=postgres://kavanow:REPLACE@postgres:5432/kavanow

# App
NODE_ENV=production
API_PORT=3000
APP_ORIGIN=https://kavanow.gr

# better-auth
COOKIE_SECRET=                        # openssl rand -hex 32
BETTER_AUTH_SECRET=                   # openssl rand -hex 32

# Email (Resend)
RESEND_API_KEY=                       # re_... from Resend dashboard
RESEND_FROM=KavaNow <noreply@kavanow.gr>

# Superadmin (consumed only by `pnpm db:seed` on first boot)
SUPERADMIN_EMAIL=ops@kavanow.gr
SUPERADMIN_PASSWORD=                  # openssl rand -base64 24
SEED_DEMO=false

# Sentry
SENTRY_DSN_API=
SENTRY_DSN_WEB=
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=

# Google OAuth (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Image tag — set by deploy workflow
IMAGE_TAG=latest
```

### 2.3 Update `docker-compose.yml` to pull from GHCR

Switch the `api` and `caddy` services from `build:` to `image:`. Keep `build:` configs in a sibling `docker-compose.build.yml` so you can still build locally if needed.

```yaml
services:
  postgres:
    image: postgres:17-alpine
    # ... existing config, no change

  api:
    image: ghcr.io/<your-gh-username>/kavanow-api:${IMAGE_TAG:-latest}
    # ... existing env/network config

  caddy:
    image: ghcr.io/<your-gh-username>/kavanow-caddy:${IMAGE_TAG:-latest}
    # ... existing port/volume config
```

Bump Postgres to `17-alpine` (existing compose uses 16 — pick 17 now since this is greenfield prod, or stay on 16 and plan an upgrade later — your call, but 17 is what the existing Hetzner plan assumes).

### 2.4 Finish Sentry wiring (per `plans/sentry-integration-plan.md`)

`config.ts` already has the `sentry` block. Still missing:

- Create `packages/api/src/sentry.ts` (init + ignore list)
- Make it the first import in `packages/api/src/index.ts`
- Create `packages/api/src/middleware/sentry-context.ts` and mount after `tenantMiddleware`/`authMiddleware`. Adjust tag names: use `tenant.slug` / `tenant.id` (not `kava.*`), and read `c.get("tenant")` and `c.get("membership")`.
- Add `app.onError` handler in `packages/api/src/app.ts`
- Wire `Sentry.init` + `<Sentry.ErrorBoundary>` in `packages/web/src/main.tsx`
- Pass `VITE_SENTRY_*` via `define` in `packages/web/vite.config.ts`
- Set tenant scope from URL path on web boot

### 2.5 Add `infra/postgres/postgresql.conf`

Tuned for the CX22's 4 GB RAM — values from `plans/hetzner-deployment-plan.md` §3.4.

### 2.6 `.gitignore`

Append `.env.production` and `infra/secrets/`. The .example stays in git.

### 2.7 Commit + push to main

Tag the commit `pre-deploy-baseline` so you can git-revert if anything goes sideways during cutover.

---

## 3. Terraform setup (`infra/terraform/`)

### 3.1 State backend

Use **Terraform Cloud** free tier (5 users, unlimited private workspaces, free state hosting). Alternative is B2-as-S3 backend; not worth the friction.

- Sign up at [app.terraform.io](https://app.terraform.io).
- Create org `kavanow`, workspace `kavanow-prod`, execution mode **Local** (workflow runs `terraform apply` from GH runner; TFC just stores state).
- Generate API token for CI (`TF_STATE_TOKEN`).

### 3.2 Files to add

```
infra/terraform/
  versions.tf       # hcloud + cloudflare provider pins + terraform cloud backend
  variables.tf      # vm_type=cx22, location=fsn1, domain=kavanow.gr, ssh_pub_key
  main.tf           # hcloud_ssh_key, hcloud_firewall, hcloud_server (cloud-init)
  dns.tf            # cloudflare_record × 2 (A + AAAA apex, both proxied=true)
  cache.tf          # cloudflare_ruleset × 2 (cache bypass /api/*, short-TTL SPA shell)
                    # cloudflare_zone_settings_override (SSL mode = full strict, always HTTPS, min TLS 1.2)
  cloud-init.yaml   # OS hardening + Docker + deploy user (per §1.3 of Hetzner plan)
  outputs.tf        # vm_ipv4, vm_ipv6
```

`dns.tf` snippet:

```hcl
resource "cloudflare_record" "apex_a" {
  zone_id = var.cloudflare_zone_id
  name    = "@"
  type    = "A"
  value   = hcloud_server.kavanow.ipv4_address
  proxied = true
  ttl     = 1   # required when proxied
}

resource "cloudflare_record" "apex_aaaa" {
  zone_id = var.cloudflare_zone_id
  name    = "@"
  type    = "AAAA"
  value   = hcloud_server.kavanow.ipv6_address
  proxied = true
  ttl     = 1
}
```

`cache.tf` snippet (Cloudflare's new Cache Rules engine, free plan supports it):

```hcl
resource "cloudflare_ruleset" "cache_rules" {
  zone_id = var.cloudflare_zone_id
  name    = "kavanow-cache"
  kind    = "zone"
  phase   = "http_request_cache_settings"

  rules {
    description = "Bypass cache for /api/*"
    expression  = "(starts_with(http.request.uri.path, \"/api/\"))"
    action      = "set_cache_settings"
    action_parameters {
      cache = false
    }
  }

  rules {
    description = "Short edge TTL for SPA shell"
    expression  = "(http.request.uri.path eq \"/\" or http.request.uri.path eq \"/index.html\")"
    action      = "set_cache_settings"
    action_parameters {
      cache = true
      edge_ttl { mode = "override_origin"; default = 60 }       # 60s
      browser_ttl { mode = "override_origin"; default = 0 }     # respect our no-cache header
    }
  }
}

resource "cloudflare_zone_settings_override" "kavanow" {
  zone_id = var.cloudflare_zone_id
  settings {
    ssl                      = "strict"      # Full (strict)
    always_use_https         = "on"
    automatic_https_rewrites = "on"
    min_tls_version          = "1.2"
    opportunistic_encryption = "on"
    brotli                   = "on"
    http3                    = "on"
    early_hints              = "on"
    # Browser cache TTL for /assets/* is governed by our Cache-Control header.
  }
}
```

The Origin CA cert is **not** in Terraform — it's a one-time hand-generated cert that lives in 1Password. Pasting it into Terraform's state would unnecessarily expose the private key to TFC. The cert gets onto the VM via `scripts/bootstrap-vm.sh` (manual paste step in §5).

Inside `cloud-init.yaml`:

- Create `deploy` user with the public key from `~/.ssh/kavanow_deploy.pub`
- Install: `docker-ce`, `docker-compose-plugin`, `ufw`, `fail2ban`, `unattended-upgrades`, `age`, `rclone`
- UFW: allow 22, 80, 443; default deny inbound
- Disable root SSH + password auth
- `timedatectl set-timezone UTC`
- `mkdir /srv/kavanow && chown deploy:deploy /srv/kavanow`
- Configure `unattended-upgrades` with auto-reboot at 03:30 UTC

### 3.3 `outputs.tf` exports `vm_ipv4` so the workflow can write it to GitHub Secrets via `gh secret set HETZNER_HOST`.

---

## 4. GitHub Actions workflows (`.github/workflows/`)

All 9 workflows from `plans/github-actions-automation-plan.md`. Brief summary of each — see that plan for full specs.

| Workflow             | Trigger                            | Purpose                                          | Env gate         |
| -------------------- | ---------------------------------- | ------------------------------------------------ | ---------------- |
| `ci.yml`             | PR + non-main push                 | typecheck, lint, fmt:check, build                | none             |
| `build-images.yml`   | `workflow_call`                    | Build + push `kavanow-api` + `kavanow-caddy` to GHCR with `<sha>` + `latest` tags. Sourcemap upload to Sentry inline. | none |
| `provision.yml`      | manual                             | `terraform plan` / `apply`                       | `infrastructure` |
| `deploy.yml`         | push to `main` + manual            | calls build-images, scp compose+Caddyfile, ssh pull+up+migrate, smoke test | `production` |
| `migrate.yml`        | manual                             | runs `pnpm db:migrate` on VM without rebuild     | `production`     |
| `rollback.yml`       | manual (input: sha)                | deploys a prior tag; no migrations               | `production`     |
| `backup-verify.yml`  | weekly Sun 04:00 UTC + manual      | pull latest B2 archive → decrypt → restore into a runner-side Postgres → sanity SELECTs against `tenants`, `users`, `tenant_memberships`. Pings Better Stack heartbeat on success. Opens GH issue on fail. | none |
| `restore-backup.yml` | manual (inputs: archive, phrase)   | DR: decrypt chosen archive → scp to VM → drop+recreate `kavanow` db → restore. Two-layer gate (env approval + typed-phrase). | `infrastructure` |
| `smoke-test.yml`     | `workflow_call`                    | curl `/api/healthz`, `/`, TLS expiry check       | none             |

Repo secrets to populate (Settings → Secrets and variables → Actions):

```
HCLOUD_TOKEN                  # provision
CLOUDFLARE_API_TOKEN          # provision
TF_STATE_TOKEN                # provision
HETZNER_HOST                  # set by provision.yml or paste from TF output
HETZNER_SSH_KEY               # contents of ~/.ssh/kavanow_deploy (private)
HETZNER_SSH_KNOWN_HOSTS       # ssh-keyscan <ip> output
GHCR_VM_PAT                   # PAT with read:packages, written to VM by bootstrap-vm.sh
B2_KEY_ID + B2_APP_KEY        # backup-verify, restore-backup
AGE_PRIVATE_KEY               # backup-verify, restore-backup (whole file contents)
RESEND_API_KEY                # passed into VM .env.production
SENTRY_AUTH_TOKEN             # build-images.yml (sourcemap upload)
SENTRY_DSN_API + SENTRY_DSN_WEB
SUPERADMIN_EMAIL + SUPERADMIN_PASSWORD  # piped into seed
POSTGRES_PASSWORD + COOKIE_SECRET + BETTER_AUTH_SECRET
GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET  # optional; only if §1.7 was done
BETTERSTACK_HEARTBEAT_URL     # backup-verify ping
```

Repo variables (`vars`):

```
SENTRY_ORG=kavanow
SENTRY_PROJECT_API=kavanow-api
SENTRY_PROJECT_WEB=kavanow-web
```

---

## 5. Execution order (the "do this on this day" plan)

### Day 1 — Manual signups + code fixes (~3-4 h)

1. Section 1.1–1.10: register domain, create all accounts, generate keys/secrets.
2. Section 2: do all local code fixes on a feature branch. PR → review → merge to main. CI doesn't exist yet, run `pnpm check` locally before merging.

### Day 2 — Infrastructure as code (~3-4 h)

3. Write all Terraform files. Run `terraform plan` locally first (export `HCLOUD_TOKEN` + `CLOUDFLARE_API_TOKEN`).
4. Write `ci.yml`, `build-images.yml`, `provision.yml`, `smoke-test.yml`. Push to a branch, watch `ci.yml` pass.
5. Manually run `provision.yml` with `action=plan`, review, then `action=apply`. VM exists, DNS records point to it.
6. SSH into the VM (`ssh -i ~/.ssh/kavanow_deploy deploy@<ip>`). Run `scripts/bootstrap-vm.sh`:
   - `docker login ghcr.io` with the `GHCR_VM_PAT`
   - Write `/etc/kavanow/backup.pub` with the age public key
   - **Write `/etc/kavanow/tls/origin.pem` + `origin.key`** by pasting from 1Password (`sudo nano`, `chmod 600 origin.key`, `chmod 644 origin.pem`, `chown root:root`)
   - Configure `rclone` for B2 (`rclone config` non-interactively from a generated `rclone.conf`)
   - Install `/usr/local/bin/kavanow-backup.sh` + `/etc/cron.d/kavanow-backup` (daily 03:00 UTC)
   - Create `/srv/kavanow/.env.production` from secrets (manual paste — never echo secrets into a script)

### Day 3 — First deploy + verify (~2-3 h)

7. Write `deploy.yml`, `migrate.yml`, `rollback.yml`. Push to main → `deploy.yml` fires.
8. Watch images build, get pushed to GHCR, VM pulls, smoke test passes.
9. Run `migrate.yml` manually (first deploy will already have run migrations — this is just to verify the workflow works).
10. Run the verification checklist from `plans/hetzner-deployment-plan.md` §8 — adapted for path-based + Cloudflare proxy:
    - `curl -sI https://kavanow.gr/api/healthz` → 200
    - `curl -sI https://kavanow.gr/api/healthz | grep -i cf-cache-status` → `BYPASS` or `DYNAMIC` (proves the cache-bypass rule is active)
    - `curl -sI https://kavanow.gr/assets/<some-hashed-js>` → 200, `cf-cache-status: HIT` (after second request), `cache-control: public, max-age=31536000, immutable`
    - `curl -sI https://kavanow.gr/` → 200, `cf-cache-status: HIT` or `MISS` (cached at edge), `cache-control: no-cache, must-revalidate` from origin
    - `curl -sI https://kavanow.gr/ | grep -i server` → `cloudflare` (proves proxy is ON)
    - Open `https://kavanow.gr/login`, log in as superadmin, create tenant "demo", invite a user with role "owner"
    - Check Resend dashboard for delivered email
    - Click invite link → lands on `/k/demo/welcome` → set password → log in → see admin dashboard
    - **Rate-limit + real IP check:** hammer `/api/auth/sign-in` 20× from your laptop → expect 429s. Check API logs to confirm the logged IP is your real public IP, not a Cloudflare range.
    - From a second browser, log in as a different superadmin or invite — confirm tenant isolation
    - RLS test in psql (see existing plan §7.4 — but `set_config('app.current_tenant_id', ...)`)
    - From local machine: `nc -zv <vm_ip> 5432` → refused
    - `ssh root@<vm_ip>` → refused
    - `curl -I https://kavanow.gr | grep -i strict-transport-security` → present
    - **Origin reachability sanity:** `curl -sI --resolve kavanow.gr:443:<vm_ipv4> https://kavanow.gr/` should still work (proves Caddy serves the Origin CA cert correctly). Without the `--resolve`, Cloudflare answers.

### Day 4 — Backups + DR drill (~2-3 h)

11. Write `backup-verify.yml`, `restore-backup.yml`.
12. Trigger backup-verify manually — confirm it pulls + decrypts + restores + counts pass.
13. **Restore drill (mandatory):** create a throwaway tenant, populate a few orders, take a manual backup via SSH (`sudo /usr/local/bin/kavanow-backup.sh`), then trigger `restore-backup.yml` with the new archive name and the correct typed phrase. Confirm rows persist and smoke test passes.
14. Test failure mode: trigger `restore-backup.yml` with wrong phrase → must abort at step 1.
15. Confirm Better Stack monitor is green; trigger heartbeat manually to verify alerting works.

### Day 5 — Polish (~1-2 h)

16. Add a calendar reminder: quarterly `restore-backup.yml` drill against the prod archive into a staging postgres (or just trust `backup-verify.yml`).
17. Add an annual reminder for `GHCR_VM_PAT` rotation.
18. Document the runbook in `docs/operations.md` (copy from `plans/hetzner-deployment-plan.md` §"Operational runbook" — strip the magic-link references).
19. Delete the three superseded files from `plans/` once you're confident the superplan + appendices in `docs/` cover everything, or move them to `plans/archive/`.

---

## 6. Cost (steady state)

| Item                         | Monthly         | Notes                                           |
| ---------------------------- | --------------- | ----------------------------------------------- |
| Hetzner CX22                 | 4.49 €          | 2 vCPU, 4 GB RAM, 40 GB NVMe                    |
| Hetzner snapshot backups     | 0.90 €          | +20% of VM, nightly, 7-day retention            |
| Domain `kavanow.gr`          | ~1.50 €         | Amortized; ~18 €/yr at Papaki                   |
| Backblaze B2                 | ~0.50 €         | $0.006/GB-mo                                    |
| Resend, Cloudflare, Sentry, Better Stack, GHCR, Terraform Cloud | 0 € | All free tier |
| **Total**                    | **~7.40 €/mo**  | Including offsite backups + monitoring          |

Scale-up triggers and costs: see `plans/hetzner-deployment-plan.md` cost section — those numbers are unchanged.

---

## 7. Risks worth re-stating

These are the ones that come from the GH-Actions-driven flow specifically:

| Risk                                                       | Mitigation                                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `AGE_PRIVATE_KEY` in GH Secrets = repo admin can read all backups | Lock repo admin role; consider a separate restore-only age key held only by you (post-launch upgrade).  |
| Terraform state drift if you edit the VM in Hetzner Console | Quarterly `terraform plan` reminder; treat drift as a bug; keep B2 bucket + Cloudflare records that humans manage outside TF. |
| `restore-backup.yml` fired against wrong archive            | `infrastructure` env approval + typed `RESTORE PROD <archive_name>` phrase + last-chance dump on VM before drop. |
| Schema-incompatible rollback                                | `rollback.yml` does **not** revert migrations and surfaces this in the job summary. Escape hatch: `restore-backup.yml` to a pre-deploy archive. |
| Backup-verify silently flakes (cron miss, B2 outage)        | Better Stack heartbeat fires if no successful ping in 14 days.                                          |
| `.gr` domain renewal lapses                                 | Auto-renew at Papaki + calendar reminder 60 days before expiry.                                         |
| GHCR PAT for VM-pulls expires                               | Calendar reminder annually; rotation = 2-min `docker login` over SSH.                                   |
| Cloudflare IP ranges change → Caddy stops trusting CF       | CF announces ~yearly. Annual reminder to refresh the `trusted_proxies static` list in the Caddyfile.    |
| Direct origin IP discovery bypasses CF (DDoS skips proxy)   | UFW + Hetzner firewall already restrict to 22/80/443. Optional hardening: restrict 80/443 to CF IP ranges only (lose direct origin access for `--resolve` debugging). Defer until traffic justifies. |
| CF cache serves stale `/index.html` after deploy            | Edge TTL capped at 60 s + origin sets `no-cache`. Worst case: 1-min lag for new SPA to reach users. Manual override: `Caching → Configuration → Purge Everything` after critical deploys. |

---

## 8. Out of scope (deferred)

- Zero-downtime deploys (Kamal / blue-green). Current 5–10 s container restart is acceptable pre-launch.
- Lock origin port 80/443 to Cloudflare IP ranges only. Day-1 setup keeps direct origin access open for `curl --resolve` debugging; tighten once traffic patterns are known.
- Cloudflare WAF custom rules (free plan supports 5). Reasonable post-launch hardening once you see real attack traffic.
- Cloudflare Authenticated Origin Pulls (mTLS between CF and origin). Stronger than Full (strict); defer until there's a concrete reason.
- Postgres read replica or move-off-VM (Neon / dedicated Hetzner Postgres). Trigger: sustained >50% CPU or >99.5% SLA.
- Sentry performance tracing + session replay. Errors-only for now.
- Log aggregation (Loki, Better Stack logs). `docker compose logs` is enough until >1 VM.
- Multi-region failover. Add when DAU justifies a warm standby.

---

## 9. References

Detailed appendices, useful but not the executable runbook:

- `plans/hetzner-deployment-plan.md` — full Hetzner runbook (read with the drift table in §0 in mind).
- `plans/github-actions-automation-plan.md` — full workflow specs.
- `plans/sentry-integration-plan.md` — full Sentry wiring (Phase 1.3 onward still needs to be applied).
