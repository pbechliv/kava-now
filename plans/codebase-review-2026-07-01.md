# KavaNow Codebase Review — 2026-07-01

**Scope:** Full sweep — `packages/api` (routes, services, middleware), DB schema + migrations, `packages/web`, `packages/shared`, cross-cutting contracts, tests, tooling.
**Method:** Four parallel directed reviews per area; every High finding below was verified directly against the code (several agent claims were rejected on verification — see "Rejected on verification").
**Baseline:** Follows up on `plans/codebase-review-2026-05-30.md`. This codebase is in noticeably better shape than at the last review: RLS is enforced and tested, env validation is strict, the error-code contract (`API_ERROR_CODES`) is shared and mapped, order-status transitions are centralized, numeric-as-string is modeled consistently, and composite FKs make cross-tenant links unrepresentable. The findings below are the next layer down: contract polish, constraint hardening, and web-side abstraction.

---

## Status of the 2026-05-30 backlog

| ID  | Finding                                            | Status 2026-07-01                                                                 |
| --- | -------------------------------------------------- | --------------------------------------------------------------------------------- |
| M2  | `set-password` swallows better-auth result         | **Still open** — `routes/auth.ts:41-45` awaits, discards, returns `success: true` |
| M4  | `/api/auth/forget-password` alias unthrottled      | **Still open** — `app.ts:55-56` limits only `/sign-in/*` + `/request-password-reset`; the legacy alias is served by the catch-all with no limiter |
| M6  | `basePrice` type lie (numeric → string)            | ✅ Fixed — shared types model numerics as `string`, documented convention          |
| M7  | `:latest` image tag floats in compose default      | **Still open** — `docker-compose.yml:42,83,103` default `${IMAGE_TAG:-latest}`    |
| M9  | Web build `tsc -b` is a no-op                      | **Still open** — `packages/web/package.json:8` still `"tsc -b && vp build"`       |
| L5  | 653-line `OrderDetailPage`                         | ✅ Fixed — decomposed into `components/admin/order-detail/` sections              |
| L3  | No code-splitting                                  | ✅ Fixed — routes lazy-load via `lazyRouteComponent`                              |

---

## 🔴 High

### H1. Zod validation errors are silently dropped by the web client

The one genuine cross-package contract bug found in this sweep.

- **API side:** every zod failure returns `{ error: parsed.error.flatten().fieldErrors }` — `error` is an **object** (e.g. `routes/admin/customers.ts:87,150,271,426,520`, `routes/admin/orders.ts:69,213,277`, `routes/admin/categories.ts:91,125`, `routes/auth.ts:39`).
- **All other errors** return `{ error: string, code?: ApiErrorCode }`.
- **Web side:** `lib/api.ts:83` does `typeof data.error === "string" ? data.error : (data.message ?? res.statusText)` — there is no `message` field, so **every field-level validation message collapses to a generic "Bad Request"**. Users submitting an invalid form via any path that bypasses client-side validation (or where client/server rules drift) get zero actionable feedback.

**Fix:** standardize the validation-error shape once:

```ts
// api: shared helper
return c.json({ error: "Validation failed", code: API_ERROR_CODES.VALIDATION_ERROR,
                fields: parsed.error.flatten().fieldErrors }, 400);
```

Add `fields?: Record<string, string[]>` to the web `ApiError`, render field messages in forms. One `validationError(c, parsed.error)` helper in the API kills ~20 copy-pasted lines at the same time.

### H2. Mutation responses are untyped — silent contract drift

`{ success: true }` (and variants) are returned ad-hoc across `admin/users.ts` (7 sites), `admin/customers.ts` (4), `admin/products.ts` (2), `routes/auth.ts`, while web hooks re-declare the shape at each call site (`use-users.ts:29,39,48,56`, `use-auth.ts:114`, `use-products.ts:93` — the latter already drifted to `{ success: boolean; product?: Product }`). List/detail responses correctly use shared types + `satisfies PreSerialize<...>`; mutations are the untyped gap.

**Fix:** add `SuccessResponse` / `DeleteProductResponse` etc. to `packages/shared/src/types/responses.ts`, apply the same `satisfies` pattern on mutation returns, import in hooks. Mechanical, ~1 hour, closes the whole class.

### H3. Missing CHECK constraints on business-rule-bounded numerics

Only one CHECK exists in the whole schema (`tenant_memberships_customer_role_check`, migration `0003`). Missing, all verified absent:

