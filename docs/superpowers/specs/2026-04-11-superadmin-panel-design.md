# Superadmin Panel

A platform-level admin panel accessible at `admin.<domain>` for managing tenants. Only users with role `superadmin` can access it.

## Database Changes

### `user_role` enum
Add `'superadmin'` value.

### `users` table
Make `kavaId` nullable. Superadmin users have `kavaId = NULL` since they are platform-level, not tied to any tenant. The existing unique index `users_email_kava_id_idx` on `(email, kava_id)` must handle nulls — PostgreSQL treats each NULL as distinct in unique indexes, so this works without changes. However, to prevent duplicate superadmin emails, add a partial unique index: `CREATE UNIQUE INDEX users_email_superadmin_idx ON users (email) WHERE kava_id IS NULL`.

One new Drizzle migration covers both changes.

## Tenant Middleware

In `packages/api/src/middleware/tenant.ts`, add a special case before the kava lookup: if the subdomain is `admin`, set `isSuperAdmin: true` on the Hono context and skip kava resolution. The `AppEnv` type in `packages/api/src/types.ts` needs a new `isSuperAdmin: boolean` variable.

## API Routes

### Auth Changes

The existing `POST /auth/login` route currently requires a kava to be resolved. For the `admin` subdomain:
- If `isSuperAdmin` is true on context, look up users where `email = ?` AND `role = 'superadmin'` AND `kavaId IS NULL`.
- Supports both password login and magic link (magic link uses "KavaNow" as the sender name since there's no kava).
- On success, create a Lucia session and return `{ success: true, redirect: "/superadmin/kavas" }`.

The `POST /auth/forgot-password` and `POST /auth/reset-password` routes also need to work on the `admin` subdomain — same logic: look up superadmin users with null kavaId, use "KavaNow" as sender name.

The `GET /auth/me` route needs to work for superadmin users too — when the user has no kavaId, return `kava: null`.

### New Routes — `/api/superadmin`

Mounted in `packages/api/src/app.ts`. All routes guarded by `requireAuth` + a new `requireSuperAdmin` middleware that checks `user.role === 'superadmin'`.

**GET `/api/superadmin/kavas`**
Returns all kavas: `{ kavas: Array<{ id, name, slug, email, createdAt }> }`. No RLS filtering (superadmin sees everything). Query the `kavas` table directly, ordered by `createdAt DESC`.

**DELETE `/api/superadmin/kavas/:id`**
Hard-deletes the kava by ID. All related data (users, products, orders, etc.) is cascade-deleted via foreign key constraints. Returns `{ success: true }`. Returns 404 if kava not found.

### Guard Middleware

`packages/api/src/middleware/require-superadmin.ts`:
```
if user.role !== 'superadmin' → 403 Forbidden
```

## Frontend

### Subdomain Detection

The app needs to detect when it's running on the `admin` subdomain. A utility function checks `window.location.hostname` — if the first subdomain segment is `admin`, the app is in superadmin mode.

### Routing

In `App.tsx`, add a conditional branch: if on `admin` subdomain, render superadmin routes instead of the normal tenant routes.

**Superadmin routes (under AuthLayout for login, SuperAdminLayout for panel):**
- `/login` — existing LoginPage (works as-is, API handles admin subdomain)
- `/superadmin/kavas` — tenant list page

### SuperAdminLayout

Simple layout: header with "KavaNow Admin" title and logout button. Renders `<Outlet />` for child content. Guarded by `RequireAuth` + role check for `superadmin`.

### KavasPage (`/superadmin/kavas`)

A table showing all tenants with columns:
- Name
- Slug
- Email
- Created date (formatted)
- Actions: Delete button

**Delete flow:** Clicking delete shows a confirmation dialog (e.g., "Are you sure you want to delete {kava.name}? This will permanently delete all data."). On confirm, calls `DELETE /api/superadmin/kavas/:id` and removes the row from the list.

### Hooks

- `useSuperAdminKavas()` — `useQuery` for `GET /api/superadmin/kavas`
- `useDeleteKava()` — `useMutation` for `DELETE /api/superadmin/kavas/:id`, invalidates the kavas query on success

## Seed Script

Add a superadmin user to `packages/api/src/db/seed.ts`:
- Email: `panos.bechlivanos@gmail.com`
- No password (NULL passwordHash) — user sets password via the forgot-password flow on first use
- Role: `superadmin`
- kavaId: `NULL`
- Name: `Super Admin`

The seed should upsert (insert on conflict do nothing) to avoid errors on re-runs.

## Lucia / Session Changes

Lucia's `getUserAttributes` already returns `kavaId`. Since `kavaId` is now nullable, the type in the Lucia module declaration needs to allow `string | null` for `kavaId`.

The auth middleware that sets the PostgreSQL RLS session variable (`app.current_kava_id`) should skip this when `kavaId` is null (superadmin users don't operate within a tenant context).
