# Hetzner Cloud Deployment Plan — KavaNow

> ⚠️ **SUPERSEDED — written against the pre-refactor architecture.** See [CLAUDE.md](../CLAUDE.md) for the current model. Major drifts to update before reusing this plan:
>
> - **Tenancy is path-based now**, not subdomain-based. Caddy doesn't need a wildcard cert or DNS-01; a single cert on the canonical origin is enough. The `header_up Host {host}` line in the proxy block is no longer load-bearing — `tenantMiddleware` reads the slug from the URL path, not the Host header.
> - **`BASE_DOMAIN` env var was replaced by `APP_ORIGIN`** (a complete origin URL, e.g. `https://kavanow.gr`). No `VITE_BASE_DOMAIN`.
> - **No magic-link auth.** Login is email + password. Invites go through `auth.api.requestPasswordReset` and land on `/k/<slug>/welcome`. The `rewriteForTenant` URL-rewriting code is gone.
> - **Users are global with M2M memberships** in `kava_memberships`. No `users.kavaId`/`role`/`realEmail`. `decodeAuthEmail` no longer exists — the email passed to Resend is just `user.email`.
> - **No DNS wildcard record needed** — one `A` record at the canonical domain is enough.
> - The Hetzner CX22 sizing, Docker Compose layout, Caddy/Postgres backup story, and the operational runbook are all still valid; only the per-tenant networking + auth assumptions need updating.

## Context

KavaNow is a pre-release multi-tenant SaaS (subdomain-based tenancy, PostgreSQL Row-Level Security, Hono API, React SPA, better-auth with magic links). No production deployment yet; only a Dockerfile + Caddyfile in the repo. Goal: get to a running production environment for under $10/month with zero significant refactor, accepting that this means self-managing a Linux VM.

This plan describes a single-VM deployment on Hetzner Cloud running the existing stack inside Docker Compose: API + Postgres + Caddy on one €4.49/mo box, with managed offsite backups, automated CI/CD, and wildcard SSL. The whole codebase stays exactly as it is today; the only application code change is swapping Nodemailer for Resend so magic-link emails actually deliver.

The plan is deliberately exhaustive: every shell command, every config file in full, every operational procedure. It's meant to be executed top-to-bottom by someone who has never deployed to Hetzner before.

---

## Architecture

```
                          Internet (clients, browsers, mail link clicks)
                                           │
                                           │  DNS-only (no proxy yet):
                                           │  A    kavanow.tld       → <VM IP>
                                           │  A    *.kavanow.tld     → <VM IP>
                                           ▼
                          ┌──────────────────────────────────┐
                          │   Hetzner Cloud Firewall         │  (managed at platform level)
                          │   Inbound: 22, 80, 443 only      │
                          └──────────────────────────────────┘
                                           │
                                           ▼
                          ┌──────────────────────────────────┐
                          │  Hetzner CX22  (Ubuntu 24.04)    │
                          │  2 vCPU shared, 4 GB RAM, 40 GB  │
                          │  UFW firewall (defense in depth) │
                          │  fail2ban (SSH brute force)      │
                          │  unattended-upgrades (security)  │
                          └──────────────────────────────────┘
                                           │
                                           ▼
                          ┌──────────────────────────────────────────────────────────┐
                          │                docker compose (prod)                     │
                          │                                                          │
                          │  ┌────────────────┐                                      │
                          │  │   caddy:2      │  ◄── 80/tcp, 443/tcp (host published) │
                          │  │   custom build │                                      │
                          │  │   + cloudflare │  DNS-01 wildcard cert refresh        │
                          │  │   DNS plugin   │  via Cloudflare API token            │
                          │  └────────┬───────┘                                      │
                          │           │                                              │
                          │           │  /api/*  →  api:3000  (Host header preserved)│
                          │           │  /*      →  static files from /srv/web      │
                          │           ▼                                              │
                          │  ┌────────────────┐         ┌────────────────────────┐  │
                          │  │   api  (Hono)  │ ──TCP──►│   postgres:17-alpine   │  │
                          │  │   Node 24      │         │   Internal only        │  │
                          │  │   port 3000    │         │   Volume: pg_data      │  │
                          │  │   internal     │         │   Never exposed to host│  │
                          │  └────────┬───────┘         └────────────────────────┘  │
                          │           │                                              │
                          └───────────┼──────────────────────────────────────────────┘
                                      │
                                      ▼
                          Resend HTTPS API  (magic links, password reset)
                                      │
                                      ▼
                          Recipient inboxes (DKIM/SPF/DMARC verified)


Host-level cron, daily at 03:00 UTC:
  pg_dump | gzip | age encrypt | rclone copy → Backblaze B2 (offsite)
```

Key properties of this topology:

- **One process per concern**, all on one VM. Simplicity beats premature distribution.
- **Postgres is never reachable from outside the Docker network.** No `ports:` mapping. The blast radius of a leaked DB credential is zero from the public internet.
- **Caddy owns SSL** for all subdomains via a single wildcard cert obtained over DNS-01. No HTTP-01 challenges = no race conditions with proxy-mode CDNs you might add later.
- **Resend is mandatory.** VPS IPs have IP reputation issues with the major mail providers (Gmail, Microsoft, Apple Mail). Sending magic-link auth emails directly from the VM would deliver maybe 30% of the time. Resend's HTTP API bypasses this entirely.
- **Backups go offsite, encrypted.** Hetzner snapshots are convenient but only protect against your own mistakes within the Hetzner blast radius. Encrypted `pg_dump` archives on Backblaze B2 protect against Hetzner outages, account compromise, and ransomware on the VM.

---

## Cost breakdown (steady state)

