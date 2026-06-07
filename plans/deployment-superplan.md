# KavaNow Deployment Superplan

**Goal:** get `https://kavanow.gr` live, with automated CI/CD, Hetzner-managed snapshot backups, error reporting, and reproducible infrastructure-as-code — for ~€7/mo.

**Stack:** Hetzner CX22 (Falkenstein) · Docker Compose · Caddy · Postgres 17 · Resend · **Cloudflare proxied DNS + edge cache** · Sentry · Terraform · GitHub Actions + GHCR.

**Decisions captured:** path-based tenancy, **Cloudflare proxy ON from day 1** (DDoS + edge caching for the SPA), full Terraform + 7 GH Actions workflows, Resend for email, Hetzner snapshots only for day-1 backups, domain `kavanow.gr` to be purchased, new superplan file.

---

## 0. Plan reconciliation (what's wrong in the older drafts)

The older deployment drafts were written before the path-based tenancy refactor. This superplan is the executable runbook. Specific drifts to ignore:

| Existing plan claim                                                      | Reality after refactor                                                      |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Wildcard DNS `*.kavanow.gr` + DNS-01 challenge + custom Caddy build      | Single A record on `kavanow.gr`. Plain HTTP-01 with stock `caddy:2-alpine`. |
| `BASE_DOMAIN`/`APP_DOMAIN` env var                                       | `APP_ORIGIN=https://kavanow.gr` (full URL)                                  |
| `SESSION_SECRET` / `COOKIE_SECRET`                                       | `BETTER_AUTH_SECRET` only (better-auth signs cookies with it)               |
| `kava_memberships`, `users.kavaId`/`role`/`realEmail`, `decodeAuthEmail` | `tenant_memberships`, global `users` with `isSuperAdmin`                    |
| Magic-link auth                                                          | Email + password; invites go through password-set flow                      |
| `header_up Host {host}` to preserve subdomain                            | Not needed — `tenantMiddleware` reads slug from URL path                    |
| Caddy needs Cloudflare API token for DNS-01                              | Not needed for Caddy. Cloudflare token only used by Terraform.              |
| Backup verify SQL uses `kavas` table and `users.role`                    | Use `tenants` and `tenant_memberships`                                      |
| `pnpm db:reset` requires `postgres` superuser                            | Already fixed; works against the kava user                                  |

Repo changes that **must exist before deploy**:

- `Caddyfile` — single apex host, Cloudflare Origin CA cert, `/api/health` active probe, no wildcard/DNS-01 block.
- `.env.production.example` — current `APP_ORIGIN`, `BETTER_AUTH_SECRET`, Resend, Sentry, Google, seed vars.
- `docker-compose.yml` — pulls GHCR images, uses `.env.production`, mounts the Origin CA cert, and includes an `api-jobs` profile for migrations/seeds.
- `Dockerfile` — builds with pnpm 11, forwards build-time env to API/web builds, and exposes an `api-jobs` target for `pnpm db:*`.
- Sentry — API/web error capture is wired; verify web tenant tagging and sourcemap upload during the deploy workflow work as expected.

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

### 1.5 Hetzner snapshot backups

- Enable Hetzner server backups when Terraform provisions the VM (`backups = true`).
- Hetzner keeps the 7 most recent nightly whole-VM snapshots.
- Treat snapshots as the day-1 recovery path. They cover the OS, Docker volumes, Postgres data, Caddy config, TLS files, and `.env.production`.
- Before risky work, take an on-demand manual snapshot from the Hetzner Console and delete it after the change is proven stable.

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
- Create one HTTP(S) monitor: `https://kavanow.gr/api/health`, expect 200, alert via email.
- No heartbeat monitor is needed while backups are Hetzner-managed snapshots only. Use a calendar reminder for the quarterly restore drill.

### 1.9 GitHub repo prep

- Push the current repo to GitHub if not already (`gh repo create kavanow --private --source=. --push`).
- Create two **GitHub Environments** at repo Settings → Environments:
  - `production` — required reviewer: you. No deployment branch restrictions (deploy is gated by `main` branch implicitly).
  - `infrastructure` — required reviewer: you. Used for `provision.yml`.

### 1.10 Local crypto material (one-time, on your laptop)

Create an **ed25519 SSH key in 1Password** (New Item → SSH Key → Generate) named `kavanow-deploy`. The private key never touches disk — the 1Password SSH agent serves it.

- Enable the agent: 1Password → Settings → Developer → "Use the SSH agent".
- `~/.ssh/config` already routes all hosts through the agent:

  ```ssh-config
  Host *
      IdentityAgent "~/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock"
  ```

