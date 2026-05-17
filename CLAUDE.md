# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KavaNow is a multi-tenant SaaS platform for kava bar/shop management. pnpm 11 monorepo with three packages:

- **`packages/api`** — Hono server (Vite+-powered dev, `@hono/vite-build` production) with Drizzle ORM, **better-auth**, PostgreSQL
- **`packages/web`** — React 19 SPA with React Router 7, TanStack Query, Zustand, Tailwind 4, `better-auth/react` client
- **`packages/shared`** — Zod schemas, TypeScript types, and constants (raw TS, no build step, imported via `workspace:*`)

## Toolchain (Vite+)

The repo uses **[Vite+](https://viteplus.dev)** (`vp` CLI, installed under `~/.vite-plus`) as a unified frontend toolchain wrapping Vite, Vitest, Oxlint, Oxfmt, and Rolldown. Install once with `curl -fsSL https://vite.plus | bash`.

`pnpm-workspace.yaml` uses pnpm catalogs to pin `vite`/`vitest` to the Vite+-vendored builds (`@voidzero-dev/vite-plus-core`, `@voidzero-dev/vite-plus-test`) and overrides any transitive `vite`/`vitest` to those catalog entries. A `zod` override (`^4.4.3`) dedupes zod across better-auth's transitive deps — without it, TS emits "cannot be named without a reference to `$strip` from zod@..." errors. Build-script approval is restricted to `esbuild` via `pnpm.onlyBuiltDependencies`.

The repo-root `vite.config.ts` is **only** for `vp fmt`/`vp lint` configuration. Per-package builds live in `packages/api/vite.config.ts` and `packages/web/vite.config.ts` (both `import { defineConfig } from "vite-plus"`). Do **not** run `vp build` from the repo root — it has no entry. Use `pnpm build` or run inside a workspace.

Oxlint **rules** (`rules`) and **ignore patterns** (`ignorePatterns`) live in the root [vite.config.ts](vite.config.ts) `lint` block. Oxfmt **ignore patterns** live in the same file's `fmt.ignorePatterns` block (excluding `**/dist/**`, `**/drizzle/meta/**`, lock/min files). No separate `.oxlintrc.json` or `.oxfmtignore` — Vite+ reads everything from `vite.config.ts`.

## Commands

### Development

```bash
# Start infrastructure (Postgres + Mailpit)
docker compose -f docker-compose.dev.yml up -d

# Run API (port 3300) + Web (port 3200) together
pnpm dev
pnpm dev:api    # API only (vp dev with @hono/vite-dev-server)
pnpm dev:web    # Web only
```

Mailpit: SMTP on `localhost:1025`, Web UI on `localhost:8025`.

### Browser verification

Use the **Claude Preview MCP** tools (`mcp__Claude_Preview__*`) to verify UI changes — `preview_start` to boot the dev server if it isn't already, then `preview_snapshot` / `preview_console_logs` / `preview_network` / `preview_screenshot` to inspect. Drive interactions with `preview_click` / `preview_fill` / `preview_eval`. Routes: `/` (platform landing), `/admin/*` (superadmin), `/k/<slug>/*` (tenant). Everything runs on a single origin (`http://localhost:3200`), so the preview tools work without any subdomain trickery.

### Database

```bash
pnpm db:migrate      # Run migrations
pnpm db:seed         # Seed data (includes superadmin user + demo tenant)
pnpm db:reset        # Drop + recreate db (then run db:migrate + db:seed)
pnpm db:reseed       # Convenience: reset + migrate + seed in one command
pnpm db:generate     # Generate migrations from schema changes
```

Scripts run via `tsx`: `packages/api/src/db/{migrate,seed,reset}.ts`. Drizzle config at `packages/api/drizzle.config.ts`; schema entry at `packages/api/src/db/schema/index.ts`.

### Quality Checks

```bash
pnpm lint            # vp lint (oxlint) across packages/
pnpm fmt             # vp fmt (oxfmt) auto-format
pnpm fmt:check       # vp fmt --check
pnpm typecheck       # tsc --noEmit across packages (pnpm -r)
vp check             # Combined lint + fmt + typecheck (Vite+'s validation loop). Add --fix to auto-fix.
```

### Build

```bash
pnpm build           # Build shared (if present) first, then API + Web in parallel (each `vp build`)
```

## Architecture

### Multi-tenancy (path-based)

Tenants live under a URL path, not a subdomain. The entire app runs from a single origin (`APP_ORIGIN`, default `http://localhost:3200` in dev):

- `/` — platform landing (tenant selector / membership list)
- `/admin/*` — superadmin (tenant management)
- `/k/<slug>/*` — tenant (e.g. `/k/demo/admin/dashboard`, `/k/demo/catalog`, `/k/demo/login`)
- `/login`, `/auth/forgot-password`, `/auth/reset-password` — superadmin auth (and the canonical fallback)
- `/k/<slug>/login`, `/k/<slug>/auth/*`, `/k/<slug>/welcome` — tenant auth

API mirrors this:

- `/api/auth/*` — better-auth (global; no tenant context needed)
- `/api/auth/me`, `/api/auth/set-password` — custom auth endpoints (return memberships)
- `/api/superadmin/*` — requires `requireSuperAdmin`
- `/api/platform/*` — public utilities (e.g. `tenant-exists`)
- `/api/k/:slug/*` — tenant-scoped, mounted under a sub-router that runs `tenantMiddleware`

`tenantMiddleware` ([packages/api/src/middleware/tenant.ts](packages/api/src/middleware/tenant.ts)) reads `:slug` from the URL, resolves the tenant, sets `c.set("tenant", ...)` / `c.set("tenantId", ...)`, and sets the Postgres session variable `app.current_tenant_id` used by RLS policies. No tenant context outside `/api/k/:slug/*`.

`requireRole` ([packages/api/src/middleware/require-role.ts](packages/api/src/middleware/require-role.ts)) looks up `tenant_memberships` for the authenticated user + URL-resolved tenant and 403s if no membership matches. Superadmins bypass the lookup and get a synthetic `owner` membership. The resolved membership is exposed on the context via `c.get("membership")` (`{ role, customerId }`).

`AppEnv` context variables ([packages/api/src/types.ts](packages/api/src/types.ts)): `tenant`, `tenantId`, `user`, `session`, `membership`.

### Users + memberships (many-to-many)

`users` is global — one row per real human, identified by `users.email` (globally unique, the real email). The only cross-tenant attribute is `users.isSuperAdmin: boolean`.

`tenant_memberships(userId, tenantId, role, customerId, invitedById)` ([packages/api/src/db/schema/tenant-memberships.ts](packages/api/src/db/schema/tenant-memberships.ts)) is the relationship table: one row grants a `role` (`owner | staff | customer`) to a user inside one tenant. `customerId` is non-null only for customer-role rows, linking to a `customers` row. `(userId, tenantId)` is unique.

A single user can belong to many tenants with different roles in each. The same email can't be re-invited to the same tenant (returns 409 `InviteConflict`).

### Authentication (better-auth)

Auth instance in [packages/api/src/auth/index.ts](packages/api/src/auth/index.ts):

- `drizzleAdapter(db, { provider: "pg", usePlural: true })` mapped to `users`, `sessions`, `accounts`, `verifications` tables
- `emailAndPassword` enabled (no verification required)
- `sendResetPassword` callback dispatches via the local email service; if the redirect URL contains `/welcome`, the "invite" copy is used (otherwise the "reset" copy)
- `user.additionalFields`: `isSuperAdmin` only
- Single canonical origin (`config.appOrigin`) for `baseURL` and `trustedOrigins`. No cross-subdomain cookies — host-only cookies on one origin
- **Invite-only**: `databaseHooks.user.create.before` throws on any signup attempt. The only legitimate path to a new `users` row is the invite flow ([invite-user.ts](packages/api/src/services/invite-user.ts)), which inserts via Drizzle directly. Seed scripts ([seed.ts](packages/api/src/db/seed.ts), [demo-tenant.ts](packages/api/src/db/seeds/demo-tenant.ts)) do the same — direct `users` + `accounts` inserts using `hashPassword` from `better-auth/crypto`. **Do not call `auth.api.signUpEmail`** anywhere; it will be rejected by the hook.

**Route mounting order** ([packages/api/src/app.ts](packages/api/src/app.ts)):

1. Logger + CORS + default context middleware
2. `authMiddleware` (`auth.api.getSession({ headers })` populates `user`/`session` globally)
3. Custom `/api/auth` routes (`/me`, `PATCH /me`, `/set-password`) — registered **before** the better-auth catch-all so they match first
4. Rate limits on `/api/auth/sign-in/*`, `/api/auth/sign-in`, `/api/auth/request-password-reset`
5. better-auth catch-all: `app.on(["POST","GET"], "/api/auth/*", c => auth.handler(c.req.raw))`
6. `/api/platform`, `/api/superadmin`
7. Tenant subrouter mounted at `/api/k/:slug` — runs `tenantMiddleware`, then routes `/admin`, `/customer`, `/tenant`

`/api/auth/me` returns `{ user: { id, email, name, isSuperAdmin, hasPassword }, memberships: [{ tenantId, tenantSlug, tenantName, role, customerId, invitedBy }] }`. `hasPassword` is derived from the presence of a credential row in `accounts`. `PATCH /api/auth/me` updates `name` and/or `email` with a uniqueness check.

`POST /api/auth/set-password` is a thin wrapper around `auth.api.setPassword` (better-auth's API is server-only).

### Invite flow

[packages/api/src/services/invite-user.ts](packages/api/src/services/invite-user.ts) `inviteUserToTenant({ tenantId, email, name, role, customerId, inviterId })`:

- If a user with that email already exists globally: insert the membership and send a "you've been added to X" notification via [MembershipAddedEmail.tsx](packages/api/src/emails/MembershipAddedEmail.tsx). They sign in with their existing password.
- If new: create the user (no password), insert the membership, send a set-password invite via [SetPasswordEmail.tsx](packages/api/src/emails/SetPasswordEmail.tsx) with `redirectTo = ${config.appOrigin}/k/${slug}/welcome`.

`InviteConflict` fires when the user already has a membership in this tenant. Email send failures are non-fatal — the membership is persisted regardless.

### Superadmin

`isSuperAdmin: boolean` on `users`. Lives at `/admin/*` (no slug). Bypasses `requireRole` for tenant routes. Can use the in-app tenant switcher to enter any tenant they have a membership in. Seeded by `pnpm db:seed` with `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` (defaults in [seeds/superadmin.ts](packages/api/src/db/seeds/superadmin.ts)). The demo seed grants the superadmin an owner membership in the demo tenant.

### API route layout

```
packages/api/src/routes/
├── auth.ts                 # /api/auth/{me, set-password}
├── platform.ts             # /api/platform/* (public, no auth)
├── admin/                  # owner + staff (requireAuth + requireRole("owner","staff"))
│   ├── products, categories, customers, users, orders, dashboard, settings
├── customer/               # requireRole("customer")
│   ├── catalog, orders, profile
└── superadmin/             # requireAuth + requireSuperAdmin
```

`adminRoutes`/`customerRoutes` are mounted under the tenant subrouter (`/api/k/:slug/admin/*`, `/api/k/:slug/customer/*`). They apply `requireAuth` + `requireRole(...)` at the router root.

### Database schema

Drizzle tables ([packages/api/src/db/schema/](packages/api/src/db/schema/)): `tenants`, `users`, `tenant_memberships`, `sessions`, **`accounts`**, **`verifications`** (both required by better-auth), `categories`, `products`, `customer_brand_pricing`, `customers`, `orders`, `order_items`.

The `postgres` driver (not `pg`) is used. RLS is enforced at the DB level for tenant-scoped tables (categories, products, customers, customer_brand_pricing, orders, order_items) via the `app.current_tenant_id` session variable set by `tenantMiddleware`. `users` and `tenant_memberships` are global — tenant scoping for those is enforced in application code via `requireRole`.

### Orders + ERP transmission

`erp_status` (`pending | transmitted`) on `orders` is **orthogonal** to fulfillment `status` — an order can be `delivered` and `transmitted` independently. Transmission is recorded via `PATCH /api/k/:slug/admin/orders/:id/erp` with the AADE MARK; the endpoint is one-shot (409 on retry). `products.erpRef` is the ERP-side code; the name is **intentionally abstract** (not `galaxyCode`) so a future ERP swap doesn't require renaming.

`erp_status='transmitted'` is a **hard lock** — line items can no longer be added/edited/cancelled/replaced. Enforced by `assertOrderMutable` in [routes/admin/orders.ts](packages/api/src/routes/admin/orders.ts), which also rejects mutations when the order's fulfillment status isn't `pending` or `confirmed`.

`order_items.status` (`active | cancelled`) + `replacedByItemId` form a soft-cancel/replacement chain: cancelled lines stay in the table for audit. Totals and item counts must filter `status='active'` — see the SQL `filter (where ... = 'active')` clauses in the orders list query.

### Frontend structure

[packages/web/src/App.tsx](packages/web/src/App.tsx) is a single React Router tree:

- `/` → `TenantSelectPage` (renders a tenant-slug input for anonymous users; renders the list of memberships for logged-in users)
- `/login`, `/auth/forgot-password`, `/auth/reset-password` → superadmin auth (also serves as canonical fallback)
- `/admin/*` → `SuperAdminLayout` (RequireAuth + RequireRole `superadmin`) — `tenants`, `tenants/new`, `settings`
- `/k/:slug/login`, `/k/:slug/auth/*`, `/k/:slug/welcome` → tenant auth
- `/k/:slug/admin/*` → `AdminLayout` (RequireAuth + RequireRole `owner|staff`) — products, categories, customers, customer users, customer brand pricing, orders, users, settings, dashboard
- `/k/:slug/{catalog, cart, orders, orders/:id, profile}` → `CustomerLayout` (RequireRole `customer`)
- `/k/:slug` → `HomePage` (redirects to the user's home based on their membership in this tenant)

[packages/web/src/lib/auth-client.ts](packages/web/src/lib/auth-client.ts): `createAuthClient` from `better-auth/react` with `baseURL: window.location.origin`. Requests flow through Vite's `/api` proxy. **Do not hand-roll fetches to `/api/auth` routes** — use the better-auth client.

[useAuth](packages/web/src/lib/hooks/use-auth.ts) wraps `/api/auth/me` and exposes `{ user, memberships, currentMembership, tenant, isAuthenticated }`. `currentMembership` is the membership matching the current URL `:slug` (if any).

[useTenantApi](packages/web/src/lib/hooks/use-tenant-api.ts) is a small wrapper around `api` that prefixes all paths with `/api/k/<slug>` (slug from `useParams`). All admin/customer-scoped data hooks use it.

[TenantSwitcher](packages/web/src/components/TenantSwitcher.tsx) is a shared dropdown section embedded in all three layouts' user menus. Shows the user's other memberships (and an "Admin" link if they're a superadmin not currently on `/admin/*`).

`RequireAuth` / `RequireRole` guards live in [packages/web/src/components/guards/](packages/web/src/components/guards/). `RequireRole` accepts `["superadmin", "owner", "staff", "customer"]` and reads role from `currentMembership` (superadmin bypasses).

### Environment

- Node >= 24 (`.node-version`: `24.15.0`). `.node-version` is the only Node pin — read by `vp env`, nodenv, asdf, fnm, and nvm-as-fallback.
- pnpm 11.1.2 (declared via `packageManager` in root [package.json](package.json); corepack-managed)
- Config in [packages/api/src/config.ts](packages/api/src/config.ts); env loaded by [packages/api/src/load-env.ts](packages/api/src/load-env.ts) from the repo-root `.env`
- [.env.example](.env.example) documents `DATABASE_URL`, `APP_ORIGIN`, `COOKIE_SECRET`, `SMTP_*`, `RESEND_*`, `API_PORT`, `SUPERADMIN_*`, `SEED_DEMO`, `DEMO_CUSTOMER_*`
- Both [packages/api/vite.config.ts](packages/api/vite.config.ts) and [packages/web/vite.config.ts](packages/web/vite.config.ts) call `process.loadEnvFile(...)` pointing at the root `.env` — there is no per-package env file
