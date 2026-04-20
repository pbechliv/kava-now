# KavaNow Cloud Deployment Plan — Cloudflare Workers + Resend (Free / ≈$0/mo)

## Context

KavaNow is a multi-tenant Hono + React monorepo with PostgreSQL (RLS), better-auth (cross-subdomain cookies + magic links), and nodemailer SMTP. The goal: deploy to production for low-usage traffic at effectively $0/mo, EU-preferred, with the API on **Cloudflare Workers** and mail on **Resend**.

Workers is attractive (globally distributed, no cold starts, generous free tier) but it is **not a drop-in swap** for this codebase. Three runtime assumptions in the code must change:

1. **`postgres.js` needs TCP sockets** — doesn't run on Workers. Must move to `@neondatabase/serverless`.
2. **`nodemailer` needs SMTP over TCP** — doesn't run on Workers. Must move to Resend's HTTP API (`resend` npm package).
3. **RLS depends on a session-scoped `set_config('app.current_kava_id', ..., false)`** ([`packages/api/src/middleware/tenant.ts:74`](packages/api/src/middleware/tenant.ts:74)). Workers + any pooled/HTTP Postgres driver loses session state between queries, so the session-var approach must become **per-request-Client-scoped** (or fall back to `withTenant` transaction-scoping at [`packages/api/src/db/with-tenant.ts`](packages/api/src/db/with-tenant.ts)).

The refactor is real but contained (~1 day focused). If you'd rather skip it, a Fly.io container runs the current code unchanged for ~$0–3/mo (noted as Plan B at the bottom). The rest of this document assumes the Workers path, split into shippable phases so any one session can make progress without breaking local dev.

---

## Status

Tick boxes as phases complete. Each phase is independently shippable — `pnpm dev` must stay green after every phase lands.

**Phase 0 — Accounts & domain**
- [ ] Domain registered and nameservers pointed at Cloudflare
- [ ] `wrangler login` done on dev machine; `wrangler whoami` works
- [ ] Neon project created in Frankfurt, direct (non-pooled) URL captured
- [ ] Neon staging branch created
- [ ] Resend account created, sending domain verified (SPF/DKIM/DMARC live)
- [ ] GitHub Actions secrets set: `CF_API_TOKEN`, `CF_ACCOUNT_ID`, `PROD_DATABASE_URL`, `STAGING_DATABASE_URL`, `RESEND_API_KEY`

**Phase 1 — Mail swap (dual-transport, still Node build)**
- [ ] `resend` package added to `packages/api`
- [ ] [`packages/api/src/services/email.ts`](packages/api/src/services/email.ts) picks transport: Resend when `RESEND_API_KEY` is set, else existing nodemailer→Mailpit for dev
- [ ] `.env.example` documents `RESEND_API_KEY`
- [ ] Manual smoke: magic link + order notification via Resend in a dev run pointing at Resend sandbox

**Phase 2 — DB refactor to per-request Client (still Node, still `postgres.js`)**
- [ ] [`packages/api/src/db/connection.ts`](packages/api/src/db/connection.ts) exports a `createRequestDb(databaseUrl)` factory; module-level `db` kept as a thin wrapper for CLI scripts only
- [ ] `tenantMiddleware` sets per-request `db` in `c.var.db` and releases the client on response
- [ ] All 18 route/service files (listed in Refactor §4) read `db` from context
- [ ] Better-auth factory (new file `packages/api/src/auth/factory.ts`) builds the `auth` instance per request; `authMiddleware` uses the request-scoped instance
- [ ] `pnpm dev` green, multi-tenant flow (login → product list → order) passes end-to-end against local Docker Postgres

**Phase 3 — Workers preset + wrangler + driver swap**
- [ ] [`packages/api/vite.config.ts`](packages/api/vite.config.ts) switched to `@hono/vite-build/cloudflare-workers`
- [ ] `packages/api/wrangler.toml` committed with bindings, `nodejs_compat`, Rate Limiting binding
- [ ] Request path swapped: `postgres.js` → `@neondatabase/serverless` in `createRequestDb` (CLI scripts keep `postgres.js`)
- [ ] [`packages/api/src/middleware/rate-limit.ts`](packages/api/src/middleware/rate-limit.ts) uses CF Rate Limiting binding
- [ ] `wrangler dev` boots; `http://demo.lvh.me:8787` flows work locally (Vite proxy updated to point at 8787)

