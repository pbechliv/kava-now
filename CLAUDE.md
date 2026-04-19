# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KavaNow is a multi-tenant SaaS platform for kava bar/shop management. pnpm monorepo with three packages:

- **`packages/api`** — Hono server (Vite-powered dev, `@hono/vite-build` production) with Drizzle ORM, **better-auth**, PostgreSQL
- **`packages/web`** — React 19 SPA with React Router 7, TanStack Query, Zustand, Tailwind 4, `better-auth/react` client
- **`packages/shared`** — Zod schemas, TypeScript types, and `encodeAuthEmail`/`decodeAuthEmail` helpers (raw TS, no build step, imported via `workspace:*`)

## Commands

### Development

```bash
# Start infrastructure (Postgres + Mailpit)
docker compose -f docker-compose.dev.yml up -d

# Run API (port 3000) + Web (port 5173) together
pnpm dev
pnpm dev:api    # API only (vite dev server with @hono/vite-dev-server)
pnpm dev:web    # Web only
```

Mailpit: SMTP on `localhost:1025`, Web UI on `localhost:8025`.

### Database

```bash
pnpm db:migrate      # Run migrations
pnpm db:seed         # Seed data (includes superadmin user + demo kava)
pnpm db:reset        # Truncate all + re-seed
pnpm db:generate     # Generate migrations from schema changes
```

Scripts run via `tsx`: `packages/api/src/db/{migrate,seed,reset}.ts`. Drizzle config at `packages/api/drizzle.config.ts`; schema entry at `packages/api/src/db/schema/index.ts`.

### Quality Checks

```bash
pnpm lint            # oxlint across packages/
pnpm fmt             # oxfmt auto-format
pnpm fmt:check       # Check formatting
pnpm typecheck       # TypeScript check all packages (tsc --noEmit, pnpm -r)
```

### Build

```bash
pnpm build           # Build shared first, then API + Web in parallel
```

## Architecture

### Multi-Tenancy

Subdomain-based tenant resolution. In dev, use `lvh.me:5173` (resolves to 127.0.0.1):
- `demo.lvh.me:5173` — tenant "demo"
- `admin.lvh.me:5173` — superadmin domain
- `lvh.me:5173` — platform mode (no tenant)

`tenantMiddleware` (`packages/api/src/middleware/tenant.ts`) extracts the subdomain, looks up `kavas`, and sets the PostgreSQL session variable `app.current_kava_id` used by Row-Level Security policies. The `admin` subdomain sets `isSuperAdmin: true` and does not set `kava`/`kavaId` (RLS bypassed). The bare base domain or `localhost`/`127.0.0.1` sets `isPlatform: true`.

`AppEnv` context variables (`packages/api/src/types.ts`): `kava`, `kavaId`, `isPlatform`, `isSuperAdmin`, `user` (better-auth user with `role`/`kavaId`/`customerId`/`realEmail` additionalFields), `session`.

`requireRole` (middleware) also enforces tenant scoping: non-superadmin users must be on the subdomain of their own `kavaId`.

### Authentication (better-auth)

Auth instance in `packages/api/src/auth/index.ts` uses `betterAuth()` with:
- `drizzleAdapter(db, { provider: "pg", usePlural: true })` mapped to `users`, `sessions`, `accounts`, `verifications` tables
- `emailAndPassword` enabled (no verification required)
- `magicLink` plugin with `allowedAttempts: 3` and `storeToken: "hashed"` — multiple attempts are required because browsers/link scanners pre-fetch emailed URLs and would burn a single-use token before the user clicks (see commit `f0832b9`)
- `user.additionalFields`: `role`, `kavaId`, `customerId`, `realEmail`
- Cross-subdomain cookies: `crossSubDomainCookies` with `domain: .<baseDomainHost>` in non-localhost envs; on `localhost` each subdomain holds its own host-only cookie (browsers/PSL reject `Domain=.localhost`)
- `trustedOrigins` includes wildcard subdomain patterns for dev and prod
- Magic-link emails: the plugin's generated URL uses the static fallback `baseURL`, so `sendMagicLink` rewrites the host using the request's `x-forwarded-host`/`host` to point back to the correct tenant subdomain

**Per-kava email uniqueness via synthesized identifier** (`packages/shared/src/auth-email.ts`):
- better-auth requires `users.email` to be globally unique, but real emails can legitimately repeat across kavas.
- `encodeAuthEmail(realEmail, kavaSlug)` produces `<local>_at_<domain>--<slug>@kava.internal`, stored in `users.email`.
- The real, human-facing email lives in `users.realEmail` with a composite unique index `(realEmail, kavaId)`.
- Superadmin has no kava, so `authEmail === realEmail`.
- Whenever mail is sent from better-auth callbacks (`sendResetPassword`, `sendMagicLink`), the code must `decodeAuthEmail(user.email)` before handing the address to Nodemailer.
- Any API that accepts a login/invite email must call `encodeAuthEmail(realEmail, kava.slug)` before handing it to `auth.api.*` or writing it to `users.email`.

**Route mounting order matters** (`packages/api/src/app.ts`):
1. `tenantMiddleware`, then `authMiddleware` (which populates `user`/`session` via `auth.api.getSession({ headers })`)
2. Custom `/api/auth` routes (`/me`, `PATCH /me`, `/set-password`) registered **before** the better-auth catch-all so they are matched first
3. Rate limits on `/api/auth/sign-in/*`, `/api/auth/sign-in`, `/api/auth/magic-link`, `/api/auth/forget-password` (middleware from `packages/api/src/middleware/rate-limit.ts`)
4. `app.on(["POST","GET"], "/api/auth/*", c => auth.handler(c.req.raw))` — owns `/sign-in`, `/sign-out`, `/sign-up`, `/get-session`, `/forget-password`, `/reset-password`, `/magic-link/*`, etc.