- VM access is plain `ssh deploy@<vm_ip>` — no `-i` flag, no key file. 1Password prompts with Touch ID.
- The key has three consumers:
  1. **Laptop SSH** — via the agent (above).
  2. **Terraform `ssh_pub_key`** — public key only: `op read "op://Private/kavanow-deploy/public key"`.
  3. **GitHub Secret `HETZNER_SSH_KEY`** — the one place that needs the raw private key (Actions runners can't reach your agent). Export without touching disk or shell history:

     ```bash
     op read "op://Private/kavanow-deploy/private key?ssh-format=openssh" \
       | gh secret set HETZNER_SSH_KEY
     ```

     `?ssh-format=openssh` matters — without it `op` returns PKCS#8, and CI ssh-agent setups expect OpenSSH format.
- If 1Password holds more than ~5 keys, `Host *` offers all of them and servers may reject with `Too many authentication failures`. Fix by pinning: save the public key to `~/.ssh/kavanow_deploy.pub` and add a host block with `IdentityFile ~/.ssh/kavanow_deploy.pub` + `IdentitiesOnly yes`.

### 1.11 Pre-generate production secrets (on your laptop, never on the VM)

```bash
openssl rand -base64 32   # → POSTGRES_PASSWORD
openssl rand -base64 32   # → APP_DB_PASSWORD  (NOSUPERUSER app role; required for RLS)
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
- [ ] Sentry org + 2 projects + 2 DSNs + auth token
- [ ] Google OAuth client (`GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`) — or skip if launching password-only
- [ ] Better Stack monitor
- [ ] GitHub repo with `production` + `infrastructure` environments
- [ ] `kavanow-deploy` SSH key in 1Password + SSH agent enabled
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
            health_uri /api/health
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
# Generate with: openssl rand -base64 32
POSTGRES_PASSWORD=
POSTGRES_DB=kavanow
# Privileged connection — migrations/seeds only.
DATABASE_URL=postgres://kavanow:REPLACE@postgres:5432/kavanow
# Password for the NOSUPERUSER kavanow_app role the running server connects as.
# REQUIRED — without it RLS is not enforced. db:migrate provisions the role.
# Generate with: openssl rand -base64 32
APP_DB_PASSWORD=

# App
NODE_ENV=production
API_PORT=3000
APP_ORIGIN=https://kavanow.gr

# better-auth
# Generate with: openssl rand -hex 32
BETTER_AUTH_SECRET=

# Email (Resend)
RESEND_API_KEY=
RESEND_FROM="KavaNow <noreply@kavanow.gr>"

# Superadmin (consumed only by `pnpm db:seed` on first boot)
SUPERADMIN_EMAIL=ops@kavanow.gr
# Generate with: openssl rand -base64 24
SUPERADMIN_PASSWORD=
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

### 2.3 Update Docker images + operational jobs

Switch the runtime services from `build:` to GHCR `image:` references. Keep local build configs in `docker-compose.build.yml` so you can still build the production-shaped images from your laptop when needed.

```yaml
services:
  postgres:
    image: postgres:18-alpine
    # ... existing config, no change
    # NB: postgres:18+ stores data in a major-version subdir under
    # /var/lib/postgresql — mount the volume there, not at .../data

  api:
    image: ghcr.io/pbechliv/kava-now-api:${IMAGE_TAG:-latest}
    # ... existing env/network config

  api-jobs:
    image: ghcr.io/pbechliv/kava-now-api-jobs:${IMAGE_TAG:-latest}
    profiles: ["jobs"]
    # runs pnpm db:migrate / pnpm db:seed against the same Postgres service

  caddy:
    image: ghcr.io/pbechliv/kava-now-caddy:${IMAGE_TAG:-latest}
    # ... existing port/volume config
```

Bump Postgres to `18-alpine` now since this is greenfield production; starting on an older major only makes sense if you want a separate major-version upgrade plan before launch.

Add an `api-jobs` Docker target in `Dockerfile` instead of trying to run `pnpm db:*` inside the slim API runtime image. The API runtime image has compiled server output and production dependencies; migrations/seeds run the current TS scripts through `tsx`, so they need source + full workspace dependencies:

```dockerfile
FROM deps AS api-jobs
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/api/ packages/api/
CMD ["pnpm", "--filter", "@kava-now/api", "db:migrate"]
```

Also forward build-time env into the image builds:

- `api-build`: `ARG API_PORT=3000` + `ENV API_PORT=$API_PORT` before `pnpm --filter @kava-now/api build`.
- `web-build`: `ARG GOOGLE_CLIENT_ID`, `ARG SENTRY_DSN_WEB`, `ARG SENTRY_ENVIRONMENT`, `ARG SENTRY_RELEASE`, then matching `ENV` values before `pnpm --filter @kava-now/web build`.

### 2.4 Verify Sentry wiring

The repo already has the core Sentry pieces:

- API init in `packages/api/src/sentry.ts`, imported first from `packages/api/src/index.ts`.
- API `app.onError` capture in `packages/api/src/app.ts`.
- API request tags from `packages/api/src/middleware/sentry-context.ts`.
- Web `Sentry.init` and `<Sentry.ErrorBoundary>` in `packages/web/src/main.tsx`.
- Web build-time `VITE_SENTRY_*` values in `packages/web/vite.config.ts`.

Before launch, verify errors arrive in both Sentry projects with `SENTRY_ENVIRONMENT=production` and the deploy SHA in `SENTRY_RELEASE`. If Google OAuth or web Sentry is enabled, make sure `build-images.yml` passes the build args into the `caddy` target; runtime `.env.production` cannot change already-built static assets.

### 2.5 Add `infra/postgres/postgresql.conf`

Create `infra/postgres/postgresql.conf` and mount it into Postgres if you want day-1 tuning for the CX22's 4 GB RAM. This is optional for launch, but it gives sane defaults and useful slow-query logging:

```conf
# Connection settings
max_connections = 100
listen_addresses = '*'

# Memory — leave ~1.5 GB for the OS + API
shared_buffers = 1GB
effective_cache_size = 2GB
work_mem = 16MB
maintenance_work_mem = 256MB

# Write performance
wal_buffers = 16MB
checkpoint_completion_target = 0.9
random_page_cost = 1.1

# Logging
log_min_duration_statement = 500ms
log_line_prefix = '%t [%p] %u@%d '
log_statement = 'ddl'

# Autovacuum
autovacuum_vacuum_scale_factor = 0.1
autovacuum_analyze_scale_factor = 0.05
```

Mount it in `docker-compose.yml` only if the file exists:

```yaml
postgres:
  volumes:
    - postgres-data:/var/lib/postgresql/data
    - ./infra/postgres/postgresql.conf:/etc/postgresql/postgresql.conf:ro
  command: ["postgres", "-c", "config_file=/etc/postgresql/postgresql.conf"]
```

Tune later based on actual workload and Postgres logs; do not over-optimize before real traffic.

### 2.6 `.gitignore`

Ensure `.env.production` and `infra/secrets/` are ignored. The `.example` stays in git.

### 2.7 Commit + push to main

Tag the commit `pre-deploy-baseline` so you can git-revert if anything goes sideways during cutover.

---

## 3. Terraform setup (`infra/terraform/`)

### 3.1 State backend

Use **Terraform Cloud** free tier (5 users, unlimited private workspaces, free state hosting). It keeps Terraform state out of the repo and avoids managing a state bucket yourself.

- Sign up at [app.terraform.io](https://app.terraform.io).
- Create org `kava-now`, workspace `kava-now-prod`, execution mode **Local** (workflow runs `terraform apply` from GH runner; TFC just stores state).
- Generate API token for CI (`TF_STATE_TOKEN`).

### 3.2 Files to add

```
infra/terraform/
  versions.tf       # hcloud + cloudflare provider pins + terraform cloud backend
  variables.tf      # vm_type=cx22, location=fsn1, domain=kavanow.gr, ssh_pub_key
  main.tf           # hcloud_ssh_key, hcloud_firewall, hcloud_server (cloud-init)
  dns.tf            # cloudflare_dns_record × 2 (A + AAAA apex, both proxied=true)
  cache.tf          # cloudflare_ruleset (2 rules: cache bypass /api/*, short-TTL SPA shell)
                    # cloudflare_zone_setting × 8 (SSL=strict, always HTTPS, min TLS 1.2, brotli, http3, early hints, …)
  cloud-init.yaml   # OS hardening + Docker + deploy user
  outputs.tf        # vm_ipv4, vm_ipv6
```

`variables.tf` minimum shape:

```hcl
variable "hcloud_token" {
  type      = string
  sensitive = true
}

variable "cloudflare_api_token" {
  type      = string
  sensitive = true
}

variable "cloudflare_zone_id" {
  type = string
}

variable "domain" {
  type    = string
  default = "kavanow.gr"
}

variable "ssh_pub_key" {
  type = string
}

variable "vm_type" {
  type    = string
  default = "cx22"
}

variable "location" {
  type    = string
  default = "fsn1"
}
```

`versions.tf` and providers:

```hcl
terraform {
  required_version = ">= 1.15.0"

  cloud {
    organization = "kava-now"
    workspaces {
      name = "kava-now-prod"
    }
  }

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.63"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.19"
    }
  }
}