| Item                                | Monthly    | Notes                                                                     |
| ----------------------------------- | ---------- | ------------------------------------------------------------------------- |
| Hetzner CX22 VM                     | €4.49      | 2 vCPU shared (AMD), 4 GB RAM, 40 GB NVMe, 20 TB egress included          |
| Hetzner snapshot backups            | €0.90      | +20% of VM cost; nightly snapshots, kept 7 days                           |
| Domain `kavanow.tld`                | ~$1        | Amortized; assumes ~$12/yr registration                                   |
| Backblaze B2 storage                | ~$0.50     | $0.006/GB-mo; expect 5–20 GB of compressed `pg_dump` archives over a year |
| Backblaze B2 egress                 | ~$0        | Free up to 3× stored data per month; you only download on restore         |
| Resend (free tier)                  | $0         | 3,000 emails/mo, 100/day. Magic-link traffic is <100/day at pre-release.  |
| Cloudflare DNS                      | $0         | Free tier sufficient (DNS hosting + API token for Caddy)                  |
| UptimeRobot / Better Stack (uptime) | $0         | Free tier: one HTTP check every 5 min                                     |
| **Total**                           | **~$7/mo** | All-in, including offsite backups and monitoring                          |

Cost growth signals (when to pay more):

- **Resend > 3k emails/mo** → Pro tier at $20/mo (50k emails). Likely months 4–12 if traction picks up.
- **Disk > 80%** on the VM → upgrade to CX32 (€5.83/mo, 8 GB RAM, 80 GB) or attach a Hetzner Volume (€0.0476/GB-mo, e.g. 100 GB = ~€4.76/mo). Volumes are easier — no VM downtime.
- **CPU sustained > 70%** (visible in Hetzner Console) → upgrade to CPX21 (€6.49/mo, dedicated 3 vCPU AMD).
- **Production SLA needs > 99.5%** → add a second VM as warm standby (~$5/mo more), plus a load balancer (€5.39/mo Hetzner LB11).

---

## Prerequisites checklist

Before Day 1 starts, have all of these in hand:

- [ ] **Hetzner Cloud account** with a valid payment method on file. Verify email.
- [ ] **Local SSH keypair** generated (`ssh-keygen -t ed25519 -C "kava-now-deploy"`). The public key is what you upload to Hetzner.
- [ ] **Domain registered** (e.g. `kavanow.tld`). Have access to its registrar to change nameservers.
- [ ] **Cloudflare account** (free). Add your domain to Cloudflare → take note of the assigned nameservers and change them at your registrar. Wait for propagation (15 min–24 h).
- [ ] **Cloudflare API token** scoped to **Zone:DNS:Edit** for `kavanow.tld` only. Save it in a password manager.
- [ ] **Resend account**. Add and verify your sending domain (`kavanow.tld`) — Resend gives you 3 DNS records to add at Cloudflare:
  - One TXT for SPF
  - One TXT and one CNAME for DKIM
  - Optionally, one TXT for DMARC (`v=DMARC1; p=none; rua=mailto:dmarc@kavanow.tld`)
  - Wait for verification (usually <10 min).
- [ ] **Resend API key** (Production scope). Save in password manager.
- [ ] **Backblaze B2 account**. Create a private bucket `kava-now-backups`. Generate an Application Key scoped to that bucket only (read/write). Save Key ID + Application Key.
- [ ] **GitHub repo** with the codebase pushed. The deploy workflow will SSH into the VM, so you need to be able to add SSH keys to the VM and secrets to GitHub.
- [ ] **age encryption keypair** for backup encryption: `age-keygen -o ~/.config/age/backup.key`. The file contains the private key (keep offline, in a password manager); the public key is the line at the top of the file starting with `age1...`.

---

## Phase 1 — Day 1: Server provisioning

### 1.1 Provision the VM

1. Hetzner Cloud Console → Projects → New Project ("kava-now") → Servers → Add Server.
2. Location: **`fsn1`** (Falkenstein, Germany) or **`hel1`** (Helsinki, Finland). Pick the one closer to your expected users. FSN1 is the most popular and has the lowest latency to most of EU.
3. Image: **Ubuntu 24.04**.
4. Type: **Shared vCPU → CX22** (€4.49/mo).
5. Networking: keep IPv4 + IPv6 (IPv6 is free; some checks demand it).
6. SSH keys: **Add SSH key** → paste contents of `~/.ssh/id_ed25519.pub`. Name it after your machine.
7. Backups: **Enable**. +20% (€0.90/mo) is non-negotiable as a safety net — independent of your offsite backups, this protects against your own destructive mistakes.
8. Cloud Firewall: skip for now, we'll create one after the VM exists.
9. Placement Group: skip (only relevant for multi-VM setups).
10. Name: `kava-prod-01`.
11. **Create & Buy now.**

The VM provisions in ~30 seconds. Note the assigned public IPv4 address.

### 1.2 Create the Cloud Firewall

Hetzner Console → Firewalls → Create Firewall:

- Name: `kava-public`
- Inbound rules:
  - TCP `22` from `0.0.0.0/0, ::/0` (SSH)
  - TCP `80` from `0.0.0.0/0, ::/0` (HTTP, used only for Caddy's redirect to HTTPS)
  - TCP `443` from `0.0.0.0/0, ::/0` (HTTPS)
- Apply to: `kava-prod-01`.

Outbound rules: leave default (allow all). The VM needs to reach Cloudflare API (DNS challenge), Resend API (email), Backblaze B2 (backups), apt repos (updates), Docker Hub (image pulls).

> **Hardening option:** lock SSH (22) to only your home/office IP later. Don't do this on Day 1 — if your IP changes, you lock yourself out.

### 1.3 First SSH + system hardening

From your local machine:

```bash
ssh root@<VM_IP>
```

Once in (you may need to type `yes` to accept the host key), run:

```bash
# 1. Update everything
apt update && apt upgrade -y
apt install -y curl wget git ufw fail2ban unattended-upgrades \
                ca-certificates gnupg lsb-release age rclone

# 2. Create a non-root deploy user
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy

# 3. Allow deploy to use sudo without a password (CI needs this)
echo "deploy ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/deploy
chmod 0440 /etc/sudoers.d/deploy

# 4. Copy SSH keys from root to deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

# 5. Lock down SSH
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#*ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh

# 6. UFW (defense in depth, in case Hetzner firewall is misconfigured)
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# 7. fail2ban with default SSH jail (5 attempts → 10 min ban)
systemctl enable --now fail2ban

# 8. Configure unattended-upgrades for security patches
dpkg-reconfigure -plow unattended-upgrades  # accept defaults (Yes)

# 9. Set a reboot window for kernel patches
echo 'Unattended-Upgrade::Automatic-Reboot "true";' \
  >> /etc/apt/apt.conf.d/50unattended-upgrades
echo 'Unattended-Upgrade::Automatic-Reboot-Time "03:30";' \
  >> /etc/apt/apt.conf.d/50unattended-upgrades

# 10. Set timezone to UTC (consistent logs and cron times)
timedatectl set-timezone UTC

# 11. Verify root login is now disabled
exit
```

From your local machine, confirm:

```bash
ssh root@<VM_IP>          # should fail or be locked out
ssh deploy@<VM_IP>        # should succeed
```

### 1.4 Install Docker

SSH in as `deploy` and:

```bash
# Install Docker from the official Docker repository (not Ubuntu's older docker.io)
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin \
                    docker-compose-plugin

# Add deploy to docker group (no sudo needed for docker commands)
sudo usermod -aG docker deploy

# Log out and back in for group change to take effect
exit
```

Reconnect, verify:

```bash
ssh deploy@<VM_IP>
docker --version          # → Docker version 27.x.x
docker compose version    # → Docker Compose version v2.x.x
docker run --rm hello-world
```

---

## Phase 2 — Day 1 (continued): DNS

### 2.1 Cloudflare DNS records

In the Cloudflare dashboard, select your zone (`kavanow.tld`) → DNS → Records → Add record:

```
Type  | Name           | Content      | Proxy status | TTL
------+----------------+--------------+--------------+------
A     | @              | <VM_IPv4>    | DNS only     | Auto
A     | *              | <VM_IPv4>    | DNS only     | Auto
AAAA  | @              | <VM_IPv6>    | DNS only     | Auto
AAAA  | *              | <VM_IPv6>    | DNS only     | Auto
```

Notes:

- **DNS only (grey cloud), NOT proxied.** With proxy ON, traffic flows through Cloudflare's edge before reaching your VM, which complicates Caddy's cert acquisition and changes the `X-Forwarded-For` story. You can flip it on later for DDoS protection once the system is stable. For now, keep it simple.
- `@` is the apex (`kavanow.tld`). `*` is the wildcard (`anything.kavanow.tld`).
- Both A (IPv4) and AAAA (IPv6) records are recommended; Hetzner gives you free IPv6.

### 2.2 Cloudflare API token for Caddy

Cloudflare dashboard → My Profile (top-right) → API Tokens → Create Token → **Edit zone DNS** template:

- Permissions: `Zone — DNS — Edit`
- Zone Resources: `Include — Specific zone — kavanow.tld`
- No IP filtering, no TTL.

Save the token in your password manager. You'll paste it into the VM's `.env.production` shortly.

### 2.3 Verify DNS propagation

From your local machine:

```bash
dig +short kavanow.tld
dig +short demo.kavanow.tld
dig +short anything.kavanow.tld
# All three should return <VM_IPv4>
```

If they don't return within 5 minutes, you set the records on the wrong zone. Double-check.

---

## Phase 3 — Day 2: Application files

These files live in the kava-now repo. Add them locally, commit, push, and pull on the VM later.

### 3.1 `Caddyfile.Dockerfile` (repo root)

The standard `caddy:2-alpine` image doesn't include the Cloudflare DNS plugin needed for DNS-01 wildcard challenges. We build a custom image.

```dockerfile
FROM caddy:2-builder-alpine AS builder
RUN xcaddy build --with github.com/caddy-dns/cloudflare

FROM caddy:2-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
```

This image is ~50 MB and builds in ~90 seconds. It gets rebuilt only when you change this Dockerfile.

### 3.2 `Caddyfile` (repo root — replaces existing dev Caddyfile, or keep both)

```caddy
{
    email ops@kavanow.tld
    # Use Let's Encrypt production CA (default). Override to staging during testing
    # to avoid rate limits: acme_ca https://acme-staging-v02.api.letsencrypt.org/directory
}

# Single block handles both apex and all subdomains via wildcard cert.
kavanow.tld, *.kavanow.tld {
    tls {
        dns cloudflare {env.CLOUDFLARE_API_TOKEN}
        resolvers 1.1.1.1 1.0.0.1
    }

    # API routes — preserve Host header for tenantMiddleware
    handle /api/* {
        reverse_proxy api:3000 {
            header_up Host {host}
            header_up X-Forwarded-Host {host}
            header_up X-Forwarded-Proto {scheme}
            header_up X-Forwarded-For {remote_host}
            health_uri /api/healthz
            health_interval 30s
        }
    }

    # Static SPA + client-side routing fallback
    handle {
        root * /srv/web
        try_files {path} /index.html
        file_server
    }

    encode gzip zstd

    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        Referrer-Policy "strict-origin-when-cross-origin"
        Permissions-Policy "geolocation=(), microphone=(), camera=()"
        # Remove default Server header
        -Server
    }

    log {
        output stdout
        format json
        level INFO
    }
}
```

Why these directives matter:

- **`dns cloudflare`**: tells Caddy to use the DNS-01 challenge via Cloudflare's API. The wildcard cert covers `*.kavanow.tld` and the apex.
- **`resolvers 1.1.1.1 1.0.0.1`**: forces Caddy to use Cloudflare's recursive resolver for the challenge verification, avoiding edge cases where the VM's default resolver is slow or stale.
- **`header_up Host {host}`**: critical. Your `tenantMiddleware` reads the subdomain from the `Host` header. Without this line, Caddy would replace `Host` with the upstream address (`api:3000`), breaking tenant resolution.
- **`X-Forwarded-Host`**: better-auth's magic-link plugin uses this header to rewrite confirmation URLs to the right tenant subdomain (`packages/api/src/auth/index.ts`).
- **`try_files {path} /index.html`**: React Router 7 handles all non-`/api` paths client-side; this falls back to `index.html` for deep links.
- **HSTS preload**: a year-long commitment, but appropriate for a B2B SaaS. Browsers will refuse to load over HTTP once they've seen this once.

### 3.3 `docker-compose.prod.yml` (repo root)

```yaml
services:
  caddy:
    build:
      context: .
      dockerfile: Caddyfile.Dockerfile
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data # certs + ACME account live here — persist!
      - caddy_config:/config
      - ./packages/web/dist:/srv/web:ro
    environment:
      CLOUDFLARE_API_TOKEN: ${CLOUDFLARE_API_TOKEN}
    depends_on:
      - api
    networks:
      - kava-net

  api:
    build:
      context: .
      dockerfile: Dockerfile
      target: api # multi-stage target; confirm name in existing Dockerfile
    restart: unless-stopped
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://kava:${POSTGRES_PASSWORD}@postgres:5432/kava
      BASE_DOMAIN: kavanow.tld
      COOKIE_SECRET: ${COOKIE_SECRET}
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET}
      RESEND_API_KEY: ${RESEND_API_KEY}
      MAIL_FROM: "KavaNow <noreply@kavanow.tld>"
      API_PORT: "3000"
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - kava-net
    expose:
      - "3000"

  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: kava
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: kava
      # Enables explicit RLS even for the kava user (your migrations already do this,
      # but defense in depth)
      POSTGRES_INITDB_ARGS: "--data-checksums"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      # Optional: tune Postgres for 4 GB RAM
      - ./infra/postgres/postgresql.conf:/etc/postgresql/postgresql.conf:ro
    command: postgres -c config_file=/etc/postgresql/postgresql.conf
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U kava -d kava"]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 30s
    networks:
      - kava-net
    # NO ports: section. Postgres is reachable only via Docker network.

volumes:
  caddy_data:
  caddy_config:
  postgres_data:

networks:
  kava-net:
    driver: bridge
```

Notes:

- **No host port published for Postgres.** It's reachable only from `api` (and from your shell if you `docker compose exec`).
- **`caddy_data` volume is critical.** It stores Let's Encrypt certs and the ACME account key. Losing it means re-issuing certs (and potentially hitting LE rate limits).
- **`./infra/postgres/postgresql.conf`** is optional but recommended — see 3.4.

### 3.4 `infra/postgres/postgresql.conf` (optional, tuned for 4 GB VM)

```conf
# Connection settings
max_connections = 100
listen_addresses = '*'

# Memory — leave ~1.5 GB for the OS + API
shared_buffers = 1GB                  # 25% of RAM
effective_cache_size = 2GB            # 50% of RAM
work_mem = 16MB                       # per-sort/per-hash; 100 conns × 16MB = 1.6GB worst case
maintenance_work_mem = 256MB

# Write performance
wal_buffers = 16MB
checkpoint_completion_target = 0.9
random_page_cost = 1.1                # NVMe → seq and random are nearly equal

# Logging
log_min_duration_statement = 500ms    # log slow queries
log_line_prefix = '%t [%p] %u@%d '
log_statement = 'ddl'                 # log schema changes (audit trail)

# Autovacuum (defaults are conservative for small servers)
autovacuum_vacuum_scale_factor = 0.1
autovacuum_analyze_scale_factor = 0.05
```

Tune later based on `pg_stat_statements` and actual workload. These values are a sensible starting point for a 4 GB VM.

### 3.5 Application code change — Resend mailer

The only code change Path D requires. In [packages/api/src/auth/index.ts](packages/api/src/auth/index.ts), replace Nodemailer usage in `sendMagicLink` and `sendResetPassword` with Resend's HTTP client:

```ts
// At the top of the file
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);
const MAIL_FROM = process.env.MAIL_FROM ?? "KavaNow <noreply@kavanow.tld>";

// Inside sendMagicLink (preserving your existing x-forwarded-host URL rewriting):
const rewrittenUrl = rewriteForTenant(url, ctx);
const realEmail = decodeAuthEmail(user.email);

if (process.env.NODE_ENV === "production") {
  await resend.emails.send({
    from: MAIL_FROM,
    to: [realEmail],
    subject: "Sign in to KavaNow",
    html: renderMagicLinkEmail({ url: rewrittenUrl }),
  });
} else {
  // Local dev: keep Mailpit via nodemailer
  await mailpitTransporter.sendMail({ ... });
}

// Same shape for sendResetPassword
```

Add the dependency to `packages/api/package.json`:

```bash
pnpm --filter @kava-now/api add resend
```

The `rewriteForTenant` logic stays unchanged — that's what makes magic-link emails land on the right subdomain. Only the transport changes.

### 3.6 Update `.gitignore`

Append:

```
.env.production
infra/secrets/
```

### 3.7 `.env.production.example` (repo root, committed; the real `.env.production` is gitignored)

```bash
# Postgres
POSTGRES_PASSWORD=                       # openssl rand -base64 32

# better-auth & sessions
COOKIE_SECRET=                           # openssl rand -hex 32
BETTER_AUTH_SECRET=                      # openssl rand -hex 32

# Email (Resend)
RESEND_API_KEY=                          # re_... from Resend dashboard

# Caddy DNS challenge
CLOUDFLARE_API_TOKEN=                    # from Cloudflare → My Profile → API Tokens
```

### 3.8 Commit, push, prepare for deploy

```bash
git add Caddyfile Caddyfile.Dockerfile docker-compose.prod.yml \
        infra/postgres/postgresql.conf .env.production.example .gitignore
git add packages/api/src/auth/index.ts packages/api/package.json pnpm-lock.yaml
git commit -m "feat: hetzner production deployment config"
git push
```

---

## Phase 4 — Day 2: First deploy

### 4.1 Get the code onto the VM

```bash
ssh deploy@<VM_IP>
sudo mkdir -p /srv && sudo chown deploy:deploy /srv
cd /srv
git clone https://github.com/<you>/kava-now.git
cd kava-now
```

### 4.2 Set up production secrets

```bash
cp .env.production.example .env.production
chmod 600 .env.production
nano .env.production
```

Generate each secret locally:

```bash
# On your local machine (not the VM, so no shell history of secrets on the server)
openssl rand -base64 32       # → POSTGRES_PASSWORD
openssl rand -hex 32          # → COOKIE_SECRET
openssl rand -hex 32          # → BETTER_AUTH_SECRET
```

Paste into the `.env.production` file on the VM via `nano`. Save your password manager copies.

### 4.3 Build and start

```bash
cd /srv/kava-now
docker compose -f docker-compose.prod.yml --env-file .env.production build
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f
```

Expected log output:

1. Postgres reports `database system is ready to accept connections`.
2. API container starts, runs `await drizzle migrate` (your existing logic), then `Server listening on port 3000`.
3. Caddy logs `serving initial configuration` then within 30–90 s logs successful cert acquisition for `kavanow.tld` and `*.kavanow.tld`.

If Caddy fails the cert challenge:

- Check that `CLOUDFLARE_API_TOKEN` is set (`docker compose exec caddy env | grep CLOUD`).
- Check DNS propagation (`dig kavanow.tld @1.1.1.1`).
- Check Cloudflare API token permissions (must be Zone:DNS:Edit on this exact zone).
- Switch to LE staging CA temporarily to debug without hitting rate limits: add `acme_ca https://acme-staging-v02.api.letsencrypt.org/directory` to the Caddyfile's global block, restart caddy.

### 4.4 Run database migrations and seed

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec api pnpm db:migrate

docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec api pnpm db:seed
```

The seed creates the superadmin user. Note the credentials printed.

### 4.5 First smoke test

From your local machine:

```bash
curl -sI https://kavanow.tld/api/healthz
# HTTP/2 200
# server: (empty — we strip it)
# strict-transport-security: max-age=31536000; ...

curl -sI https://demo.kavanow.tld/admin
# HTTP/2 200, returns index.html (SPA shell)
```

Open `https://admin.kavanow.tld` in a browser, log in as the superadmin, create a kava (tenant) named "demo", invite an owner user. Check Resend dashboard — the invite magic-link email should appear in the sent log within seconds.

Click the link in the email (now from Resend's domain, but rewritten to `demo.kavanow.tld/welcome?token=...`). Confirm the flow lands on the right tenant and the user can set a password.

---

## Phase 5 — Day 3: Backups

### 5.1 Configure rclone for B2

On the VM:

```bash
rclone config
# Type: n (new remote)
# Name: b2
# Storage: 6 (Backblaze B2)
# account: <B2 Key ID>
# key: <B2 Application Key>
# (accept defaults for everything else)
```

Verify:

```bash
rclone lsd b2:kava-now-backups
# Should be empty (or list any existing folders)
```

### 5.2 Store the age public key

You generated an age keypair in prereqs. The **private** key stays in your password manager (and a printed copy in a fireproof safe if you're feeling extra). The **public** key goes on the VM so the backup script can encrypt:

```bash
sudo mkdir -p /etc/kava
echo "age1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" | \
  sudo tee /etc/kava/backup.pub
sudo chmod 644 /etc/kava/backup.pub
```

### 5.3 Backup script

```bash
sudo tee /usr/local/bin/kava-backup.sh > /dev/null << 'EOF'
#!/bin/bash
set -euo pipefail

TS=$(date -u +%Y-%m-%dT%H-%M-%SZ)
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

DUMP="$TMPDIR/kava-${TS}.sql.gz"
ENC="$TMPDIR/kava-${TS}.sql.gz.age"

echo "[$(date -u +%FT%TZ)] Starting backup..."

# Dump and compress
docker compose -f /srv/kava-now/docker-compose.prod.yml \
  --env-file /srv/kava-now/.env.production \
  exec -T postgres \
  pg_dump -U kava -d kava --no-owner --no-acl | gzip -9 > "$DUMP"

DUMP_SIZE=$(stat -c%s "$DUMP")
echo "[$(date -u +%FT%TZ)] Dump size: $DUMP_SIZE bytes"

# Encrypt with age
age -r "$(cat /etc/kava/backup.pub)" -o "$ENC" "$DUMP"

# Upload
rclone copy "$ENC" b2:kava-now-backups/daily/ --b2-hard-delete

# Lifecycle: keep daily 7 days, weekly 4 weeks, monthly forever
# (Implemented via B2 bucket lifecycle rules in B2 console, not here)

echo "[$(date -u +%FT%TZ)] Backup complete: kava-${TS}.sql.gz.age"
EOF

sudo chmod +x /usr/local/bin/kava-backup.sh
```

Test once manually:

```bash
sudo /usr/local/bin/kava-backup.sh
rclone ls b2:kava-now-backups/daily/
# Should list one file
```

### 5.4 Schedule daily

```bash
sudo tee /etc/cron.d/kava-backup > /dev/null << 'EOF'
0 3 * * * deploy /usr/local/bin/kava-backup.sh >> /var/log/kava-backup.log 2>&1
EOF
```

### 5.5 B2 lifecycle policy

In Backblaze console → your bucket → Lifecycle Settings:

```
Folder: daily/      Keep prior versions: 7 days
Folder: weekly/     Keep prior versions: 28 days
Folder: monthly/    Keep prior versions: 365 days
```

Then add cron jobs that promote daily → weekly (each Sunday) and weekly → monthly (1st of each month). Or simpler: just run the backup four times: daily/, and on appropriate days, also copy to weekly/ and monthly/. Implementation left as an exercise — the daily backup alone gives you 7 days of RPO and is the critical one.

### 5.6 Test restore (mandatory, before you trust it)

In a scratch environment (local Docker, **not the VM**):

```bash
rclone copy b2:kava-now-backups/daily/kava-<latest>.sql.gz.age /tmp/
age -d -i ~/.config/age/backup.key /tmp/kava-*.sql.gz.age | \
  gunzip > /tmp/restore.sql

# Start a scratch Postgres
docker run -d --name restore-test \
  -e POSTGRES_USER=kava -e POSTGRES_PASSWORD=test -e POSTGRES_DB=kava \
  postgres:17-alpine

sleep 5
docker exec -i restore-test psql -U kava kava < /tmp/restore.sql
docker exec restore-test psql -U kava kava -c "SELECT count(*) FROM kavas;"

docker rm -f restore-test
```

Schedule this restore drill **quarterly** in your calendar. A backup you've never restored isn't a backup.

---

## Phase 6 — Day 3: CI/CD

### 6.1 Generate a deploy SSH key for GitHub Actions

On your local machine:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/kava-deploy -C "github-actions"
# No passphrase (CI can't enter one)
```

Add the public key to the VM's `deploy` user:

```bash
cat ~/.ssh/kava-deploy.pub | ssh deploy@<VM_IP> \
  'cat >> ~/.ssh/authorized_keys'
```

### 6.2 Add GitHub secrets

In GitHub → your repo → Settings → Secrets and variables → Actions:

- `HETZNER_HOST`: the VM's public IPv4.
- `HETZNER_SSH_KEY`: contents of `~/.ssh/kava-deploy` (the private key, including `-----BEGIN...` lines).
- `HETZNER_SSH_KNOWN_HOSTS`: output of `ssh-keyscan <VM_IP>` from your local machine, paste verbatim. This pins the VM's host key so GitHub Actions can't be MITM'd.

### 6.3 The workflow

`.github/workflows/deploy.yml`:

```yaml
name: Deploy to Hetzner

on:
  push:
    branches: [main]
  workflow_dispatch: # manual trigger button

concurrency:
  group: deploy-prod
  cancel-in-progress: false # never cancel a deploy mid-flight

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 11

      - uses: actions/setup-node@v4
        with:
          node-version-file: .node-version
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Type check
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint

      - name: Format check
        run: pnpm fmt:check

      - name: Build
        run: pnpm build

      # Setup SSH agent with the deploy key, pin host key
      - name: Setup SSH
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.HETZNER_SSH_KEY }}" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          echo "${{ secrets.HETZNER_SSH_KNOWN_HOSTS }}" > ~/.ssh/known_hosts

      - name: Deploy
        run: |
          ssh deploy@${{ secrets.HETZNER_HOST }} bash -s << 'EOF'
            set -euo pipefail
            cd /srv/kava-now
            git fetch --depth=1 origin main
            git reset --hard origin/main
            docker compose -f docker-compose.prod.yml --env-file .env.production \
              build api caddy
            docker compose -f docker-compose.prod.yml --env-file .env.production \
              up -d --no-deps api caddy
            docker compose -f docker-compose.prod.yml --env-file .env.production \
              exec -T api pnpm db:migrate
            docker image prune -f
          EOF

      - name: Smoke test
        run: |
          for i in 1 2 3 4 5 6 7 8 9 10; do
            STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
                     https://kavanow.tld/api/healthz)
            if [ "$STATUS" = "200" ]; then
              echo "Healthz OK after attempt $i"
              exit 0
            fi
            echo "Attempt $i: status=$STATUS, retrying..."
            sleep 3
          done
          echo "Healthz failed after 10 attempts"
          exit 1
```

What this gives you:

- Push to `main` → CI runs typecheck/lint/build/fmt locally on the GitHub runner first.
- If green, it SSHes into the VM, fast-forwards the repo, rebuilds only the API+Caddy images (Postgres untouched), restarts them, runs migrations, prunes old images.
- Smoke-tests `/api/healthz` after deploy and fails the workflow if it doesn't return 200 within 30 seconds.
- The container restart causes 5–10 seconds of downtime per deploy. Acceptable at pre-release.

### 6.4 Test by pushing a trivial change

Bump a version comment or tweak a string. Push to `main`. Watch the Action run, watch `docker compose logs -f api` on the VM. Confirm the smoke test passes.

---

## Phase 7 — Day 4: Monitoring and ops

### 7.1 Uptime monitoring

Sign up for **Better Stack** (or UptimeRobot, Hetzner has no first-party offering).

Configure:

- HTTPS check on `https://kavanow.tld/api/healthz`, every 60 s.
- Alert via email and (optionally) Slack/SMS.
- Expected status: 200.

This catches: VM down, Postgres crashed, API container OOM, Caddy cert expiry (which shouldn't happen, but…).

### 7.2 Disk + resource alerts

Add a cron on the VM:

```bash
sudo tee /usr/local/bin/kava-monitor.sh > /dev/null << 'EOF'
#!/bin/bash
DISK_PCT=$(df / | awk 'NR==2 {gsub("%",""); print $5}')
MEM_PCT=$(free | awk '/Mem:/ {printf "%.0f", $3/$2*100}')

if [ "$DISK_PCT" -gt 80 ]; then
  echo "ALERT: Disk at ${DISK_PCT}%" | \
    curl -X POST "https://<betterstack-webhook>" \
         -H "Content-Type: application/json" \
         -d "{\"alert\":\"Disk ${DISK_PCT}%\"}"
fi

if [ "$MEM_PCT" -gt 90 ]; then
  echo "ALERT: Mem at ${MEM_PCT}%"
fi
EOF
sudo chmod +x /usr/local/bin/kava-monitor.sh

sudo tee /etc/cron.d/kava-monitor > /dev/null << 'EOF'
*/15 * * * * root /usr/local/bin/kava-monitor.sh
EOF
```

### 7.3 Log access

For ad-hoc:

```bash
ssh deploy@<VM_IP>
docker compose -f /srv/kava-now/docker-compose.prod.yml logs --tail=200 -f api
docker compose -f /srv/kava-now/docker-compose.prod.yml logs --tail=200 -f caddy
```

For Postgres slow queries (already configured via `log_min_duration_statement = 500ms`):

```bash
docker compose -f /srv/kava-now/docker-compose.prod.yml logs postgres | grep -E "duration: [0-9]{4,}"
```

Skip log aggregation (Loki, Datadog, etc.) at this scale. Revisit when you have >1 VM or >100 reqs/sec.

### 7.4 Postgres ops

Useful one-liners (run from the VM):

```bash
# Open a psql shell
docker compose -f /srv/kava-now/docker-compose.prod.yml \
  --env-file /srv/kava-now/.env.production \
  exec postgres psql -U kava kava

# Inside psql:
\l                                                 # list databases
\dt                                                # list tables
SELECT pg_size_pretty(pg_database_size('kava'));   # DB size
SELECT * FROM pg_stat_activity WHERE state != 'idle';  # active queries
```

For RLS debugging (extremely useful):

```sql
-- Simulate a tenant session
SELECT set_config('app.current_kava_id', '<some-uuid>', false);
SELECT count(*) FROM products;     -- should only see that tenant's rows

-- Clear it
SELECT set_config('app.current_kava_id', '', false);
SELECT count(*) FROM products;     -- should see zero rows from tenant-scoped tables
```

---

## Phase 8 — Day 4+: Verification checklist

Execute every step. Don't trust until you've verified.

- [ ] **Wildcard cert**: `curl -vI https://demo.kavanow.tld/api/healthz` shows `subjectAltName: *.kavanow.tld, kavanow.tld` and status 200.
- [ ] **Tenant isolation**: Create two tenants via superadmin. Log in as owner of tenant A on `a.kavanow.tld/admin`, see only A's data. Log out, log in as owner of B on `b.kavanow.tld/admin`, see only B's data.
- [ ] **Magic-link delivery**: From `a.kavanow.tld/login`, request magic link. Resend dashboard shows "delivered". Email lands in your inbox within 30 s (not spam folder).
- [ ] **Magic-link tenant correctness**: The link URL contains `a.kavanow.tld`, not `b.kavanow.tld` or bare `kavanow.tld`. Clicking it lands on tenant A's confirm page.
- [ ] **Magic-link single-use**: After clicking once and getting in, opening the same link in another browser must fail (better-auth's atomic single-use protection from your existing setup).
- [ ] **Password reset**: Same flow, with a `forget-password` request. Resend delivers, link works, password gets updated.
- [ ] **Rate limit**: Hammer `POST /api/auth/sign-in` 20 times in 30 seconds from a single IP → expect 429 responses after the 10th-ish.
- [ ] **RLS isolation in psql** (per Phase 7.4 commands): rows visible match the `app.current_kava_id` setting.
- [ ] **Backup integrity**: A scratch restore from the latest `daily/` archive succeeds and row counts match production.
- [ ] **CI deploy**: Push a no-op commit to `main`. GitHub Action runs, deploys, smoke test passes.
- [ ] **Container restart resilience**: `docker compose restart api` → service comes back up within 10 s, sessions persist (because session cookies, not in-memory).
- [ ] **HSTS header**: `curl -I https://kavanow.tld | grep -i strict` shows the HSTS header.
- [ ] **No exposed Postgres**: from your local machine, `nc -zv <VM_IP> 5432` times out or refuses (UFW + no published port).
- [ ] **No exposed root SSH**: `ssh root@<VM_IP>` rejects with `Permission denied (publickey)` or similar.
- [ ] **fail2ban active**: `sudo fail2ban-client status sshd` shows the jail running.
- [ ] **unattended-upgrades active**: `sudo systemctl status unattended-upgrades` is `active (running)`.

---

## Operational runbook

### Routine deploy

Push to `main`. Watch the GitHub Action. If green, you're done.

### Hotfix to main without going through PR

Same — push to `main`. The workflow runs typecheck/lint/build first, so you can't deploy broken code.

### Rollback a bad deploy

```bash
ssh deploy@<VM_IP>
cd /srv/kava-now
git log --oneline -n 10                # find the last-known-good commit
git reset --hard <good-commit-sha>
docker compose -f docker-compose.prod.yml --env-file .env.production \
  up -d --no-deps --build api caddy
```

For DB-impacting rollbacks (a migration that broke things): restore from the latest daily backup. See "Disaster recovery" below.

### Manual DB query / inspection

```bash
ssh deploy@<VM_IP>
docker compose -f /srv/kava-now/docker-compose.prod.yml \
  --env-file /srv/kava-now/.env.production \
  exec postgres psql -U kava kava
```

### Update OS packages manually

```bash
ssh deploy@<VM_IP>
sudo apt update && sudo apt upgrade -y
sudo systemctl restart docker        # only if docker was updated
sudo reboot                          # only if kernel was updated
```

(Most security updates are applied automatically by `unattended-upgrades`. This is for major-version bumps you want to control.)

### Postgres major version upgrade (e.g. 17 → 18)

This is the scariest routine op. Schedule a maintenance window.

```bash
# 1. Take a fresh backup
sudo /usr/local/bin/kava-backup.sh

# 2. Stop the app
docker compose -f docker-compose.prod.yml stop api caddy

# 3. Dump from old Postgres
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dumpall -U kava > /tmp/full-dump.sql

# 4. Bring down old Postgres, keep the volume
docker compose -f docker-compose.prod.yml stop postgres

# 5. Rename the volume so the new postgres starts clean
docker volume create kava-now_postgres_data_v17_archive
# (copy contents — or just trust the dump and rm -rf the old volume)

# 6. Update image: postgres:17-alpine → postgres:18-alpine in docker-compose.prod.yml

# 7. Bring up new postgres, restore
docker compose -f docker-compose.prod.yml up -d postgres
sleep 10
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U kava < /tmp/full-dump.sql

# 8. Restart everything
docker compose -f docker-compose.prod.yml up -d
```

Estimated downtime: 5–15 minutes for a small DB. Test the entire procedure on a scratch VM first.

### Disaster recovery (DR) — full VM lost

The VM is destroyed (Hetzner outage, accidental delete, ransomware).

1. **Provision a new VM** (same steps as Phase 1).
2. **Pull a backup**:
   ```bash
   rclone copy b2:kava-now-backups/daily/kava-<latest>.sql.gz.age /tmp/
   age -d -i ~/.config/age/backup.key /tmp/kava-*.sql.gz.age | gunzip > /tmp/restore.sql
   ```
3. **Re-do Phases 1–4** on the new VM but **skip the `pnpm db:seed` step**.
4. **Restore the dump**:
   ```bash
   docker compose exec -T postgres psql -U kava kava < /tmp/restore.sql
   ```
5. **Update DNS** A/AAAA records to the new VM's IPs at Cloudflare. Propagation: 1–5 minutes (TTL "Auto" is 5 min).
6. **Caddy re-issues cert** automatically on first request to a new IP. Allow ~90 s.

RPO: 24 hours (worst case, between daily backups). RTO: ~1 hour if you're practiced.

### Scaling up vertically

When Hetzner Console shows sustained >70% CPU or >80% memory:

```bash
# Upgrade in the Hetzner Console (takes ~30 s, automatic reboot):
# CX22 (€4.49) → CX32 (€5.83, 8 GB RAM) → CX42 (€10.52, 16 GB)
# OR dedicated:
# CPX21 (€6.49, 3 vCPU AMD dedicated) → CPX31 (€11.05, 4 vCPU)
```

For just adding disk: attach a Hetzner Volume (€0.0476/GB-mo), mount to `/var/lib/docker/volumes` (or specifically just `postgres_data`).

### Scaling out horizontally (when single-VM stops being enough)

This is a bigger change — out of scope for Path D but documented as the off-ramp:

1. Move Postgres to **Neon** (managed) or a second Hetzner VM dedicated to DB.
2. Move rate limiter from in-memory `Map` to **Redis** (one more service in the compose file, or Hetzner-managed Redis equivalent).
3. Run multiple API VMs behind a **Hetzner Load Balancer** (€5.39/mo for LB11).
4. Sticky sessions for the magic-link flow, or store verification state in DB instead of memory.

Triggers: sustained >50% CPU on a CPX31, OR a customer-facing SLA requiring >99.5% uptime, OR you simply outgrow one box.

---

## Risks and mitigations

| Risk                                         | Likelihood              | Impact                                   | Mitigation                                                                                                                             |
| -------------------------------------------- | ----------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| You delete the wrong Docker volume           | Medium                  | Catastrophic (data loss)                 | Daily encrypted offsite backups; never run `docker volume rm` carelessly; consider `docker compose down --volumes` as a tripwire word  |
| Hetzner region outage                        | Low                     | Medium (hours of downtime)               | Hetzner snapshots help if disk survives. Restore from B2 to a new VM in another region — practiced procedure, ~1 h                     |
| Ransomware on the VM                         | Low                     | Catastrophic if no offsite               | Offsite B2 backups with age encryption keep your data; you re-provision the VM                                                         |
| SSH brute force                              | Medium                  | Low                                      | fail2ban + key-only auth means this is essentially a non-event. Logs may show attempts                                                 |
| Postgres major version EOL                   | Certain over years      | Medium                                   | Schedule quarterly review of Postgres release calendar; major upgrade procedure documented above                                       |
| Domain expiry                                | Low                     | Catastrophic                             | Auto-renew at registrar; calendar reminder 30 days before expiry as a backup                                                           |
| Cloudflare API token leaked                  | Low                     | Medium (DNS hijack possible)             | Token scoped to `Zone:DNS:Edit` on one zone only. Rotate annually. Stored only in `.env.production` (`chmod 600`) and password manager |
| age private key lost                         | Low                     | Catastrophic (backups become unreadable) | Store the key in a password manager AND printed in a fireproof safe AND share with one trusted person                                  |
| Resend account suspended                     | Low                     | High (no auth emails = no logins)        | Have a secondary mail provider (Postmark) ready as a documented fallback. Switching is one config change + DNS records                 |
| Disk fills up (40 GB)                        | Medium (over 1–2 years) | High (Postgres stops writing)            | Disk alert at 80%; weekly `docker system prune`; attach Hetzner Volume when DB grows past 20 GB                                        |
| You forget how to do any of this in 6 months | Certain                 | Medium                                   | Keep this plan file in the repo (`docs/operations.md`); update it whenever you change anything                                         |

---

## What gets added to the repo

```
+ Caddyfile.Dockerfile                     # custom Caddy build with cloudflare DNS plugin
+ docker-compose.prod.yml                  # production compose file
+ infra/postgres/postgresql.conf           # tuned for 4 GB VM
+ .env.production.example                  # template; real .env.production is gitignored
+ .github/workflows/deploy.yml             # CI/CD
~ Caddyfile                                # if a dev one exists, augment with prod block
~ packages/api/src/auth/index.ts           # Nodemailer → Resend (production only)
~ packages/api/package.json                # add `resend` dependency
~ .gitignore                               # add `.env.production`, `infra/secrets/`
```

Nothing is deleted. The existing `Dockerfile`, `docker-compose.dev.yml`, and the rest of the codebase remain untouched.

---

## Timeline summary

| Day | Tasks                                                                                        | Hours                                  |
| --- | -------------------------------------------------------------------------------------------- | -------------------------------------- |
| 1   | Provision VM, harden OS, install Docker, configure DNS, Cloudflare API token                 | 3–4                                    |
| 2   | Author compose/Caddyfile/Caddy build/Resend swap, first deploy, migrations, seed, smoke test | 4–6                                    |
| 3   | Backup script, B2 setup, test restore, GitHub Actions workflow, deploy test                  | 3–4                                    |
| 4   | Uptime monitoring, disk alerts, verification checklist, documentation                        | 2–3                                    |
|     | **Total**                                                                                    | **12–17 hours over 3–4 calendar days** |

This is realistic for someone comfortable in a Linux shell. First-timer: double it.

---

## Next steps after Path D is running

Things to defer until you have actual users and actual problems:

1. **Zero-downtime deploys.** Switch to **Kamal** (`gem install kamal` or via Docker, no Ruby needed). It does blue/green container swaps on Docker hosts. Or DIY with two `api` services + Caddy upstream `lb_policy first` + health checks.
2. **Cloudflare proxy on.** Flip the grey cloud to orange in DNS records. Free DDoS mitigation + edge caching for static assets. Requires re-checking that Caddy still validates certs correctly (or switch to Cloudflare Origin Certificate).
3. **Postgres read replica.** When read-heavy queries (dashboards, search) start to drag.
4. **Move Postgres off the VM.** Either to Neon (managed, free tier still generous) or a dedicated Hetzner VM. Decouples DB lifecycle from app lifecycle.
5. **Observability.** Add `pg_stat_statements` properly, ship logs to Loki or Better Stack, add Prometheus + Grafana for metrics.
6. **Multi-region.** When you have customers complaining about latency or you've committed to a >99.5% SLA. Two VMs + LB11 + replicated Postgres.

None of these are needed at pre-release.
