# Kava Selector on Platform Domain

## Context

When users visit the bare domain (no subdomain), they need a way to select which kava they want to log into before being redirected to its subdomain. Since user emails are unique per kava (not globally), login must happen on a kava's subdomain. Currently, platform mode only supports registration — there's no entry point for existing users to find their kava.

The kava list should not be publicly exposed for privacy reasons. Instead, users type the kava slug themselves.

## Design

### Backend: Slug Validation Endpoint

**New endpoint in `packages/api/src/routes/platform.ts`:**

```
GET /api/platform/kava-exists?slug=demo
```

- Public, no auth required
- Looks up the `kavas` table by slug
- Returns `{ exists: true }` or `{ exists: false }`
- No other kava data exposed (name, email, etc.)

**Shared schema in `packages/shared/src/schemas/platform.ts`:**

Add a `kavaExistsSchema` with `slug: z.string().min(1)` for query param validation.

### Frontend: KavaSelectPage

**New file: `packages/web/src/pages/KavaSelectPage.tsx`**

A simple page with:

- Heading: "Enter your kava name" (or similar)
- Text input for the kava slug
- "Continue" button
- Inline error message if the slug doesn't exist: "Kava not found"
- Link at the bottom: "Don't have a kava yet? Register here" → `/register`

**Behavior:**

1. User types slug and clicks Continue
2. Frontend calls `GET /api/platform/kava-exists?slug={input}`
3. If `exists: true` → redirect to `{slug}.{baseDomain}/login`
4. If `exists: false` → show inline error

### Kava Name on Login Page

When the user lands on a kava's subdomain (either by redirect from the selector or directly), the **login page should prominently display the kava's name** so the user knows which kava they're logging into.

**Implementation:** The tenant middleware already resolves the kava on subdomain requests. Add a lightweight public endpoint that returns the kava's name from context — no extra DB query needed.

**New endpoint in `packages/api/src/routes/` (new file or added to an existing public route):**

```
GET /api/kava  (tenant mode only)
```

- Returns `{ name, slug }` from the kava already resolved by tenant middleware
- No auth required
- Returns 404 if not in tenant mode

**Frontend changes to `LoginPage.tsx`:**

- Fetch kava info on mount via `GET /api/kava`
- Display kava name prominently (large heading above the form)

### Routing Changes in `packages/web/src/App.tsx`

In the `TenantApp` component, when in platform mode (`isPlatform`):

- The root route `/` renders `KavaSelectPage` instead of `HomePage`
- Login, register, verify, forgot-password, and reset-password routes remain for the registration flow
- `HomePage` still handles redirects for tenant-mode users

### Files to Modify

1. `packages/api/src/routes/platform.ts` — add `GET /kava-exists` endpoint
2. `packages/api/src/app.ts` (or new route file) — add `GET /api/kava` public tenant endpoint
3. `packages/shared/src/schemas/platform.ts` — add slug validation schema (or add to existing file if schemas are colocated)
4. `packages/web/src/pages/KavaSelectPage.tsx` — new kava selector page
5. `packages/web/src/pages/auth/LoginPage.tsx` — display kava name prominently
6. `packages/web/src/App.tsx` — route the platform root to KavaSelectPage

### Subdomain Redirect Logic

The redirect URL is constructed as: `{protocol}://{slug}.{baseDomain}/login`

The base domain and protocol should be derived from the current `window.location` to work in both dev (`lvh.me:5173`) and production.

## Verification

1. Start dev environment: `pnpm dev`
2. Visit `lvh.me:5173` — should see the kava selector page
3. Enter an invalid slug → see "Kava not found" error
4. Enter "demo" (seeded kava) → redirected to `demo.lvh.me:5173/login`
5. Click "Register here" link → navigates to `/register`
6. Visit `demo.lvh.me:5173` directly → still shows login page as before (no regression)
7. On `demo.lvh.me:5173/login` → kava name "Demo" is displayed prominently above the login form