provider "hcloud" {
  token = var.hcloud_token
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
```

`main.tf` essentials:

```hcl
resource "hcloud_ssh_key" "deploy" {
  name       = "kavanow-deploy"
  public_key = var.ssh_pub_key
}

resource "hcloud_firewall" "public" {
  name = "kavanow-public"

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "22"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
}

resource "hcloud_server" "kavanow" {
  name         = "kavanow-prod"
  image        = "ubuntu-26.04"
  server_type  = var.vm_type
  location     = var.location
  ssh_keys     = [hcloud_ssh_key.deploy.id]
  backups      = true
  firewall_ids = [hcloud_firewall.public.id]
  user_data    = templatefile("${path.module}/cloud-init.yaml", {
    deploy_pub_key = var.ssh_pub_key
  })
}
```

`dns.tf` snippet (cloudflare provider v5 — `cloudflare_record` → `cloudflare_dns_record`, `value` → `content`):

```hcl
resource "cloudflare_dns_record" "apex_a" {
  zone_id = var.cloudflare_zone_id
  name    = var.domain
  type    = "A"
  content = hcloud_server.kavanow.ipv4_address
  proxied = true
  ttl     = 1   # required when proxied
}

resource "cloudflare_dns_record" "apex_aaaa" {
  zone_id = var.cloudflare_zone_id
  name    = var.domain
  type    = "AAAA"
  content = hcloud_server.kavanow.ipv6_address
  proxied = true
  ttl     = 1
}
```

`cache.tf` snippet (Cloudflare provider v5 — `rules` is a list-of-objects, `cloudflare_zone_settings_override` removed in favor of one `cloudflare_zone_setting` per setting):

```hcl
resource "cloudflare_ruleset" "cache_rules" {
  zone_id = var.cloudflare_zone_id
  name    = "kavanow-cache"
  kind    = "zone"
  phase   = "http_request_cache_settings"

  rules = [
    {
      description = "Bypass cache for /api/*"
      expression  = "(starts_with(http.request.uri.path, \"/api/\"))"
      action      = "set_cache_settings"
      action_parameters = {
        cache = false
      }
    },
    {
      description = "Short edge TTL for SPA shell"
      expression  = "(http.request.uri.path eq \"/\" or http.request.uri.path eq \"/index.html\")"
      action      = "set_cache_settings"
      action_parameters = {
        cache = true
        edge_ttl = {
          mode    = "override_origin"
          default = 60   # 60s
        }
        browser_ttl = {
          mode    = "override_origin"
          default = 0    # respect our no-cache header
        }
      }
    },
  ]
}

# One resource per setting in v5. Repeat for the eight settings we want:
# ssl=strict, always_use_https, automatic_https_rewrites, min_tls_version=1.2,
# opportunistic_encryption, brotli, http3, early_hints.
resource "cloudflare_zone_setting" "ssl" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "ssl"
  value      = "strict"
}
# (Browser cache TTL for /assets/* is governed by our origin Cache-Control header.)
```

The Origin CA cert is **not** in Terraform — it's a one-time hand-generated cert that lives in 1Password. Pasting it into Terraform's state would unnecessarily expose the private key to TFC. The cert gets onto the VM via `scripts/bootstrap-vm.sh` (manual paste step in §5).

`cloud-init.yaml` should encode the manual hardening so a replacement VM is reproducible:

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
  - ca-certificates
  - curl
  - gnupg
  - lsb-release

runcmd:
  - install -m 0755 -d /etc/apt/keyrings
  - curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  - chmod a+r /etc/apt/keyrings/docker.gpg
  - echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
  - apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  - mkdir -p /etc/ssh/sshd_config.d
  - printf 'PermitRootLogin no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nChallengeResponseAuthentication no\n' > /etc/ssh/sshd_config.d/99-kavanow-hardening.conf
  - sshd -t && systemctl reload ssh
  - ufw default deny incoming
  - ufw default allow outgoing
  - ufw allow OpenSSH
  - ufw allow 80/tcp
  - ufw allow 443/tcp
  - ufw --force enable
  - printf '[sshd]\nenabled = true\nport = ssh\nmaxretry = 5\nfindtime = 10m\nbantime = 10m\n' > /etc/fail2ban/jail.d/sshd.local
  - systemctl enable --now fail2ban
  - systemctl restart fail2ban
  - systemctl enable --now unattended-upgrades
  - printf 'Unattended-Upgrade::Automatic-Reboot "true";\nUnattended-Upgrade::Automatic-Reboot-Time "03:30";\n' >> /etc/apt/apt.conf.d/50unattended-upgrades
  - timedatectl set-timezone UTC
  - mkdir -p /srv/kavanow /etc/kavanow/tls
  - chown deploy:deploy /srv/kavanow
```