`/api/auth/me` returns `hasPassword` derived from the presence of a credential row in `accounts` (not from a column on `users`). `PATCH /api/auth/me` keeps `users.email` in sync with `users.realEmail` via `encodeAuthEmail` when the real email changes, and catches unique-index collisions on the synthesized column to return friendly 409s.

`POST /api/auth/set-password` is a thin wrapper around `auth.api.setPassword` (better-auth's API is server-only).

### Superadmin

Global role for platform management at the `admin` subdomain:
- Backend: `packages/api/src/routes/superadmin/index.ts` — `GET /kavas`, `POST /kavas` (creates kava + owner, optionally with password, seeds default categories and products from `seed_products`), `DELETE /kavas/:id`. Guarded by `requireAuth` + `requireSuperAdmin`.
- Frontend: `SuperAdminApp` branch in `App.tsx` (`SuperAdminLayout`, `KavasPage`, `NewKavaPage`, `SettingsPage`).
- Seeding: `pnpm db:seed` creates a superadmin (`role: "superadmin"`, `kavaId: null`).

### API Route Layout

```
packages/api/src/routes/
├── auth.ts                 # custom auth endpoints (/me, PATCH /me, /set-password)
├── platform.ts             # public/platform endpoints (registration path still exists here)
├── admin/                  # owner + staff (requireAuth + requireRole("owner","staff"))
│   ├── products, categories, seed-catalog, customers, users,
│   ├── orders, dashboard, settings
├── customer/               # requireRole("customer")
│   ├── catalog, orders, profile
└── superadmin/             # requireSuperAdmin
```

`adminRoutes` applies `requireAuth` + `requireRole("owner","staff")` at the router root. `customersRouter` and `usersRouter` own the "invite staff" and "manage users per customer" flows introduced in recent commits; shared invite logic lives in `packages/api/src/services/invite-user.ts` (`inviteUserToKava` — synthesizes auth email, enforces per-kava uniqueness, triggers `auth.api.signInMagicLink` with a callback URL that lands the invitee on `/welcome` on the same subdomain).

Audit logging via `packages/api/src/services/audit.ts` (`logAudit(c, { action, targetType?, targetId?, metadata? })`), persisted in `audit_logs`.

### Database Schema

Drizzle tables (`packages/api/src/db/schema/`): `kavas`, `users`, `sessions`, **`accounts`**, **`verifications`** (both required by better-auth — replaced the old Lucia-era `magic_links` table), `categories`, `products`, `pricing_tiers`/`customer_brand_pricing`, `customers`, `orders`, `order_items`, `seed_products`, `audit_logs`.

Notable `users` columns: `email` (synthesized, globally unique), `realEmail` (human-facing; unique per `kavaId`), `role` enum (`"owner" | "staff" | "customer" | "superadmin"`), `kavaId`, `customerId`, `invitedById` (self-reference, `ON DELETE SET NULL`). Passwords live on `accounts` (better-auth's credential provider row), not on `users`.

The `postgres` driver (not `pg`) is used. RLS is enforced at the DB level for all tenant-scoped tables via the `app.current_kava_id` session variable set by `tenantMiddleware`.

### Frontend Structure

`packages/web/src/App.tsx` branches by subdomain (`isSuperAdminDomain()` / `isPlatformDomain()`):

**`TenantApp`**: `AuthLayout` (`/login`, `/auth/forgot-password`, `/auth/reset-password`, `/welcome`), `AdminLayout` under `/admin/*` (RequireAuth + RequireRole `owner|staff`; pages include products, categories, customers, customer users, customer brand pricing, orders, users, settings, dashboard), and a `CustomerLayout` (RequireRole `customer`) for `/catalog`, `/cart`, `/orders/*`, `/profile`.

**`SuperAdminApp`**: auth routes + `SuperAdminLayout` under `/superadmin/*` (kavas list, new kava, settings).

**`PlatformApp`** (bare domain): `KavaSelectPage` + reset flow.

`packages/web/src/lib/auth-client.ts` uses `createAuthClient` from `better-auth/react` with `magicLinkClient()` and `baseURL: window.location.origin` so requests go through Vite's `/api` proxy preserving the Host header (`changeOrigin: false`) for tenant resolution. **Do not hand-roll fetches to `/api/auth` routes** — use the better-auth client; a recent refactor (`6fc835b`) moved everything onto it.

`RequireAuth` / `RequireRole` guards live in `packages/web/src/components/guards/`. The `useAuth` hook wraps better-auth session + `/api/auth/me`.

### Environment

- Node >= 22 (`.nvmrc`: 24)
- pnpm 9.15.0
- Config in `packages/api/src/config.ts`; env loaded by `packages/api/src/load-env.ts` from the repo-root `.env`
- `.env.example` at the repo root documents `DATABASE_URL`, `BASE_DOMAIN`, `COOKIE_SECRET`, `SMTP_*`, `API_PORT`
- Both `packages/api/vite.config.ts` and `packages/web/vite.config.ts` call `process.loadEnvFile(...)` pointing at the root `.env` — there is no per-package env file