**Phase 4 — Frontend on Pages + DNS**
- [ ] Cloudflare Pages project connected to the repo; build succeeds
- [ ] Pages Function at `packages/web/functions/api/[[path]].ts` binds the Worker for `/api/*`
- [ ] Wildcard custom domain `*.<domain>` + bare `<domain>` attached to the Pages project
- [ ] Universal SSL active for the wildcard

**Phase 5 — Prod cutover**
- [ ] Migrations run against prod Neon (via GHA or locally)
- [ ] Superadmin bootstrapped (see "Initial Prod Bootstrap")
- [ ] Worker secrets set: `wrangler secret put DATABASE_URL` / `RESEND_API_KEY` / `COOKIE_SECRET`
- [ ] Full verification checklist passes
- [ ] Ship

---

## Stack

| Layer | Choice | Region | Cost |
|---|---|---|---|
| Domain registrar | Cloudflare Registrar (`.com` ≈ $10/yr) or Hetzner/Gandi for `.eu`/`.de`. `.gr` via Papaki. | — | ~$10/yr |
| DNS + CDN | Cloudflare | EU edges | $0 |
| Frontend (SPA) | **Cloudflare Pages** | EU edges | $0 |
| API | **Cloudflare Workers** (Hono, `@hono/vite-build/cloudflare-workers`) | Global edge incl. EU | $0 (100k req/day free) |
| Postgres | **Neon** free tier, Frankfurt, `@neondatabase/serverless` WebSocket driver | `eu-central-1` | $0 |
| Mail | **Resend** free (100/day, 3k/mo) | US-HQ, EU endpoint available on paid | $0 |
| Rate limit store | Cloudflare Workers **Rate Limiting binding** (native) | — | $0 |

Projected total: **$0/mo** + domain (~$10/yr).

---

## Topology

```
Browser →  https://<tenant>.<domain>/…        (Cloudflare Pages, SPA)
Browser →  https://<tenant>.<domain>/api/…    (same Pages project, routed to Worker via Pages Functions binding)
Worker   →  Neon (WebSocket, direct endpoint, per-request connection)
Worker   →  Resend HTTPS API
```

Same-origin: the Worker is bound to the Pages project so `/api/*` on every tenant subdomain is handled without CORS. The Worker reads `request.headers.get("host")` — which is already `<tenant>.<domain>` — so the existing tenant middleware works untouched on the Host header.

Cloudflare issues wildcard TLS for `*.<domain>` via Universal SSL (free, one wildcard level).

---

## Refactor Scope

### 1. API build target — [`packages/api/vite.config.ts`](packages/api/vite.config.ts)

Swap `@hono/vite-build/node` → `@hono/vite-build/cloudflare-workers`. Add `packages/api/wrangler.toml` declaring: `compatibility_date`, `compatibility_flags = ["nodejs_compat"]`, bindings for `DATABASE_URL`, `RESEND_API_KEY`, `COOKIE_SECRET`, `BASE_DOMAIN`, and the Rate Limiting binding.

### 2. Database layer — [`packages/api/src/db/connection.ts`](packages/api/src/db/connection.ts)

Replace the module-level `postgres()` client with a per-request factory:

```ts
// Phase 2 (Node + postgres.js)
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
export function createRequestDb(url: string) {
  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema });
  return { db, release: () => client.end({ timeout: 1 }) };
}

// Phase 3 (Workers + @neondatabase/serverless)
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
export function createRequestDb(url: string) {
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
  return { db, release: () => pool.end() };
}
```

CLI scripts ([`migrate.ts`](packages/api/src/db/migrate.ts), [`seed.ts`](packages/api/src/db/seed.ts), [`reset.ts`](packages/api/src/db/reset.ts)) keep a separate module-level `postgres.js` client — they never run in the Worker.