After provision, verify the VM before continuing:

```bash
ssh deploy@<vm_ip> 'whoami && docker --version && docker compose version'
ssh root@<vm_ip> # should fail
ssh deploy@<vm_ip> 'sudo fail2ban-client status sshd'
```

SSH is open to the world on day 1 to avoid locking yourself out. Once your access pattern is stable, optionally restrict port 22 to your home/office IP in the Hetzner firewall.

### 3.3 `scripts/bootstrap-vm.sh`

Terraform/cloud-init gets the box to a secure Docker host. `scripts/bootstrap-vm.sh` handles the post-provision secrets and operational files that should not live in Terraform state:

- Log in to GHCR as `deploy` using `GHCR_VM_PAT`.
- Create `/srv/kavanow`, `/etc/kavanow/tls`, and `/var/log/kavanow`.
- Prompt/manual step: paste Cloudflare Origin CA files to `/etc/kavanow/tls/origin.pem` and `/etc/kavanow/tls/origin.key`; set `chmod 644 origin.pem`, `chmod 600 origin.key`, owner `root:root`.
- Create `/srv/kavanow/.env.production` from password-manager values. Do not echo secrets through shell history.

Confirm Hetzner backups are enabled after provision: Hetzner Console → `kavanow-prod` → Backups should show backups enabled. After the first night, it should list a snapshot from the last 24 hours.

### 3.4 `outputs.tf` exports `vm_ipv4` so the workflow can write it to GitHub Secrets via `gh secret set HETZNER_HOST`.

---

## 4. GitHub Actions workflows (`.github/workflows/`)

All workflows that touch production must serialize with:

```yaml
concurrency:
  group: deploy-prod
  cancel-in-progress: false
```

This prevents deploy and migrate from interleaving.

| Workflow           | Trigger                 | Purpose                                                                                                                                         | Env gate         |
| ------------------ | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `ci.yml`           | PR + non-main push      | typecheck, lint, fmt:check, build                                                                                                               | none             |
| `build-images.yml` | `workflow_call`         | Build + push `kava-now-api`, `kava-now-api-jobs`, and `kava-now-caddy` to GHCR with `<sha>` + `latest` tags. Sourcemap upload to Sentry inline. | none             |
| `provision.yml`    | manual                  | `terraform plan` / `apply`                                                                                                                      | `infrastructure` |
| `deploy.yml`       | push to `main` + manual | calls build-images, scp compose+Caddyfile, ssh `--profile jobs pull` + `api-jobs` migrate + app up, smoke test                                  | `production`     |
| `migrate.yml`      | manual                  | runs `pnpm db:migrate` through `api-jobs` on VM without rebuilding                                                                              | `production`     |
| `smoke-test.yml`   | `workflow_call`         | curl `/api/health`, `/`, TLS expiry check                                                                                                       | none             |

Repo secrets to populate (Settings → Secrets and variables → Actions). This is the exact set the workflows reference:

```
HCLOUD_TOKEN                  # provision.yml
CLOUDFLARE_API_TOKEN          # provision.yml
CLOUDFLARE_ZONE_ID            # provision.yml → TF_VAR_cloudflare_zone_id (Cloudflare dashboard → kavanow.gr → Overview)
TF_STATE_TOKEN                # provision.yml → TF_TOKEN_app_terraform_io (Terraform Cloud API token, §3.1)
HETZNER_SSH_PUB_KEY           # provision.yml → TF_VAR_ssh_pub_key:
                              #   op read "op://Private/kavanow-deploy/public key" | gh secret set HETZNER_SSH_PUB_KEY
HETZNER_HOST                  # deploy.yml + migrate.yml — VM IP from provision output
HETZNER_SSH_KEY               # deploy.yml + migrate.yml:
                              #   op read "op://Private/kavanow-deploy/private key?ssh-format=openssh" | gh secret set HETZNER_SSH_KEY
HETZNER_SSH_KNOWN_HOSTS       # deploy.yml + migrate.yml — ssh-keyscan <vm_ip> output
SENTRY_AUTH_TOKEN             # build-images.yml — BuildKit secret for sourcemap upload
SENTRY_DSN_WEB                # build-images.yml — baked into the web build
GOOGLE_CLIENT_ID              # build-images.yml — baked into the web build (optional, §1.7)
```

**Not** GitHub secrets — these live only in the VM's `.env.production` (pasted during `bootstrap-vm.sh`, sourced from 1Password): `POSTGRES_PASSWORD`, `APP_DB_PASSWORD`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `SENTRY_DSN_API`, `SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD`, `GOOGLE_CLIENT_SECRET`. `GHCR_VM_PAT` (PAT with `read:packages`) is typed interactively into `bootstrap-vm.sh` for the VM's `docker login` — keep it in 1Password.

No repo variables (`vars`) are used by the workflows.

### 4.1 `ci.yml`

- Trigger: `pull_request` to `main`, plus `push` to non-`main` branches.
- Permissions: `contents: read`.
- Steps: checkout → `pnpm/action-setup@v6` with pnpm 11 → `actions/setup-node@v6` using `.node-version` and `cache: pnpm` → `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm lint` → `pnpm fmt:check` → `pnpm build`.
- No deploy and no secrets.

### 4.2 `build-images.yml`

- Trigger: `workflow_call` with input `sha`.
- Permissions: `contents: read`, `packages: write`.
- Log in to GHCR with `GITHUB_TOKEN`.
- Build and push:
  - `ghcr.io/pbechliv/kava-now-api:<sha>` and `:latest` from root `Dockerfile`, target `api`, build arg `API_PORT=3000`.
  - `ghcr.io/pbechliv/kava-now-api-jobs:<sha>` and `:latest` from root `Dockerfile`, target `api-jobs`.
  - `ghcr.io/pbechliv/kava-now-caddy:<sha>` and `:latest` from root `Dockerfile`, target `caddy`, build args `GOOGLE_CLIENT_ID`, `SENTRY_DSN_WEB`, `SENTRY_ENVIRONMENT=production`, `SENTRY_RELEASE=<sha>`.
- Use BuildKit cache: `cache-from: type=gha`, `cache-to: type=gha,mode=max`.
- For Sentry sourcemaps, prefer `@sentry/vite-plugin` in both Vite configs gated by `SENTRY_AUTH_TOKEN`. Pass `SENTRY_AUTH_TOKEN` via BuildKit secret, not as a normal build arg, so it does not land in image layers. Set `SENTRY_RELEASE=<sha>` for both API and web builds.

### 4.3 `provision.yml`

- Trigger: `workflow_dispatch` with required input `action` (`plan` or `apply`).
- Environment: `infrastructure`.
- Steps: checkout → `hashicorp/setup-terraform@v4` → export `HCLOUD_TOKEN`, `CLOUDFLARE_API_TOKEN`, `TF_TOKEN_app_terraform_io` → `terraform init` → `terraform plan -out=tfplan` → if `action=apply`, run `terraform apply tfplan`.
- Outputs `vm_ipv4` and `vm_ipv6` in the job summary. Paste `vm_ipv4` into `HETZNER_HOST` if the workflow does not set it automatically.

### 4.4 `deploy.yml`

- Trigger: push to `main` and `workflow_dispatch` with optional `sha` input.
- Environment: `production`.
- Job 1: run the same checks as `ci.yml`.
- Job 2: call `build-images.yml` with the chosen SHA.
- Job 3:
  1. Set up SSH using `HETZNER_SSH_KEY` and `HETZNER_SSH_KNOWN_HOSTS`.
  2. Copy `docker-compose.yml` and `Caddyfile` to `deploy@$HETZNER_HOST:/srv/kavanow/`.
  3. SSH and run:
     ```bash
     cd /srv/kavanow
     export IMAGE_TAG=<sha>
     docker compose --env-file .env.production --profile jobs pull
     docker compose --env-file .env.production up -d postgres
     docker compose --env-file .env.production --profile jobs run --rm api-jobs \
       pnpm --filter @kava-now/api db:migrate
     docker compose --env-file .env.production up -d api caddy
     docker image prune -f
     ```
  4. Call `smoke-test.yml`.

Migrations run before the API/Caddy swap. If migration fails, the currently running API/Caddy containers are left untouched.

### 4.5 `migrate.yml`

