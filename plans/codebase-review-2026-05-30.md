# KavaNow Codebase Review — Findings

**Date:** 2026-05-30
**Scope:** Full codebase sweep — `packages/api`, `packages/web`, `packages/shared`, infra/deployment, tooling.
**Method:** Parallel directed reviews per area; the highest-stakes claims (RLS, auth secret, tenant-create, pooling) were verified directly against the code.

## Summary

The code is well-structured and the deployment plan is thorough. The advertised multi-tenant RLS layer was a no-op (**C1, now fixed and tested**); one concrete data-loss bug in tenant creation (**C2**) and a cart cross-tenant bleed (**C3**) remain.

- 🔴 **4 Critical** — **C1 fixed** (RLS now enforced, with tests); **C4 downgraded** (RLS now blocks the cross-tenant read it described); **C2, C3 open**.
- 🟠 **5 High** — still open.
- 🟡 **9 Medium** — still open.
- 🟢 **10 Low** — still open.
- **6 quick wins fixed** and merged to `main` (commit `d1a112e`).
- Several items are **deferred by design** in the deployment superplan (not bugs).

Severity legend: **Critical** = data leak / data loss / auth bypass. **High** = security or correctness gap with real exposure. **Medium** = correctness/perf/maintainability with bounded blast radius. **Low** = hygiene/polish.

---

## ✅ Fixed (merged to `main`, commit `d1a112e`)

| Fix | Files |
| --- | --- |
| Removed stale SvelteKit leftover dirs + gitignored `build/`, `.svelte-kit/` | `packages/web/{.svelte-kit,build}`, `.gitignore` |
| Docker healthcheck on `api` service; Caddy waits on `condition: service_healthy` | `docker-compose.yml` |
| Invalidate the admin dashboard query after order-item edits | `packages/web/src/lib/hooks/use-admin-orders.ts` |
| Replaced `window`-global search debounce with `useRef` + unmount cleanup | `packages/web/src/pages/customer/CatalogPage.tsx` |
| WelcomePage routes to tenant home after set-password (no login dead-end) | `packages/web/src/pages/auth/WelcomePage.tsx` |
| Gate superadmin/demo credential logging behind non-production | `packages/api/src/db/seed.ts`, `packages/api/src/db/seeds/demo-tenant.ts` |

Also already addressed (pre-existing staged work, commit `9610619`): rate limiter now prefers `X-Real-IP`, so it keys on the real client IP behind Cloudflare/Caddy (`packages/api/src/middleware/rate-limit.ts`).

---

## 🔴 Critical — open (production blockers)

### C1. RLS tenant isolation is not enforced (two compounding defects) — ✅ FIXED

**Status:** Fixed on branch (uncommitted at time of writing). Verified by an integration test suite (`packages/api/src/db/rls.test.ts`) that passes against a live Postgres connected as the non-superuser app role: reads scope to the active tenant, cross-tenant writes are rejected (WITH CHECK), no-context reads return zero rows (fail-safe, no error), and tenant context does not leak across concurrent requests. Wired into CI (`ci.yml` now runs a Postgres service + migrate + the suite).

**What was done:**
- `connection.ts` — the server connects via `config.appDatabaseUrl`; a request-scoped transaction (`runWithTenant`) sets `app.current_tenant_id` **transaction-locally** and an `AsyncLocalStorage`-backed `db` proxy routes every query onto that transaction's connection. The var auto-clears on commit/rollback → no cross-request leak. Zero changes to the ~30 query call sites.
- `tenant.ts` — wraps the rest of the request in `runWithTenant(tenant.id, () => next())`.
- `migrate.ts` — provisions a `NOSUPERUSER` `kavanow_app` role (idempotent) with DML-only grants + default privileges. The server connects as it; migrations/seeds keep the privileged role.
- `rls.sql` — policies now use a `current_tenant_id()` helper (`nullif(current_setting(...), '')::uuid`) so an unset/reverted GUC fails safe (zero rows) instead of erroring on `''::uuid`.
- `docker-compose.yml` / `.env*.example` — `api` connects as `kavanow_app` via `APP_DATABASE_URL` (built from `APP_DB_PASSWORD`); `api-jobs` keeps the privileged URL.

---

**Original finding (for reference):** Two defects together made every RLS policy in `rls.sql` dead:

- **Wrong scope on a shared pool.** `tenantMiddleware` runs `set_config('app.current_tenant_id', …, false)` — *session*-scoped — on the shared `postgres()` pool, outside any transaction. Handler queries (`db`) run on a different pooled connection, so they either see no setting (RLS returns **zero rows** → flaky reads) or a **stale tenant id from a prior request → cross-tenant exposure** under concurrency. The var is also never reset, and the `if (!slug)` branch never clears a previously-set value.
- **Superuser bypass.** Production connects as `kavanow` (`docker-compose.yml:33`), the Postgres image's bootstrap **superuser**. Superusers bypass *all* RLS; `FORCE ROW LEVEL SECURITY` does **not** apply to them. No `NOSUPERUSER` app role exists.