- `order_items.quantity > 0` (and `original_quantity IS NULL OR original_quantity > 0`) — a negative quantity silently corrupts totals, which are `SUM(... ) FILTER (WHERE status='active')` aggregates.
- `customer_brand_pricing.discount_pct BETWEEN 0 AND 100` — `numeric(5,2)` admits `999.99` and negatives; a bad value miscomputes every price for that customer/brand.
- `product_imports` counters `>= 0` (audit-integrity, lower stakes).

App code validates today, but these are financial invariants — the DB should be the backstop, same philosophy as the existing composite FKs. One `db:generate` migration.

---

## 🟡 Medium

### M1. No usable index for tenant-wide customer scans

`customers` has only `customers_tenant_erp_ref_idx` — **partial** (`WHERE erp_ref IS NOT NULL`), so the planner can't use it for general tenant listing — and `customers_id_tenant_idx` (leads on `id`). The admin customers list and the RLS predicate (`tenant_id = current_tenant_id()`) both scan. Categories does **not** have this problem (`categories_tenant_name_lower_idx` is a full composite leading on `tenant_id`).

**Fix:** `index("customers_tenant_idx").on(table.tenantId)` — or make the erp_ref index non-partial and treat NULLs via `NULLS NOT DISTINCT`.

### M2. Repeated modal/form-state boilerplate across admin pages

Every admin list page re-implements `[modalOpen, setModalOpen]` + `[editId, setEditId]` + close/reset handlers with drifting names (`editId` / `editTarget` / `editProductId`) — `products-page.tsx:47-48`, `customers-page.tsx:29-30`, `categories-page.tsx:27-28`, plus the customer-users and order-item dialogs. A `useFormModal<T>()` hook (`{ isOpen, item, openCreate(), openEdit(item), close() }`) removes the boilerplate and fixes the related stale-form-flash in `product-form-modal.tsx:60-94`, where two uncoordinated `useEffect`s race on reopen.

### M3. Mutation-error surfacing is inconsistent in the web app

Same failure class, four behaviors: inline `<p>` (`cart-page.tsx:357`), modal-footer text (`product-form-modal.tsx:348`), above-submit text (`category-form-modal.tsx:173`), and toast-or-nothing elsewhere. Combined with H1 this means some failures are effectively invisible. Pick one convention (suggest: forms show `mutation.error.message` + field errors in place; non-form mutations toast) and enforce it.

### M4. Rate-limit + auth polish (carried over, still worth closing)

- `forget-password` alias unthrottled (`app.ts:55-56`) — email-bombing vector; one extra `app.use` line.
- `set-password` returns `{ success: true }` unconditionally (`routes/auth.ts:41-46`); inspect the better-auth result (or pre-check `hasPassword`) so the client can't be told a failed set succeeded.
- `PATCH /notification-preference` (`admin/settings.ts:64-77`) hand-rolls `c.get("tenantId") / c.get("user")` + manual 401 instead of the `getTenantId`/`getUser` context helpers used everywhere else. Same route: a superadmin with no real membership row gets a confusing 404 from the `UPDATE ... RETURNING` miss.

### M5. Product delete pre-check is racy (mitigated, but tighten)

`admin/products.ts:451-507` counts order-item references, then decides soft- vs hard-delete outside a lock; a concurrent order insert between check and delete flips the decision. The deferred FK catch is the correct backstop (and the code says so), so this can't lose data — but the check-then-act shape invites copy-paste into places without a backstop. Fold the count + delete into the existing transaction (`SELECT ... FOR UPDATE` on the product) or drop the pre-check and branch on the FK violation alone.

### M6. API route test coverage is uneven

Well covered: admin/customer orders, products, users, auth, push, RLS, services (pricing, invite, create-tenant). **Zero coverage:** `admin/categories.ts` (parent-cycle detection is exactly the kind of logic that regresses), `admin/customers.ts` (soft/hard delete branching), `admin/dashboard.ts`, `admin/settings.ts`, `customer/catalog.ts` (brand-discount pricing resolution — customer-facing money), `customer/profile.ts`. Web has no component/page tests at all (3 lib-only test files) — acceptable for now, but the catalog/cart price-reconciliation logic is worth one test.

---

## 🟢 Low