### 3. Tenant middleware — [`packages/api/src/middleware/tenant.ts`](packages/api/src/middleware/tenant.ts)

Per request: create a request-scoped `db` via `createRequestDb(env.DATABASE_URL)`, acquire a single Client from the pool, run `set_config('app.current_kava_id', ..., false)` on that client, stash `db` in `c.var.db`, and on response release the client via `c.executionCtx.waitUntil(release())`. Preserves the current "set once, all queries scoped" model because every query in the request goes through the same checked-out Client.

Alternative (smaller diff, bigger runtime change): use [`withTenant`](packages/api/src/db/with-tenant.ts) to wrap each DB call in a `SET LOCAL` transaction. Conflicts with handlers that do SMTP/HTTP between DB writes — [`packages/api/src/routes/admin/orders.ts:157`](packages/api/src/routes/admin/orders.ts:157) and [`packages/api/src/services/invite-user.ts:55`](packages/api/src/services/invite-user.ts:55) — so not recommended.

### 4. Route handlers (18 files)

Every file that currently imports `db` from `../db/connection` must take `db` from `c.var.db` instead:

- [`routes/admin/products.ts`](packages/api/src/routes/admin/products.ts), [`categories.ts`](packages/api/src/routes/admin/categories.ts), [`orders.ts`](packages/api/src/routes/admin/orders.ts), [`dashboard.ts`](packages/api/src/routes/admin/dashboard.ts), [`settings.ts`](packages/api/src/routes/admin/settings.ts), [`users.ts`](packages/api/src/routes/admin/users.ts), [`customers.ts`](packages/api/src/routes/admin/customers.ts)
- [`routes/customer/catalog.ts`](packages/api/src/routes/customer/catalog.ts), [`orders.ts`](packages/api/src/routes/customer/orders.ts), [`profile.ts`](packages/api/src/routes/customer/profile.ts)
- [`routes/platform.ts`](packages/api/src/routes/platform.ts), [`routes/auth.ts`](packages/api/src/routes/auth.ts), [`routes/superadmin/index.ts`](packages/api/src/routes/superadmin/index.ts)
- [`services/audit.ts`](packages/api/src/services/audit.ts), [`services/invite-user.ts`](packages/api/src/services/invite-user.ts)
- [`auth/index.ts`](packages/api/src/auth/index.ts) — see next section

Mechanical find-and-replace for most: `import { db } from "../db/connection"` → pull from `c.var.db`.

### 4a. Better-auth per-request construction

Better-auth today is a module-level `auth` instance built in [`packages/api/src/auth/index.ts`](packages/api/src/auth/index.ts) with the drizzle adapter bound to the module-level `db`. For per-request `db` we need a factory. Proposed shape:

```ts
// packages/api/src/auth/factory.ts
import type { AppDb } from "../db/connection";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";

export function createAuth(db: AppDb, env: Env) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", usePlural: true }),
    emailAndPassword: { enabled: true },
    plugins: [magicLink({ /* ...same options as today... */ })],
    user: { additionalFields: { role: {}, kavaId: {}, customerId: {}, realEmail: {} } },
    // cookie + trustedOrigins: compute from env.BASE_DOMAIN, same logic as today
  });
}
```

`authMiddleware` (which today imports `auth` and calls `auth.api.getSession({ headers })`) becomes: after `tenantMiddleware` has set `c.var.db`, call `c.set("auth", createAuth(c.var.db, env))`, then `c.var.auth.api.getSession(...)`. Custom auth routes ([`routes/auth.ts`](packages/api/src/routes/auth.ts), [`invite-user.ts`](packages/api/src/services/invite-user.ts)) use `c.var.auth` instead of the imported singleton.

Overhead: building the `auth` instance is cheap (no network, no heavy init) — per-request construction is fine at Workers scale. If measurements later show hot-path overhead, we can memoize keyed on the `db` identity.

The one thing that changes behaviour: the `/api/auth/*` catch-all at [`packages/api/src/app.ts`](packages/api/src/app.ts) (`c => auth.handler(c.req.raw)`) must become `c => c.var.auth.handler(c.req.raw)`.