**Fix:** (a) wrap each tenant request in a transaction and set the var transaction-locally (`select set_config('app.current_tenant_id', $1, true)` with `true`), routing all handler queries through `tx`; (b) create a dedicated `NOSUPERUSER` login role with DML-only grants and point `DATABASE_URL` at it (keep DDL/migrations on the privileged role); (c) add a test asserting zero cross-tenant rows leak.

> Note: the superplan's own RLS verification step (§5) connects as `kavanow` and would surface this on first deploy — but no fix is planned.

### C2. Creating a tenant *with a password* orphans the tenant

**Location:** `packages/api/src/routes/superadmin/index.ts:97` (+ hook at `packages/api/src/auth/index.ts:52`).

`POST /api/superadmin/tenants` with a `password` calls `auth.api.signUpEmail(...)`, but the invite-only `databaseHooks.user.create.before` hook unconditionally throws "Signup is disabled". The `tenants` row is already inserted (`:76`) with no surrounding transaction, so the request 500s and leaves a **tenant with no owner membership** that nobody can log into. CLAUDE.md explicitly says never call `signUpEmail`.

**Fix:** insert the `users` + `accounts` credential rows directly with `hashPassword` (as the seed scripts do), and wrap tenant + user + membership creation in one `db.transaction`.

### C3. Cart bleeds across tenants

**Locations:** `packages/web/src/lib/store/cart.ts`, wired in `CatalogPage.tsx` / `CartPage.tsx`, badge in `CustomerLayout.tsx`.

The `persist` middleware hydrates synchronously at module load when the slug is empty (unscoped key `kavanow-cart`); `setCartSlug(slug)` is called later during render and **no `rehydrate()` ever fires**. A user in two tenants sees one tenant's cart items — with the wrong prices/product IDs — under another, and can submit them.

**Fix:** set the slug before hydration and force a rehydrate on slug change from `CustomerLayout` (e.g. `skipHydration: true` + `persist.setOptions` + `persist.rehydrate()` in a `useEffect([slug])`), or key the whole store by slug. Single source the slug wiring in the layout, not per-page in render.

### C4. Customer reads rely solely on RLS (no app-level `tenantId` filter) — ⬇️ DOWNGRADED (mitigated by C1 fix)

**Locations:** `packages/api/src/routes/customer/catalog.ts:59-67,78-97,240` (reorder), `packages/api/src/routes/customer/profile.ts:24,71`.