| ID  | Finding                                                                                                                              | Location                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| L1  | Duplicate `categoryInTenant`/`categoryExistsInTenant` helpers                                                                        | `admin/products.ts:68`, `admin/categories.ts:32`               |
| L2  | Item-mutation responses use four field names (`item`/`updated`/`cancelled`/`newItem`) for the same concept                            | `admin/orders.ts:538-801`                                      |
| L3  | UUID path params unvalidated — invalid ids round-trip to PG 22P02 → generic 400 instead of a precise message                          | all `:id` routes (works, just imprecise)                       |
| L4  | FK-constraint names hardcoded as strings at catch sites instead of one constants module                                               | `admin/orders.ts:411`, `admin/products.ts:489`                 |
| L5  | Cart quantity `<input type="number">` accepts decimals; `parseInt` silently truncates; cart-table +/- buttons lack aria-labels (catalog versions have them) | `cart-page.tsx:191-210`                                        |
| L6  | Root-level `Sentry.ErrorBoundary` fallback is a bare `<div>` for the whole app — a per-layout boundary would preserve nav/recovery    | `main.tsx:77`                                                  |
| L7  | Spinner-only loading states; no skeletons on list pages                                                                              | all list pages                                                 |
| L8  | Query keys embed the raw filters object — fine for TanStack's structural hashing, but unnormalized transient states (e.g. `""` vs absent) fragment the cache | `use-admin-orders.ts:27`, `use-products.ts:41`                 |
| L9  | No dirty-form guard on modal close; no clamp/redirect when `?page=` exceeds the last page                                            | form modals, list pages                                        |
| L10 | UI copy is Greek but hardcoded inline (plus one Greek string in an API error, `admin/customers.ts:160`) — fine until a second locale; a `lib/messages.ts` would future-proof | throughout web                                                 |
| L11 | `:latest` compose default (`IMAGE_TAG:-latest`) — make it fail loudly (`:?IMAGE_TAG required`)                                        | `docker-compose.yml:42,83,103`                                 |
| L12 | `tsc -b` in web build is a no-op (non-composite project) — drop it or wire real project references                                    | `packages/web/package.json:8`                                  |
| L13 | `SENTRY_DSN_WEB` (.env.example) vs `VITE_SENTRY_DSN` (env.d.ts) naming drift — document the build-arg mapping                          | `.env.example:55`, `packages/web/src/env.d.ts:10`              |
| L14 | No audit trail for sensitive mutations (user/tenant deletes, ERP transmit records only the MARK) — product decision, note for compliance | mutation routes                                                |

---

## Rejected on verification (agent claims that did not hold up)

Recorded so the next review doesn't re-chase them:

- **"Missing standalone index on `categories.tenant_id`"** — `categories_tenant_name_lower_idx` is a full composite leading on `tenant_id`; tenant scans are covered.
- **"Missing error boundary"** — `main.tsx:77` wraps the app in `Sentry.ErrorBoundary` (coarse fallback noted as L6, but the boundary exists).
- **"Query-key object references cause refetch churn"** — TanStack Query hashes keys structurally; only the normalization nuance (L8) is real.
- **"`orderItems.productId` missing index"**, **"enum drift in migration 0010"**, **"updatedAt not maintained"** — all verified present/correct (`$onUpdate` fires; Drizzle `.update()` used everywhere).
- **"CORS/env/secret issues"** — all closed since the May review; `config.ts` production guards are exemplary (including the email-transport-required check).

## What's genuinely good (keep doing this)

- RLS via transaction-local GUC + NOSUPERUSER role, with a real cross-tenant isolation test suite in CI.
- Composite FKs (`(customer_id, tenant_id)` etc., deferrable) making cross-tenant links unrepresentable — rare discipline at this stage.
- `ORDER_STATUS_TRANSITIONS`, `API_ERROR_CODES`, labels, and the numeric-as-string convention all single-sourced in `packages/shared` and actually consumed by both sides.
- Soft-cancel/replacement chain on order items with `FILTER (WHERE status='active')` aggregates; ERP one-shot transmit as an atomic conditional UPDATE.
- Hand-written migration escape hatches (RLS, deferrable FKs) with the `drizzle-kit push` foot-gun documented in CLAUDE.md.

## Suggested sequencing

1. **Contract PR** — H1 + H2 + L2 (+ the `validationError` helper): one shared-types + API + `api.ts` change, mostly mechanical, removes the only user-visible bug.
2. **Schema-hardening PR** — H3 + M1 in a single generated migration (CHECKs + `customers_tenant_idx`).
3. **Auth/limits PR** — M4's three one-liners.
4. **Web abstraction PR** — M2 (`useFormModal`) + M3 (error-surfacing convention) + L5.
5. **Test backfill** — M6, starting with `customer/catalog.ts` pricing and `admin/categories.ts` cycle detection.