- Trigger: `workflow_dispatch`.
- Environment: `production`.
- Steps: set up SSH → run:
  ```bash
  cd /srv/kavanow
  docker compose --env-file .env.production --profile jobs run --rm api-jobs \
    pnpm --filter @kava-now/api db:migrate
  ```
- Capture stdout in the Actions job summary so migration history is auditable.

### 4.6 `smoke-test.yml`

- Trigger: `workflow_call`.
- Input: `host`, default `kavanow.gr`.
- Steps:
  ```bash
  curl -fS --retry 10 --retry-delay 3 "https://$host/api/health"
  curl -fS -o /dev/null "https://$host/"
  openssl s_client -servername "$host" -connect "$host:443" < /dev/null 2>/dev/null \
    | openssl x509 -noout -subject -dates
  ```
- Fail if health is not 200 or the certificate expires within 7 days.

---

## 5. Execution order (the "do this on this day" plan)

### Day 1 — Manual signups + code fixes (~3-4 h)

1. Section 1.1–1.10: register domain, create all accounts, generate keys/secrets.
2. Section 2: do all local code fixes on a feature branch. PR → review → merge to main. CI doesn't exist yet, run `pnpm check` locally before merging.

### Day 2 — Infrastructure as code (~3-4 h)

3. Write all Terraform files. Run `terraform plan` locally first (export `HCLOUD_TOKEN` + `CLOUDFLARE_API_TOKEN`).
4. Write `ci.yml`, `build-images.yml`, `provision.yml`, `smoke-test.yml`. Push to a branch, watch `ci.yml` pass.
5. Manually run `provision.yml` with `action=plan`, review, then `action=apply`. VM exists, DNS records point to it.
6. SSH into the VM (`ssh deploy@<ip>` — 1Password agent serves the key). Run `scripts/bootstrap-vm.sh`:
   - `docker login ghcr.io` with the `GHCR_VM_PAT`
   - **Write `/etc/kavanow/tls/origin.pem` + `origin.key`** by pasting from 1Password (`sudo nano`, `chmod 600 origin.key`, `chmod 644 origin.pem`, `chown root:root`)
   - Create `/srv/kavanow/.env.production` from secrets (manual paste — never echo secrets into a script)
   - Confirm Hetzner backups are enabled on the server

### Day 3 — First deploy + verify (~2-3 h)

7. Write `deploy.yml` and `migrate.yml`. Push to main → `deploy.yml` fires.
8. Watch images build, get pushed to GHCR, VM pulls, `api-jobs` runs migrations, app starts, smoke test passes.
9. Seed the initial superadmin once, after the first successful migration and before login verification:
   ```bash
   docker compose --env-file .env.production --profile jobs run --rm api-jobs \
     pnpm --filter @kava-now/api db:seed
   ```
   Confirm `SEED_DEMO=false` is set in `.env.production` unless you intentionally want demo data in prod.
10. Run `migrate.yml` manually (first deploy will already have run migrations — this is just to verify the workflow works).
11. Run the verification checklist:
    - `curl -sI https://kavanow.gr/api/health` → 200
    - `curl -sI https://kavanow.gr/api/health | grep -i cf-cache-status` → `BYPASS` or `DYNAMIC` (proves the cache-bypass rule is active)
    - `curl -sI https://kavanow.gr/assets/<some-hashed-js>` → 200, `cf-cache-status: HIT` (after second request), `cache-control: public, max-age=31536000, immutable`
    - `curl -sI https://kavanow.gr/` → 200, `cf-cache-status: HIT` or `MISS` (cached at edge), `cache-control: no-cache, must-revalidate` from origin
    - `curl -sI https://kavanow.gr/ | grep -i server` → `cloudflare` (proves proxy is ON)
    - Open `https://kavanow.gr/login`, log in as superadmin, create tenant "demo", invite a user with role "owner"
    - Check Resend dashboard for delivered email
    - Click invite link → lands on `/k/demo/welcome` → set password → log in → see admin dashboard
    - **Rate-limit + real IP check:** hammer `/api/auth/sign-in` 20× from your laptop → expect 429s. Check API logs to confirm the logged IP is your real public IP, not a Cloudflare range.
    - From a second browser, log in as a different superadmin or invite — confirm tenant isolation
    - RLS test in psql — **connect as the `kavanow_app` role** (a superuser bypasses RLS),
      and set the variable transaction-locally (as the app does):
      ```sql
      -- docker compose exec postgres psql "postgres://kavanow_app:<APP_DB_PASSWORD>@localhost/kavanow"
      begin;
        select set_config('app.current_tenant_id', '<tenant-a-uuid>', true);
        select count(*) from products; -- only tenant A rows
      commit;
      begin;
        select set_config('app.current_tenant_id', '<tenant-b-uuid>', true);
        select count(*) from products; -- only tenant B rows
      commit;
      select count(*) from products; -- 0 rows (no tenant context → fail-safe)
      ```
      As the bootstrap `kavanow` superuser these would all return every row — that
      RLS bypass is exactly what C1 fixed.
    - From local machine: `nc -zv <vm_ip> 5432` → refused
    - `ssh root@<vm_ip>` → refused
    - `curl -I https://kavanow.gr | grep -i strict-transport-security` → present
    - **Origin reachability sanity:** `curl -ksI --resolve kavanow.gr:443:<vm_ipv4> https://kavanow.gr/` should still work (proves Caddy serves the Origin CA cert correctly). `-k` is expected because Cloudflare Origin CA is trusted by Cloudflare, not by your local OS. Without the `--resolve`, Cloudflare answers.