Product/category/profile queries filter by id (and `active`) only, with no `tenantId`. **Now that RLS is enforced (C1), these queries run inside the tenant transaction, so RLS blocks the cross-tenant read/edit via guessed IDs** — the exploit is closed. Adding explicit `eq(table.tenantId, tenant.id)` filters remains worthwhile **defense-in-depth** (don't rely on RLS as the only guard), but this is no longer Critical — treat as 🟡 Medium.

**Fix:** add explicit `eq(table.tenantId, tenant.id)` to every customer-side query, mirroring the admin routes.

---

## 🟠 High — open

### H1. No env validation at boot; `COOKIE_SECRET` is dead config; `betterAuth` has no `secret`

**Locations:** `packages/api/src/config.ts:11`, `packages/api/src/auth/index.ts` (no `secret` field).

`config.cookieSecret` defaults to a known placeholder and is referenced nowhere; `betterAuth({})` has no `secret`, so it relies on `BETTER_AUTH_SECRET` from env (undocumented in dev `.env.example`). A misconfigured prod deploy can boot with insecure/ephemeral secrets. (The superplan sets `BETTER_AUTH_SECRET` in env, which avoids per-restart session death — but adds no validation and leaves `COOKIE_SECRET` unused.)

**Fix:** parse `process.env` through Zod at boot; in production, throw if `BETTER_AUTH_SECRET`/`DATABASE_URL`/`APP_ORIGIN` are missing or equal the dev defaults. Wire the chosen secret into `betterAuth`.

### H2. No graceful shutdown — deploys drop in-flight requests

**Location:** `packages/api/vite.config.ts` (missing `shutdownTimeoutMs`).

`@hono/vite-build/node` only installs SIGTERM/SIGINT handlers when `shutdownTimeoutMs` is passed. Without it, `docker compose up -d api` SIGKILLs the API after the grace window — no connection draining.

**Fix:** pass `shutdownTimeoutMs: 10000` to `build({ ... })`.

### H3. CORS reflects any origin with credentials

**Location:** `packages/api/src/app.ts:22`.

`origin: (origin) => origin, credentials: true` echoes back any requesting origin and allows credentials, widening CSRF/credential-theft surface. The app is single-origin.

**Fix:** restrict `origin` to an allowlist of `config.appOrigin`.

### H4. No tests in CI, and none for the API

**Locations:** `.github/workflows/ci.yml`, root `package.json` (no `test` script), `packages/api` (no tests).

CI runs typecheck/lint/fmt/build only. The two web tests are effectively dead (no root `test` script). The most security-sensitive code (RLS, pricing, invite flow, order hard-lock) has zero coverage — which is how C1/C2/C4 went unnoticed.

**Fix:** add a root `"test": "pnpm -r --if-present test"` and a `pnpm test` step in CI; add Vitest + integration tests to `packages/api` (cross-tenant isolation, `assertOrderMutable`, soft-cancel totals, invite flow).

### H5. `db:reset` hardcodes the DB name and has no prod guard

**Location:** `packages/api/src/db/reset.ts:13`.

`DROP DATABASE IF EXISTS kavanow` ignores the DB name in `DATABASE_URL` and has no `NODE_ENV` guard. `pnpm db:reset` against a prod URL silently destroys data.

**Fix:** parse the DB name from `DATABASE_URL`; refuse when `NODE_ENV === "production"` (or require an explicit `--force`).

---

## 🟡 Medium — open

### M1. Missing indexes on hot FK/tenant columns

**Location:** migration `packages/api/drizzle/0000_superb_chimera.sql`.

No index on `orders.tenant_id`, `orders.customer_id`, `order_items.order_id`, `order_items.product_id`, `products.category_id`. Orders list, customer orders, dashboard, and per-order item fetch all sequential-scan as data grows; `order_items` joins are worst.

**Fix:** add btree indexes on `orders(tenant_id, created_at)`, `orders(customer_id)`, `order_items(order_id)`, `order_items(product_id)`, `products(category_id)` in the Drizzle schema, regenerate the migration.

### M2. `set-password` swallows better-auth failures

**Location:** `packages/api/src/routes/auth.ts:33`.

`auth.api.setPassword(...)` is awaited but its result is discarded; `{ success: true }` is always returned. If better-auth declines (e.g. user already has a credential), the client is told it succeeded.

**Fix:** inspect the result and surface failures, or guard with a "has password" check first.

### M3. Order status update: read-then-write, no lock, no `tenantId` in the UPDATE

**Location:** `packages/api/src/routes/admin/orders.ts:207-238` (also the `/erp` one-shot and item mutations).

Transition is validated against a `SELECT`ed status, then `UPDATE … WHERE eq(orders.id, id)` with no `FOR UPDATE` and no `tenantId` in the WHERE → double-apply race; inconsistent with other mutations.

**Fix:** do the guarded read + update in one transaction with `FOR UPDATE`, and include `eq(orders.tenantId, tenantId)` in the UPDATE.

### M4. Legacy `/api/auth/forget-password` alias is unthrottled

**Location:** `packages/api/src/app.ts:48-50`.

Rate limits cover `/sign-in`, `/sign-in/*`, `/request-password-reset`, but better-auth also serves the legacy `/api/auth/forget-password` alias, which is not limited — enables email-bombing / token churn. (Real-IP keying is already improved; the per-process `Map` is moot on the single-VM deploy.)

**Fix:** register the forgot-password limiter on `/api/auth/forget-password` too; optionally throttle `set-password`.

### M5. RLS DDL lives outside Drizzle's migration graph

**Location:** `packages/api/src/db/migrate.ts:22` applies `rls.sql` via `sql.unsafe()`.

RLS isn't tracked in `drizzle/meta`. A new tenant-scoped table or a `drizzle-kit push` ships with RLS disabled, and policies can silently drift from the schema.

**Fix:** move RLS into a tracked Drizzle SQL migration (or in-schema `pgPolicy`/`.enableRLS()`), so it's part of the migration graph and CI can detect drift.

### M6. `Product.basePrice` type lie (numeric → string)

**Locations:** `packages/shared/src/types/index.ts:62`, `packages/api/src/routes/admin/products.ts:90`, `packages/web/src/lib/api.ts:55`.

`basePrice: number` is declared, but PG `numeric` is returned as a **string** and selected raw; the client casts responses with no runtime validation. Any arithmetic on `basePrice` silently concatenates. (Catalog dodges it via a computed `resolvedPrice`.)

**Fix:** serialize numerics to `number` in the API (or change the shared type to `string`), and validate responses against shared Zod schemas at the client boundary instead of unchecked casts.

### M7. `:latest` image tag floats in the compose default

**Locations:** `docker-compose.yml:26,43,58`, `.github/workflows/build-images.yml`.

Builds push `:<sha>` + `:latest`; compose defaults to `${IMAGE_TAG:-latest}`. Deploy pins the SHA, but any manual `compose up` on the VM without `IMAGE_TAG` grabs the floating `latest` (possibly a half-built image).

**Fix:** drop the `:latest` tag from the build matrix, or make the compose default fail loudly (`${IMAGE_TAG:?IMAGE_TAG required}`).

### M8. `customer_brand_pricing` has no `tenantId` column

**Location:** `packages/api/src/db/schema/customer-brand-pricing.ts`.

Isolation rides on a `customerId` join + an RLS subquery only. Currently safe because `customerId` is tenant-checked when resolved, but it makes future direct queries easy to get wrong.

**Fix:** denormalize `tenantId` onto the table (or document the invariant prominently and add a direct RLS policy).

### M9. Web build `tsc -b` is a no-op

**Locations:** `packages/web/package.json` (`build: "tsc -b && vp build"`), `packages/web/tsconfig.json` (not composite, no references).

`tsc -b` on a non-composite project does nothing useful, so the build's apparent typecheck gate is illusory (real typecheck is `pnpm typecheck`). Vite config files are also excluded from typecheck/lint.

**Fix:** drop `tsc -b` from web's build (rely on `pnpm typecheck`), or convert to a proper composite/references setup; add a `tsconfig.node.json` covering config files.

---

## 🟢 Low — open

| ID | Finding | Location |
| --- | --- | --- |
| L1 | GH Actions pinned to mutable tags (`@v6`) — **deliberate per plan**; Dependabot covers updates | `.github/workflows/*` |
| L2 | Layout duplication across Admin/Customer/SuperAdmin; `initials()` copy-pasted | `packages/web/src/.../*Layout.tsx` |
| L3 | No code-splitting — `xlsx`/`papaparse` ship in the initial bundle for all users | `packages/web/src/App.tsx` |
| L4 | `useAuth` re-runs Sentry effects every render (derived objects in deps) | `packages/web/src/lib/hooks/use-auth.ts:45` |
| L5 | `OrderDetailPage.tsx` is 653 lines (mixes header, customer panel, ERP, item table) | `packages/web/src/pages/admin/OrderDetailPage.tsx` |
| L6 | `.dockerignore` incomplete vs `.gitignore`; dev `mailpit:latest` unpinned; dev Postgres 16 vs prod 17 | `.dockerignore`, `docker-compose.dev.yml` |
| L7 | `API_PORT` runtime env is a no-op (baked at build time) — misleading | `docker-compose.yml:34` |
| L8 | `noUnusedLocals`/`noUnusedParameters` disabled for web only | `packages/web/tsconfig.json` |
| L9 | `.env.example` (dev) missing `BETTER_AUTH_SECRET` | `.env.example` |
| L10 | Doc drift: CLAUDE.md describes `/api/platform/*` + `routes/platform.ts` that don't exist | `CLAUDE.md` |
| L11 | 401 interceptor does a full-page `window.location.href` redirect (drops SPA state) | `packages/web/src/lib/api.ts:27` |
| L12 | `RequireRole` tenant-mismatch silently bounces with no explicit 403 message | `packages/web/src/components/guards/RequireRole.tsx:31` |
| L13 | Query keys use raw filter objects → cache fragmentation across transient filter states | `use-products.ts`, `use-admin-orders.ts`, `use-catalog.ts`, … |

---

## Deferred by design (in the superplan — not bugs)

- **Sentry sourcemap upload** — wired but not yet implemented (no `@sentry/vite-plugin`; token not mounted in the Dockerfile). Planned in superplan §2.4/§4.2.
- **SSH open to the world** on port 22 (`infra/terraform/main.tf:9-14`) — day-1 trade-off to avoid lockout.
- **Origin 80/443 open to the world** (`infra/terraform/main.tf:16-28`) — Cloudflare-bypass surface; deferred (§8/§9).
- **No logical/offsite DB backup** — Hetzner whole-VM snapshots only, 7-day, same account (§8/§9).
- **Schema-incompatible rollback** — re-deploying an older SHA re-runs migrations; escape hatch is a snapshot restore (§6/§8).

---

## Recommended next steps

1. **One focused "tenant isolation" PR** covering C1 + C2 + C4 (and retiring M5, M8), with cross-tenant integration tests. This is the production gate.
2. **C3 (cart)** as a separate web PR.
3. **H1/H2/H3/H5** as a small "prod hardening" PR (env validation, graceful shutdown, CORS allowlist, db:reset guard).
4. **H4 (tests)** — stand up Vitest in the API and wire `pnpm test` into CI; the isolation tests from step 1 land here.
5. Fold C1/C2 remediation into `plans/deployment-superplan.md` before its §5 cutover, since the plan's own RLS check would otherwise stall the first deploy.
