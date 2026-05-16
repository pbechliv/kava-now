# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KavaNow is a multi-tenant SaaS platform for kava bar/shop management. pnpm 11 monorepo with three packages:

- **`packages/api`** — Hono server (Vite+-powered dev, `@hono/vite-build` production) with Drizzle ORM, **better-auth**, PostgreSQL
- **`packages/web`** — React 19 SPA with React Router 7, TanStack Query, Zustand, Tailwind 4, `better-auth/react` client
- **`packages/shared`** — Zod schemas, TypeScript types, and `encodeAuthEmail`/`decodeAuthEmail` helpers (raw TS, no build step, imported via `workspace:*`)

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

# Run API (port 3000) + Web (port 5173) together
pnpm dev
pnpm dev:api    # API only (vp dev with @hono/vite-dev-server)
pnpm dev:web    # Web only
```

Mailpit: SMTP on `localhost:1025`, Web UI on `localhost:8025`.

### Browser verification

`mcp__Claude_Preview__*` tools are denied for this project. To verify UI changes in a real browser, use the **Chrome MCP** tools (`mcp__Claude_in_Chrome__*` or `mcp__Control_Chrome__*`) — navigate to the relevant page on the running dev server (`pnpm dev`, defaults to `lvh.me:5173` with `demo.lvh.me:5173` / `admin.lvh.me:5173` for tenant/superadmin), then read the page, console, and network as needed.

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
- `magicLink` plugin with `storeToken: "hashed"`. **Tokens are single-use atomically** (better-auth ≥1.6.x via GHSA-hc7v-rggr-4hvx) — the old `allowedAttempts: N > 1` knob is a no-op and was removed.
- `user.additionalFields`: `role`, `kavaId`, `customerId`, `realEmail`
- Cross-subdomain cookies: `crossSubDomainCookies` with `domain: .<baseDomainHost>` in non-localhost envs; on `localhost` each subdomain holds its own host-only cookie (browsers/PSL reject `Domain=.localhost`)
- `trustedOrigins` includes wildcard subdomain patterns for dev and prod
- **Magic-link email URLs point at the SPA's `/auth/confirm` page, not at `/api/auth/magic-link/verify` directly.** `sendMagicLink` parses the token + callbackURL out of better-auth's generated URL and rewrites to `<protocol>://<tenant-host>/auth/confirm?token=...&callbackURL=...`. The confirm page ([packages/web/src/pages/auth/ConfirmPage.tsx](packages/web/src/pages/auth/ConfirmPage.tsx)) renders a button that does `fetch("/api/auth/magic-link/verify?token=...")` with **no `callbackURL`** so better-auth returns JSON instead of 302. This double-bounce defeats email-link prefetch (Mailpit preview iframe, Gmail TitanLink, Outlook SafeLinks, Chrome hover) which only fetch URLs by GET — the URL in the email is now a harmless static SPA route, and the actual token consumption only happens on a real user click. Replaces the `allowedAttempts: 3` workaround from commit `f0832b9`.

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

**`TenantApp`**: `AuthLayout` (`/login`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/confirm`, `/welcome`), `AdminLayout` under `/admin/*` (RequireAuth + RequireRole `owner|staff`; pages include products, categories, customers, customer users, customer brand pricing, orders, users, settings, dashboard), and a `CustomerLayout` (RequireRole `customer`) for `/catalog`, `/cart`, `/orders/*`, `/profile`.

**`SuperAdminApp`**: auth routes (`/login`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/confirm`) + `SuperAdminLayout` under `/superadmin/*` (kavas list, new kava, settings).

**`PlatformApp`** (bare domain): `KavaSelectPage` + reset flow.

`packages/web/src/lib/auth-client.ts` uses `createAuthClient` from `better-auth/react` with `magicLinkClient()` and `baseURL: window.location.origin` so requests go through Vite+'s `/api` proxy preserving the Host header (`changeOrigin: false`) for tenant resolution. **Do not hand-roll fetches to `/api/auth` routes** — use the better-auth client; a recent refactor (`6fc835b`) moved everything onto it.

`RequireAuth` / `RequireRole` guards live in `packages/web/src/components/guards/`. The `useAuth` hook wraps better-auth session + `/api/auth/me`.

### Environment

- Node >= 24 (`.node-version`: `24.15.0`, latest Active LTS "Krypton"). `.node-version` is the only Node pin — read by `vp env`, nodenv, asdf, fnm, and nvm-as-fallback.
- pnpm 11.1.2 (declared via `packageManager` in root [package.json](package.json); corepack-managed)
- Config in `packages/api/src/config.ts`; env loaded by `packages/api/src/load-env.ts` from the repo-root `.env`
- `.env.example` at the repo root documents `DATABASE_URL`, `BASE_DOMAIN`, `COOKIE_SECRET`, `SMTP_*`, `API_PORT`
- Both `packages/api/vite.config.ts` and `packages/web/vite.config.ts` call `process.loadEnvFile(...)` pointing at the root `.env` — there is no per-package env file
