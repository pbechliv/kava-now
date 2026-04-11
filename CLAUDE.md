# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KavaNow is a multi-tenant SaaS platform for kava bar/shop management. It's a pnpm monorepo with three packages:

- **`packages/api`** — Hono (Node.js) REST API with Drizzle ORM, Lucia auth, PostgreSQL, scrypt password hashing
- **`packages/web`** — React 19 SPA with React Router 7, TanStack Query, Zustand, Tailwind 4
- **`packages/shared`** — Zod schemas, TypeScript types, and constants shared between API and web

## Commands

### Development

```bash
# Start infrastructure (Postgres + Mailpit)
docker compose -f docker-compose.dev.yml up -d

# Run API (port 3000) + Web (port 5173) together
pnpm dev

# Run individually
pnpm dev:api    # API only
pnpm dev:web    # Web only
```

### Database

```bash
pnpm db:migrate      # Run migrations
pnpm db:seed         # Seed data
pnpm db:reset        # Truncate all + re-seed
pnpm db:generate     # Generate migrations from schema changes
```

Database scripts use `tsx` directly: `packages/api/src/db/migrate.ts`, `seed.ts`, `reset.ts`.
Drizzle config: `packages/api/drizzle.config.ts` (schema at `packages/api/src/db/schema/index.ts`).

### Quality Checks

```bash
pnpm lint            # oxlint across packages/
pnpm fmt             # oxfmt auto-format
pnpm fmt:check       # Check formatting
pnpm typecheck       # TypeScript check all packages
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

The tenant middleware (`packages/api/src/middleware/tenant.ts`) extracts the subdomain, looks up the `kavas` table, and sets a PostgreSQL session variable `app.current_kava_id` used by Row-Level Security policies. The `admin` subdomain is detected separately and sets `isSuperAdmin: true` in context (no RLS applied). All tenant-scoped tables enforce RLS at the database level.

### API Structure

Hono app (`packages/api/src/app.ts`) applies middleware in order: logger, CORS, tenant resolution, auth session. Routes are mounted at:
- `/api/auth` — Login (password or magic link), verify, logout, session, forgot/reset password, change password
- `/api/platform` — Public/platform endpoints (registration with optional password)
- `/api/admin` — Owner/staff routes (products, categories, customers, pricing, orders, dashboard, settings)
- `/api/customer` — Customer routes (catalog, orders, profile)
- `/api/superadmin` — Superadmin routes (list kavas, delete kava), guarded by `requireSuperAdmin` middleware

Context variables (`AppEnv` in `packages/api/src/types.ts`): `kava`, `kavaId`, `isPlatform`, `isSuperAdmin`, `user`, `sessionId`.

### Authentication

Hybrid authentication via Lucia v3 supporting both password login and passwordless magic links:
- **Password login**: Users with a `passwordHash` can log in with email + password. Hashing uses Node's built-in `scrypt` (`packages/api/src/auth/password.ts`).
- **Magic link login**: When no password is provided, a login token is emailed. Email sent through Nodemailer (Mailpit at `localhost:8025` in dev).
- **Password reset**: `POST /auth/forgot-password` sends a reset token email; `POST /auth/reset-password` sets the new password.
- **Password change**: `POST /auth/change-password` (authenticated). Requires current password if user already has one.
- **Registration**: Password is optional during kava owner signup. If omitted, owner receives a magic link instead.
- **`GET /auth/me`** returns `hasPassword: boolean` so the frontend can adapt the UI accordingly.

Sessions stored in PostgreSQL `sessions` table. Cookie is subdomain-scoped to support multi-tenancy.

### Superadmin

A global superadmin role for platform-level management, accessed via the `admin` subdomain (`admin.lvh.me:5173` in dev):
- **Backend**: `packages/api/src/routes/superadmin/` — list all kavas, delete a kava. Protected by `requireSuperAdmin` middleware (`packages/api/src/middleware/require-superadmin.ts`).
- **Frontend**: `SuperAdminApp` branch in `App.tsx` with `SuperAdminLayout`. Pages: login, forgot/reset password, kavas list with delete.
- **Seeding**: `pnpm db:seed` creates a superadmin user (role `"superadmin"`, no kavaId).
- Superadmin users have no tenant association and bypass RLS.

### Frontend Structure

React Router with two app branches in `packages/web/src/App.tsx`, selected by subdomain:

**`TenantApp`** (tenant subdomains):
- `AuthLayout` — `/login`, `/register`, `/auth/verify`, `/forgot-password`, `/reset-password`
- `AdminLayout` — `/admin/*` (guarded by `RequireAuth` + `RequireRole allowed={["owner","staff"]}`)
- `CustomerLayout` — `/catalog`, `/cart`, `/orders/*`, `/profile` (guarded by `RequireRole allowed={["customer"]}`)

**`SuperAdminApp`** (`admin` subdomain):
- Auth routes — `/login`, `/auth/verify`, `/forgot-password`, `/reset-password`
- `SuperAdminLayout` — `/superadmin/kavas` (guarded by `RequireAuth` + `RequireRole allowed={["superadmin"]}`)

Vite proxies `/api` requests to the API server (port 3000) and preserves the Host header for tenant resolution.

### Shared Package

`@kava-now/shared` exports Zod schemas and types consumed by both API and web. Uses raw TypeScript source exports (no build step) — imported via `workspace:*` protocol.

### Database Schema

Drizzle ORM schema in `packages/api/src/db/schema/`. Key tables: `kavas`, `users`, `sessions`, `magic_links`, `categories`, `products`, `pricing_tiers`, `customers`, `customer_products`, `orders`, `order_items`, `seed_products`. The `postgres` driver (not `pg`) is used for the connection.

Notable columns: `users.passwordHash` (nullable text — null for passwordless-only users), `users.role` enum (`"owner" | "staff" | "customer" | "superadmin"`), `magic_links.purpose` (tracks `"login"` vs `"reset"` tokens).

## Environment

- Node >= 22 (`.nvmrc`: 24)
- pnpm 9.15.0
- Config in `packages/api/src/config.ts` with env var defaults for dev
- `.env.example` in root for local setup