### 5. Mail — [`packages/api/src/services/email.ts`](packages/api/src/services/email.ts)

Dual-transport in Phase 1 (pick by env), Resend-only after Phase 3:

```ts
import { Resend } from "resend";
import nodemailer from "nodemailer";
import { config } from "../config";

const resend = config.resendApiKey ? new Resend(config.resendApiKey) : null;
const smtp = !resend ? nodemailer.createTransport({ host: config.smtp.host, port: config.smtp.port, /* ... */ }) : null;

async function send({ to, subject, html }) {
  if (resend) return resend.emails.send({ from: config.smtp.from, to, subject, html });
  return smtp!.sendMail({ from: config.smtp.from, to, subject, html });
}
```

Four call sites (`sendMagicLink`, `sendOrderNotification`, `sendOrderStatusChange`, `sendPasswordReset`) route through `send()`.

### 6. Rate limiting — [`packages/api/src/middleware/rate-limit.ts`](packages/api/src/middleware/rate-limit.ts)

Replace the in-memory `Map` with Cloudflare's Rate Limiting binding:

```ts
const { success } = await env.RATE_LIMITER.limit({ key: ip });
if (!success) return c.json({ error: "Too many requests" }, 429);
```

Declared in `wrangler.toml` as `[[unsafe.bindings]]` with `type = "ratelimit"`. One binding per bucket (sign-in, magic-link, forget-password) keeps current isolation.

### 7. Migration scripts stay on Node

[`migrate.ts`](packages/api/src/db/migrate.ts), [`seed.ts`](packages/api/src/db/seed.ts), [`reset.ts`](packages/api/src/db/reset.ts) continue to use `postgres.js` and run locally or in a GHA runner. Keep `postgres` as a devDependency.

### 8. Frontend — no code changes

[`packages/web/src/lib/api.ts`](packages/web/src/lib/api.ts) keeps using relative `/api/*` paths. The Pages Function proxy routes them to the Worker on the same origin.

---

## Local Development Under Workers

Dev parity is easy to get wrong. Pin this recipe.

**DB.** The Neon serverless driver talks WebSocket to Neon — Docker Postgres won't answer. Two options:

- **Recommended: personal Neon branch.** Free tier allows 10 branches. Each dev has their own `dev-<name>` branch of the `staging` DB; migrations apply there. `DATABASE_URL` in `.env` points at the branch. Pros: zero infra, matches prod driver. Cons: needs internet.
- **Offline: `neon-wsproxy`.** Run `docker run --rm -p 4444:4444 ghcr.io/neondatabase/wsproxy` in front of the existing Docker Postgres; point the Neon driver at `ws://localhost:4444`. Works offline.

Both are compatible with the existing Docker Compose Mailpit service for mail in dev (see below).

**Mail.** Keep the dual transport from §5. In dev leave `RESEND_API_KEY` unset and nodemailer still routes to Mailpit (`localhost:1025`, UI at `localhost:8025`). To test the Resend path, set `RESEND_API_KEY` to a dev key and send to your own inbox.

**Running both servers.** `wrangler dev --port 8787` in `packages/api/`, `pnpm dev:web` in `packages/web/`. Update [`packages/web/vite.config.ts`](packages/web/vite.config.ts) proxy target from `http://localhost:${API_PORT}` to `http://localhost:8787`, keeping `changeOrigin: false` so `Host: demo.lvh.me:5173` is preserved through the proxy to the Worker — which is exactly what `tenantMiddleware` needs.

**Subdomain routing.** `*.lvh.me` resolves to 127.0.0.1 via public DNS; no hosts-file changes. The web app lives at `demo.lvh.me:5173`, `admin.lvh.me:5173`, etc. Wrangler's own dev server on `:8787` is never hit directly by the browser — only via the Vite proxy.

**One-liner.** `pnpm dev` (from the root) should orchestrate both. Phase 3 updates the root `package.json` `dev:api` script from `vite` to `wrangler dev --port 8787`.