### Day 4 — Snapshot backup + DR drill (~1-2 h)

12. Confirm Hetzner Backups tab shows backups enabled. After the first nightly run, confirm a recent snapshot exists.
13. **Restore drill (mandatory):** create a throwaway tenant, populate a few rows, create an on-demand snapshot, then restore that snapshot into a temporary VM. Confirm `SELECT count(*) FROM tenants;` and smoke checks match expectations. Delete the temporary VM/image after the drill.
14. Confirm Better Stack monitor is green and alert routing works.

### Day 5 — Polish (~1-2 h)

15. Add a calendar reminder: quarterly Hetzner snapshot restore drill into a temporary VM.
16. Add an annual reminder for `GHCR_VM_PAT` rotation.
17. Copy §6 "Operations runbook" from this superplan into `docs/operations.md` once production is live.
18. Move the superseded plans to `plans/archive/` or delete them once you are comfortable that this file is the only deployment source of truth.

---

## 6. Operations runbook

### Routine deploy

Push to `main` or manually run `deploy.yml` with a SHA. Watch the Action. A successful run means images built, migrations ran, API/Caddy restarted, and the smoke test passed.

### Manual migration

Run `migrate.yml`. It uses the same `api-jobs` image as deploy:

```bash
cd /srv/kavanow
docker compose --env-file .env.production --profile jobs run --rm api-jobs \
  pnpm --filter @kava-now/api db:migrate
```

### One-shot seed

Only run this on first production setup, or if you intentionally need to create the configured superadmin:

```bash
cd /srv/kavanow
docker compose --env-file .env.production --profile jobs run --rm api-jobs \
  pnpm --filter @kava-now/api db:seed
```

Make sure `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`, and `SEED_DEMO=false` are present in `.env.production`. Without explicit superadmin vars, the seed script falls back to dev defaults.

### Logs

```bash
ssh deploy@<vm_ip>
cd /srv/kavanow
docker compose --env-file .env.production logs --tail=200 -f api
docker compose --env-file .env.production logs --tail=200 -f caddy
docker compose --env-file .env.production logs postgres | grep -E "duration: [0-9]{4,}"
```

### Postgres inspection

```bash
cd /srv/kavanow
docker compose --env-file .env.production exec postgres psql -U kavanow kavanow
```

Useful SQL:

```sql
\l
\dt
SELECT pg_size_pretty(pg_database_size('kavanow'));
SELECT * FROM pg_stat_activity WHERE state != 'idle';
SELECT count(*) FROM tenants;
SELECT count(*) FROM tenant_memberships;
```

### RLS debugging

Connect as the `kavanow_app` role (a superuser bypasses RLS) and set the
variable transaction-locally, the way the app does:

```sql
-- docker compose exec postgres psql "postgres://kavanow_app:<APP_DB_PASSWORD>@localhost/kavanow"
begin;
  select set_config('app.current_tenant_id', '<tenant-uuid>', true);
  select count(*) from products;
  select count(*) from orders;
commit;

-- no tenant context → fail-safe (zero tenant-scoped rows, no error)
select count(*) from products;
```

Tenant-scoped tables should return rows only when `app.current_tenant_id` is set to a matching tenant. Global tables like `tenants`, `users`, and `tenant_memberships` are scoped in application code, not by RLS.

### Rollback

No dedicated rollback workflow exists yet — re-trigger `deploy.yml` with `workflow_dispatch` and a prior SHA to redeploy old `api`/`caddy` images. This still runs migrations against the live DB, so it's only safe when the prior SHA's schema is identical to (or a strict superset of) the current one.

For schema or data breakage, restore a Hetzner snapshot from the Hetzner Console. A code rollback does not roll back database migrations.

### Manual OS maintenance

Most security patches are handled by `unattended-upgrades`, with auto-reboot at 03:30 UTC. For controlled upgrades:

```bash
ssh deploy@<vm_ip>
sudo apt update && sudo apt upgrade -y
sudo systemctl restart docker # only if Docker was updated
sudo reboot                  # only if kernel or core services changed
```

### Postgres major upgrade

Schedule a maintenance window and take an on-demand Hetzner snapshot first.

```bash
cd /srv/kavanow
docker compose --env-file .env.production stop api caddy
docker compose --env-file .env.production exec postgres \
  pg_dumpall -U kavanow > /tmp/full-dump.sql
docker compose --env-file .env.production stop postgres
```

Then update the Postgres image tag, create a fresh volume or archive the old one, start Postgres, restore the dump, and restart the app:

```bash
docker compose --env-file .env.production up -d postgres
docker compose --env-file .env.production exec -T postgres \
  psql -U kavanow < /tmp/full-dump.sql
docker compose --env-file .env.production up -d
```

Test the full procedure on a scratch VM before doing it in production.

### Disaster recovery

If the VM itself is broken but Hetzner snapshots are intact:

1. Hetzner Console → `kavanow-prod` → Backups.
2. Pick a snapshot before the breakage.
3. Restore in place. The VM keeps IP, firewall, and SSH keys.
4. Verify `curl -sI https://kavanow.gr/api/health`.

If the VM is gone but snapshots exist:

1. Create an image from the latest backup.
2. Create a replacement CX22 from that image.
3. Update Cloudflare A/AAAA records to the new IPs, or update Terraform state and apply.
4. Recreate `/etc/kavanow/tls/origin.pem` and `origin.key` if the snapshot did not include them.
5. Verify health, login, invite email, and tenant isolation.