---

## Environment Variables

**Worker secrets** (via `wrangler secret put`):
- `DATABASE_URL` — Neon direct URL (`postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`, no `-pooler`).
- `RESEND_API_KEY`.
- `COOKIE_SECRET` — 32+ random bytes.

**Worker vars** (in `wrangler.toml` `[vars]`):
- `BASE_DOMAIN` — e.g. `kavanow.eu`.
- `NODE_ENV=production`.

**Cloudflare Pages build env**:
- `VITE_BASE_DOMAIN` — same as `BASE_DOMAIN`, injected at build time.

**GitHub Actions secrets**:
- `CF_API_TOKEN` — scoped to Workers:Edit + Pages:Edit + Account:Read.
- `CF_ACCOUNT_ID`.
- `PROD_DATABASE_URL`, `STAGING_DATABASE_URL`.
- `RESEND_API_KEY` (for smoke tests).

---

## DNS Records (Cloudflare)

Once the domain is on Cloudflare nameservers:

- `CNAME *  → <pages-project>.pages.dev` — wildcard, proxied (orange cloud).
- `CNAME @  → <pages-project>.pages.dev` — root domain.
- `MX`, `TXT` (SPF/DKIM/DMARC) per Resend's domain-verification flow.

The Worker has no public DNS entry — it's bound to the Pages project for `/api/*` routes.

---

## Verification (end-to-end)

- `https://<domain>/` → platform page loads.
- `https://admin.<domain>/login` → superadmin signs in; create kava `test`.
- `https://test.<domain>/login` → enter owner email → magic-link arrives from Resend; click → lands on `/welcome` on `test.<domain>` with cookie `Domain=.<domain>`.
- `https://test.<domain>/admin/products` → list renders, proving per-request Client + RLS.
- Create a customer user, sign in, place an order from `/catalog`.
- From a clean browser, try `https://other.<domain>/admin/...` with the `test` cookie — expect 401 (tenant-role guard) even though RLS would also block.
- Worker logs (`wrangler tail`) — confirm no TCP-socket errors, no driver warnings, request latency < 300 ms for cached reads.
- Neon dashboard — connections per second spike matches request volume; no idle connections piling up.
- Resend dashboard — 100% delivery on test sends.

---

## Staging via Neon Branches

Neon's free tier includes up to 10 branches at no extra cost. Use them instead of spinning up a second Postgres:

- **`main` branch** — prod data. Only GHA `deploy` workflow writes to it.
- **`staging` branch** — mirrors `main`'s schema; migrations apply here first in CI on every PR so breaking migrations fail before reaching prod.
- **`dev-<name>` branches** — one per developer. Each engineer's `.env.local` has their own `DATABASE_URL`. Reset anytime via `neonctl branches reset dev-<name> --parent main`.

A deploy to a Worker "preview" environment (Workers has per-branch preview URLs) can point at the staging Neon branch for full integration testing before promoting.

---

## CI/CD (GitHub Actions)

Two workflows.

**`.github/workflows/ci.yml`** — runs on every PR:
- `pnpm install --frozen-lockfile`
- `pnpm lint`, `pnpm fmt:check`, `pnpm typecheck`
- `pnpm -C packages/api db:migrate` against `STAGING_DATABASE_URL` (catches bad migrations before merge)
- Optionally: `wrangler deploy --env preview` to a Workers preview environment for smoke testing

**`.github/workflows/deploy.yml`** — runs on push to `main`:
- Build + migrate against `PROD_DATABASE_URL`
- `wrangler deploy` (Workers) using `CF_API_TOKEN` + `CF_ACCOUNT_ID`
- Cloudflare Pages auto-deploys on push (configured in the Pages dashboard, no GHA step needed)

Keep migrations and Worker deploy in the same workflow — if the migration fails, the Worker doesn't roll forward.

---

## Rollback

**Worker.** `wrangler rollback [deployment-id]` reverts to a previous version in seconds. List with `wrangler deployments list`. The rolled-back Worker keeps talking to the current DB schema, so only safe if the schema is backwards-compatible.