Limitations of this day-1 backup model:

- Snapshots are in the same provider account as the workload.
- Snapshot retention is short: 7 nightly backups.
- A Hetzner account compromise, suspension, or regional snapshot outage can still be catastrophic.
- You restore the whole VM or inspect a cloned VM; there is no easy single-table restore.

### Local resource checks

Optional lightweight disk/memory monitor:

```bash
sudo tee /usr/local/bin/kavanow-monitor.sh > /dev/null <<'EOF'
#!/bin/sh
set -eu
df -h /
free -m
docker system df
EOF
sudo chmod +x /usr/local/bin/kavanow-monitor.sh
```

Real alerting should live in Better Stack and Sentry rather than ad-hoc cron output.

---

## 7. Cost (steady state)

| Item                                                            | Monthly        | Notes                                    |
| --------------------------------------------------------------- | -------------- | ---------------------------------------- |
| Hetzner CX22                                                    | 4.49 €         | 2 vCPU, 4 GB RAM, 40 GB NVMe             |
| Hetzner snapshot backups                                        | 0.90 €         | +20% of VM, nightly, 7-day retention     |
| Domain `kavanow.gr`                                             | ~1.50 €        | Amortized; ~18 €/yr at Papaki            |
| Resend, Cloudflare, Sentry, Better Stack, GHCR, Terraform Cloud | 0 €            | All free tier                            |
| **Total**                                                       | **~6.90 €/mo** | Including Hetzner snapshots + monitoring |

Scale-up triggers:

- Resend free tier pressure: if transactional email exceeds the free allowance, move to Resend Pro rather than self-hosting SMTP.
- Disk >80%: upgrade to CX32, attach a Hetzner Volume, or move Postgres data to a larger disk after a tested backup.
- Sustained CPU >70% on CX22: upgrade vertically first. CX32/CPX21 are cheaper and simpler than a multi-node architecture.
- Sustained DB pressure: tune indexes and queries first, then consider moving Postgres to a dedicated VM or managed provider.
- SLA needs above roughly 99.5%: add a second app VM, externalize Postgres, and introduce a load balancer. Until then, one VM is simpler and good enough.

---

## 8. Risks worth re-stating

These are the ones that come from the GH-Actions-driven flow specifically:

| Risk                                                         | Mitigation                                                                                                                                                                                           |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Terraform state drift if you edit the VM in Hetzner Console  | Quarterly `terraform plan` reminder; treat drift as a bug; keep human-only resources documented.                                                                                                     |
| Schema-incompatible rollback                                 | No automated rollback yet — re-running `deploy.yml` at a prior SHA still runs migrations. Escape hatch: restore a pre-deploy Hetzner snapshot.                                                       |
| Hetzner-only backups share the provider/account blast radius | Accept for launch; enable Hetzner 2FA and run quarterly restore drills. Add offsite encrypted backups once customers/revenue justify it.                                                             |
| Snapshot retention is only 7 days                            | Add calendar reminders for restore drills and take manual snapshots before risky migrations.                                                                                                         |
| `.gr` domain renewal lapses                                  | Auto-renew at Papaki + calendar reminder 60 days before expiry.                                                                                                                                      |
| GHCR PAT for VM-pulls expires                                | Calendar reminder annually; rotation = 2-min `docker login` over SSH.                                                                                                                                |
| Cloudflare IP ranges change → Caddy stops trusting CF        | CF announces ~yearly. Annual reminder to refresh the `trusted_proxies static` list in the Caddyfile.                                                                                                 |
| Direct origin IP discovery bypasses CF (DDoS skips proxy)    | UFW + Hetzner firewall already restrict to 22/80/443. Optional hardening: restrict 80/443 to CF IP ranges only (lose direct origin access for `--resolve` debugging). Defer until traffic justifies. |
| CF cache serves stale `/index.html` after deploy             | Edge TTL capped at 60 s + origin sets `no-cache`. Worst case: 1-min lag for new SPA to reach users. Manual override: `Caching → Configuration → Purge Everything` after critical deploys.            |

---

## 9. Out of scope (deferred)

- Zero-downtime deploys (Kamal / blue-green). Current 5–10 s container restart is acceptable pre-launch.
- Encrypted offsite database backups. Hetzner snapshots are enough for day 1; add a separate offsite tier when the product has real customers or compliance pressure.
- Lock origin port 80/443 to Cloudflare IP ranges only. Day-1 setup keeps direct origin access open for `curl --resolve` debugging; tighten once traffic patterns are known.
- Cloudflare WAF custom rules (free plan supports 5). Reasonable post-launch hardening once you see real attack traffic.
- Cloudflare Authenticated Origin Pulls (mTLS between CF and origin). Stronger than Full (strict); defer until there's a concrete reason.
- Postgres read replica or move-off-VM (Neon / dedicated Hetzner Postgres). Trigger: sustained >50% CPU or >99.5% SLA.
- Sentry performance tracing + session replay. Errors-only for now.
- Log aggregation (Loki, Better Stack logs). `docker compose logs` is enough until >1 VM.
- Multi-region failover. Add when DAU justifies a warm standby.

---

## 10. Superseded plan files

This superplan is now the standalone deployment source of truth. The older Hetzner, GitHub Actions, and Sentry plan drafts have been removed after their relevant details were folded into this file.