**Pages.** Cloudflare Pages keeps deploy history in the dashboard; click "Rollback to this deployment" on the desired entry. Custom domains reattach automatically.

**Database.** Drizzle does not generate down migrations. Recovery paths:
- **Neon point-in-time restore** — free tier retains 24 h of history; restore to a new branch, verify, then swap `DATABASE_URL`. This is the primary recovery path.
- **Manual revert SQL** — write and apply an inverse migration for schema changes. Keep migrations additive where possible (nullable columns, new tables) so reverts are just a `DROP`.
- **Pre-deploy dump** — for risky migrations, `pg_dump` the prod DB immediately before; the dump lives in GHA artifacts for 90 days.

Migrations should land in PRs separately from code changes that depend on them when practical — lets the Worker roll back to pre-migration code while the new schema is still in place.

---

## Initial Prod Bootstrap

The first `pnpm db:migrate` against the fresh Neon prod branch creates all tables empty. Then seed the superadmin:

- Update [`packages/api/src/db/seed.ts`](packages/api/src/db/seed.ts) to read `SUPERADMIN_EMAIL` + `SUPERADMIN_PASSWORD` from env and skip demo-kava creation when `NODE_ENV=production` (dev seed keeps the demo kava for local work).
- Run once from a local machine with the prod URL:
  ```
  DATABASE_URL=$PROD_DATABASE_URL \
  SUPERADMIN_EMAIL=you@example.com \
  SUPERADMIN_PASSWORD=$(openssl rand -base64 24) \
  NODE_ENV=production \
  pnpm db:seed
  ```
  Stash the generated password in a password manager; rotate via the UI after first login.
- Everything else (kavas, owners, customers, products) is created through the superadmin UI — no SQL inserts for prod data.

---

## Observability

- **Live logs.** `wrangler tail` streams Worker logs during smoke tests. Pages has the same under the dashboard "Functions" tab.
- **CF dashboard → Workers → Analytics.** Request volume, error rate, CPU time, latency percentiles. Free, built-in, retains 30 days.
- **Neon dashboard.** Active connections, query latency, storage used — watch for the free-tier storage ceiling (0.5 GB) and compute-hours ceiling (191 h/mo).
- **Resend dashboard.** Sent / delivered / bounced / complained. Set up a webhook into Slack or a cheap discord for bounce alerts if volume grows.
- **Errors (optional, later).** Sentry free tier is 5k events/mo — enough to catch production errors. Add via the Sentry Workers SDK (~15 lines). Not needed for phase 5; add post-ship.

No log retention at the app level for now — free CF analytics + `wrangler tail` for spot checks is enough. If audit needs grow, add a Workers Logpush job to R2.

---

## Known Limitations / Follow-ups

- **Neon free tier auto-suspends** after 5 min idle; first query adds ~500 ms–1 s. Workers don't have cold starts, so this is the only latency hiccup.
- **Resend free is 100 emails/day / 3k/mo.** Above that, Resend's paid tier starts at $20/mo; alternative EU providers (Brevo, Mailjet, Mailtrap) are ~free up to a few hundred/day.
- **Single wildcard depth.** `*.kavanow.eu` works; `api.demo.kavanow.eu` would need a separate cert.
- **No per-tenant IP-based rate limiting out of the box** — CF's Rate Limiting binding keys on whatever you pass; we key on `ip` + route the same way today's code does.
- **Better-auth on Workers.** better-auth supports Workers with `nodejs_compat`. Watch for edges around cookie signing or crypto APIs; worst case swap to `@better-auth/core` patterns.

---

## Plan B — if the refactor is too invasive

Deploy the current code **unchanged** to **Fly.io** (auto-stop shared-cpu-1x, Frankfurt region), keep nodemailer + postgres.js + in-memory rate limit. Frontend stays on Cloudflare Pages with a ~20-line Pages Function that proxies `/api/*` to Fly. Cost: ~$0–3/mo. Effort: Dockerfile + `fly.toml` + a small proxy function — a couple of hours. Keep as a fallback if you want to ship today and refactor to Workers later.
