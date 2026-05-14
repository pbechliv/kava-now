# Superadmin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a platform-level superadmin panel at `admin.<domain>` for viewing and deleting tenants.

**Architecture:** Add `superadmin` to the user role enum, make `users.kavaId` and `magic_link_tokens.kavaId` nullable, special-case the `admin` subdomain in tenant middleware, extend auth routes to handle superadmin login/forgot-password/reset-password, add superadmin API routes for listing and deleting kavas, and build a minimal frontend panel with subdomain detection.

**Tech Stack:** Drizzle ORM, Hono, React, TanStack Query, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-04-11-superadmin-panel-design.md`

---

## File Map

**Create:**

- `packages/api/src/middleware/require-superadmin.ts` — guard middleware
- `packages/api/src/routes/superadmin/index.ts` — superadmin API routes
- `packages/web/src/lib/is-superadmin.ts` — subdomain detection utility
- `packages/web/src/components/layouts/SuperAdminLayout.tsx` — layout component
- `packages/web/src/pages/superadmin/KavasPage.tsx` — tenant list page
- `packages/web/src/lib/hooks/use-superadmin-kavas.ts` — data hooks

**Modify:**

- `packages/api/src/db/schema/enums.ts` — add `superadmin` to role enum
- `packages/api/src/db/schema/users.ts` — make `kavaId` nullable
- `packages/api/src/db/schema/magic-links.ts` — make `kavaId` nullable
- `packages/api/src/types.ts` — add `isSuperAdmin` to AppEnv
- `packages/api/src/middleware/tenant.ts` — handle `admin` subdomain
- `packages/api/src/middleware/auth.ts` — handle superadmin role in type cast
- `packages/api/src/auth/lucia.ts` — allow nullable kavaId in types
- `packages/api/src/routes/auth.ts` — superadmin login, forgot/reset password support
- `packages/api/src/app.ts` — mount superadmin routes
- `packages/api/src/db/seed.ts` — seed superadmin user
- `packages/shared/src/types/index.ts` — add `superadmin` to UserRole
- `packages/web/src/App.tsx` — conditional superadmin routing
- `packages/web/src/components/guards/RequireRole.tsx` — handle superadmin role

---

### Task 1: Database Schema Changes

**Files:**

- Modify: `packages/api/src/db/schema/enums.ts`
- Modify: `packages/api/src/db/schema/users.ts`
- Modify: `packages/api/src/db/schema/magic-links.ts`

- [ ] **Step 1: Add `superadmin` to user role enum**

In `packages/api/src/db/schema/enums.ts`, change:

```ts
export const userRoleEnum = pgEnum("user_role", ["owner", "staff", "customer"]);
```

to:

```ts
export const userRoleEnum = pgEnum("user_role", ["owner", "staff", "customer", "superadmin"]);
```

- [ ] **Step 2: Make `kavaId` nullable on users**

In `packages/api/src/db/schema/users.ts`, change:

```ts
    kavaId: uuid("kava_id")
      .notNull()
      .references(() => kavas.id, { onDelete: "cascade" }),
```

to:

```ts
    kavaId: uuid("kava_id").references(() => kavas.id, {
      onDelete: "cascade",
    }),
```

(Remove `.notNull()` — the column becomes nullable.)

- [ ] **Step 3: Make `kavaId` nullable on magic_link_tokens**

In `packages/api/src/db/schema/magic-links.ts`, change:

```ts
  kavaId: uuid("kava_id")
    .notNull()
    .references(() => kavas.id, { onDelete: "cascade" }),
```

to:

```ts
  kavaId: uuid("kava_id").references(() => kavas.id, {
    onDelete: "cascade",
  }),
```

- [ ] **Step 4: Generate and run the migration**

```bash
cd packages/api
pnpm db:generate
pnpm db:migrate
```

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/db/schema/enums.ts packages/api/src/db/schema/users.ts packages/api/src/db/schema/magic-links.ts packages/api/drizzle/
git commit -m "feat: add superadmin role, make kavaId nullable on users and magic_link_tokens"
```

---

### Task 2: Shared Types + AppEnv + Lucia

**Files:**

- Modify: `packages/shared/src/types/index.ts`
- Modify: `packages/api/src/types.ts`
- Modify: `packages/api/src/auth/lucia.ts`
- Modify: `packages/api/src/middleware/auth.ts`

- [ ] **Step 1: Add `superadmin` to UserRole in shared types**

In `packages/shared/src/types/index.ts`, change:

```ts
export type UserRole = "owner" | "staff" | "customer";
```

to:

```ts
export type UserRole = "owner" | "staff" | "customer" | "superadmin";
```

- [ ] **Step 2: Add `isSuperAdmin` to AppEnv**

In `packages/api/src/types.ts`, change the `AppEnv` type to:

```ts
import type { InferSelectModel } from "drizzle-orm";
import type { kavas, users } from "./db/schema/index";

export type Kava = InferSelectModel<typeof kavas>;
export type User = InferSelectModel<typeof users>;

export type AppEnv = {
  Variables: {
    kava: Kava | null;
    kavaId: string | null;
    isPlatform: boolean;
    isSuperAdmin: boolean;
    user: User | null;
    sessionId: string | null;
  };
};
```

- [ ] **Step 3: Update Lucia type declarations for nullable kavaId**

In `packages/api/src/auth/lucia.ts`, the `DatabaseUserAttributes` interface already has `kavaId: string`. Since kavaId is now nullable in the DB, update the Lucia module declaration. Change:

```ts
declare module "lucia" {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: {
      email: string;
      name: string;
      role: "owner" | "staff" | "customer";
      kava_id: string;
      kavaId: string;
      customer_id: string | null;
      customerId: string | null;
    };
  }
}
```

to:

```ts
declare module "lucia" {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: {
      email: string;
      name: string;
      role: "owner" | "staff" | "customer" | "superadmin";
      kava_id: string | null;
      kavaId: string | null;
      customer_id: string | null;
      customerId: string | null;
    };
  }
}
```

- [ ] **Step 4: Update auth middleware role cast**

In `packages/api/src/middleware/auth.ts`, change:

```ts
    role: user.role as "owner" | "staff" | "customer",
```

to:

```ts
    role: user.role as "owner" | "staff" | "customer" | "superadmin",
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/types/index.ts packages/api/src/types.ts packages/api/src/auth/lucia.ts packages/api/src/middleware/auth.ts
git commit -m "feat: add superadmin to types, AppEnv, and Lucia declarations"
```

---

### Task 3: Tenant Middleware — Handle `admin` Subdomain

**Files:**

- Modify: `packages/api/src/middleware/tenant.ts`

- [ ] **Step 1: Add `admin` subdomain handling**

In `packages/api/src/middleware/tenant.ts`, after the bare domain / localhost check (the `if` block that sets `isPlatform: true`), and before the subdomain extraction, add `isSuperAdmin: false` to the platform mode block. Then, after extracting the subdomain, add a check for the `admin` subdomain before the kava lookup.

Replace the entire file with:

```ts
import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { db, queryClient } from "../db/connection";
import { kavas } from "../db/schema/index";
import { config } from "../config";
import type { AppEnv } from "../types";

export const tenantMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const host = c.req.header("host") || "";
  const hostWithoutPort = host.split(":")[0] || "";
  const baseDomainWithoutPort = config.baseDomain.split(":")[0] || "";

  // Check if this is the bare domain (platform mode)
  if (
    hostWithoutPort === baseDomainWithoutPort ||
    hostWithoutPort === "localhost" ||
    hostWithoutPort === "127.0.0.1"
  ) {
    c.set("isPlatform", true);
    c.set("isSuperAdmin", false);
    c.set("kava", null);
    c.set("kavaId", null);
    c.set("user", null);
    c.set("sessionId", null);
    return next();
  }

  // Extract subdomain
  const subdomain = hostWithoutPort.replace(`.${baseDomainWithoutPort}`, "");

  if (!subdomain || subdomain === hostWithoutPort) {
    c.set("isPlatform", true);
    c.set("isSuperAdmin", false);
    c.set("kava", null);
    c.set("kavaId", null);
    c.set("user", null);
    c.set("sessionId", null);
    return next();
  }

  // Superadmin panel
  if (subdomain === "admin") {
    c.set("isPlatform", false);
    c.set("isSuperAdmin", true);
    c.set("kava", null);
    c.set("kavaId", null);
    c.set("user", null);
    c.set("sessionId", null);
    return next();
  }

  // Look up kava by slug
  const [kava] = await db.select().from(kavas).where(eq(kavas.slug, subdomain)).limit(1);

  if (!kava) {
    return c.json({ error: "Κάβα δεν βρέθηκε" }, 404);
  }

  c.set("isPlatform", false);
  c.set("isSuperAdmin", false);
  c.set("kava", kava);
  c.set("kavaId", kava.id);
  c.set("user", null);
  c.set("sessionId", null);

  // Set PostgreSQL session variable for RLS
  await queryClient`SELECT set_config('app.current_kava_id', ${kava.id}, false)`;

  return next();
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/api/src/middleware/tenant.ts
git commit -m "feat: handle admin subdomain in tenant middleware"
```

---

### Task 4: Auth Routes — Superadmin Support

**Files:**

- Modify: `packages/api/src/routes/auth.ts`

- [ ] **Step 1: Update login route to handle superadmin**

In `packages/api/src/routes/auth.ts`, add `isNull` to the drizzle-orm import:

```ts
import { eq, and, gt, isNull } from "drizzle-orm";
```

Then replace the login handler. The key change: before checking for `kava`, check if `isSuperAdmin` is true and handle superadmin login separately.

Replace the `auth.post("/login", ...)` handler (lines 22-94) with:

```ts
// POST /auth/login — password login or magic link request
auth.post("/login", async (c) => {
  const body = await c.req.json();
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const { email, password } = parsed.data;
  const isSuperAdmin = c.get("isSuperAdmin");

  // Superadmin login (admin subdomain)
  if (isSuperAdmin) {
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email), eq(users.role, "superadmin"), isNull(users.kavaId)))
      .limit(1);

    // Password login
    if (password) {
      if (!user || !user.passwordHash) {
        return c.json({ error: "Λάθος email ή κωδικός" }, 401);
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        return c.json({ error: "Λάθος email ή κωδικός" }, 401);
      }

      const session = await lucia.createSession(user.id, {});
      const cookie = lucia.createSessionCookie(session.id);
      c.header("Set-Cookie", cookie.serialize(), { append: true });

      return c.json({
        success: true,
        redirect: "/superadmin/kavas",
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      });
    }

    // Magic link for superadmin
    if (!user) {
      return c.json({ success: true });
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await db.insert(magicLinkTokens).values({
      email,
      token,
      expiresAt,
      purpose: "login",
    });

    const link = `${config.protocol}://admin.${config.baseDomain}/auth/verify?token=${token}`;
    await sendMagicLink(email, link, "KavaNow");

    return c.json({ success: true });
  }

  // Tenant login (existing logic)
  const kava = c.get("kava");

  if (!kava) {
    return c.json({ error: "Δεν βρέθηκε κάβα" }, 400);
  }

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), eq(users.kavaId, kava.id)))
    .limit(1);

  if (password) {
    if (!user || !user.passwordHash) {
      return c.json({ error: "Λάθος email ή κωδικός" }, 401);
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return c.json({ error: "Λάθος email ή κωδικός" }, 401);
    }

    const session = await lucia.createSession(user.id, {});
    const cookie = lucia.createSessionCookie(session.id);
    c.header("Set-Cookie", cookie.serialize(), { append: true });

    let redirect = "/";
    if (user.role === "owner" || user.role === "staff") {
      redirect = "/admin/dashboard";
    } else if (user.role === "customer") {
      redirect = "/catalog";
    }

    return c.json({
      success: true,
      redirect,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  }

  if (!user) {
    return c.json({ success: true });
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await db.insert(magicLinkTokens).values({
    email,
    token,
    kavaId: kava.id,
    expiresAt,
    purpose: "login",
  });

  const link = `${config.protocol}://${kava.slug}.${config.baseDomain}/auth/verify?token=${token}`;
  await sendMagicLink(email, link, kava.name);

  return c.json({ success: true });
});
```

- [ ] **Step 2: Update verify route for superadmin**

In the `auth.get("/verify", ...)` handler, the current code returns 400 if `!kava`. For superadmin, we need to handle the case where there's no kava but `isSuperAdmin` is true. Replace the verify handler with:

```ts
// GET /auth/verify — verify magic link token
auth.get("/verify", async (c) => {
  const token = c.req.query("token");

  if (!token) {
    return c.json({ error: "Λείπει το token" }, 400);
  }

  const isSuperAdmin = c.get("isSuperAdmin");
  const kava = c.get("kava");

  if (!kava && !isSuperAdmin) {
    return c.json({ error: "Δεν βρέθηκε κάβα" }, 400);
  }

  const existingSessionId = c.get("sessionId");
  if (existingSessionId) {
    await lucia.invalidateSession(existingSessionId);
  }

  // Build token lookup conditions
  const conditions = [
    eq(magicLinkTokens.token, token),
    eq(magicLinkTokens.used, false),
    gt(magicLinkTokens.expiresAt, new Date()),
    eq(magicLinkTokens.purpose, "login"),
  ];
  if (kava) {
    conditions.push(eq(magicLinkTokens.kavaId, kava.id));
  } else {
    conditions.push(isNull(magicLinkTokens.kavaId));
  }

  const [magicLink] = await db
    .select()
    .from(magicLinkTokens)
    .where(and(...conditions))
    .limit(1);

  if (!magicLink) {
    return c.json({ error: "Μη έγκυρο ή ληγμένο token" }, 400);
  }

  await db.update(magicLinkTokens).set({ used: true }).where(eq(magicLinkTokens.id, magicLink.id));

  // For superadmin, look up by email + superadmin role
  if (isSuperAdmin) {
    const [user] = await db
      .select()
      .from(users)
      .where(
        and(eq(users.email, magicLink.email), eq(users.role, "superadmin"), isNull(users.kavaId)),
      )
      .limit(1);

    if (!user) {
      return c.json({ error: "Δεν βρέθηκε χρήστης" }, 400);
    }

    const session = await lucia.createSession(user.id, {});
    const cookie = lucia.createSessionCookie(session.id);
    c.header("Set-Cookie", cookie.serialize(), { append: true });

    return c.json({
      success: true,
      redirect: "/superadmin/kavas",
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  }

  // Existing tenant verify logic
  let [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, magicLink.email), eq(users.kavaId, kava!.id)))
    .limit(1);

  if (!user) {
    const [customer] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.email, magicLink.email), eq(customers.kavaId, kava!.id)))
      .limit(1);

    if (customer) {
      const [newUser] = await db
        .insert(users)
        .values({
          email: magicLink.email,
          name: customer.name,
          role: "customer",
          kavaId: kava!.id,
          customerId: customer.id,
        })
        .returning();
      user = newUser!;
    }
  }

  if (!user) {
    return c.json({ error: "Δεν βρέθηκε χρήστης" }, 400);
  }

  const session = await lucia.createSession(user.id, {});
  const cookie = lucia.createSessionCookie(session.id);
  c.header("Set-Cookie", cookie.serialize(), { append: true });

  let redirect = "/";
  if (user.role === "owner" || user.role === "staff") {
    redirect = "/admin/dashboard";
  } else if (user.role === "customer") {
    redirect = "/catalog";
  }

  return c.json({
    success: true,
    redirect,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});
```

- [ ] **Step 3: Update forgot-password for superadmin**

Replace the `auth.post("/forgot-password", ...)` handler with:

```ts
// POST /auth/forgot-password
auth.post("/forgot-password", async (c) => {
  const body = await c.req.json();
  const parsed = forgotPasswordSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const { email } = parsed.data;
  const isSuperAdmin = c.get("isSuperAdmin");
  const kava = c.get("kava");

  if (!kava && !isSuperAdmin) {
    return c.json({ error: "Δεν βρέθηκε κάβα" }, 400);
  }

  // Look up user
  const userConditions = [eq(users.email, email)];
  if (isSuperAdmin) {
    userConditions.push(eq(users.role, "superadmin"));
    userConditions.push(isNull(users.kavaId));
  } else {
    userConditions.push(eq(users.kavaId, kava!.id));
  }

  const [user] = await db
    .select()
    .from(users)
    .where(and(...userConditions))
    .limit(1);

  if (!user) {
    return c.json({ success: true });
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await db.insert(magicLinkTokens).values({
    email,
    token,
    kavaId: isSuperAdmin ? null : kava!.id,
    expiresAt,
    purpose: "reset",
  });

  const subdomain = isSuperAdmin ? "admin" : kava!.slug;
  const name = isSuperAdmin ? "KavaNow" : kava!.name;
  const link = `${config.protocol}://${subdomain}.${config.baseDomain}/auth/reset-password?token=${token}`;
  await sendPasswordReset(email, link, name);

  return c.json({ success: true });
});
```

- [ ] **Step 4: Update reset-password for superadmin**

Replace the `auth.post("/reset-password", ...)` handler with:

```ts
// POST /auth/reset-password
auth.post("/reset-password", async (c) => {
  const body = await c.req.json();
  const parsed = resetPasswordSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const isSuperAdmin = c.get("isSuperAdmin");
  const kava = c.get("kava");

  if (!kava && !isSuperAdmin) {
    return c.json({ error: "Δεν βρέθηκε κάβα" }, 400);
  }

  const { token, password } = parsed.data;

  const tokenConditions = [
    eq(magicLinkTokens.token, token),
    eq(magicLinkTokens.used, false),
    eq(magicLinkTokens.purpose, "reset"),
    gt(magicLinkTokens.expiresAt, new Date()),
  ];
  if (kava) {
    tokenConditions.push(eq(magicLinkTokens.kavaId, kava.id));
  } else {
    tokenConditions.push(isNull(magicLinkTokens.kavaId));
  }

  const [magicLink] = await db
    .select()
    .from(magicLinkTokens)
    .where(and(...tokenConditions))
    .limit(1);

  if (!magicLink) {
    return c.json({ error: "Μη έγκυρο ή ληγμένο token" }, 400);
  }

  await db.update(magicLinkTokens).set({ used: true }).where(eq(magicLinkTokens.id, magicLink.id));

  const userConditions = [eq(users.email, magicLink.email)];
  if (isSuperAdmin) {
    userConditions.push(eq(users.role, "superadmin"));
    userConditions.push(isNull(users.kavaId));
  } else {
    userConditions.push(eq(users.kavaId, kava!.id));
  }

  const [user] = await db
    .select()
    .from(users)
    .where(and(...userConditions))
    .limit(1);

  if (!user) {
    return c.json({ error: "Δεν βρέθηκε χρήστης" }, 400);
  }

  const passwordHash = await hashPassword(password);
  await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));

  return c.json({ success: true });
});
```

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routes/auth.ts
git commit -m "feat: support superadmin login, verify, forgot/reset password on admin subdomain"
```

---

### Task 5: Superadmin API Routes + Guard Middleware

**Files:**

- Create: `packages/api/src/middleware/require-superadmin.ts`
- Create: `packages/api/src/routes/superadmin/index.ts`
- Modify: `packages/api/src/app.ts`

- [ ] **Step 1: Create requireSuperAdmin middleware**

Create `packages/api/src/middleware/require-superadmin.ts`:

```ts
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

export const requireSuperAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get("user");

  if (!user || user.role !== "superadmin") {
    return c.json({ error: "Δεν έχετε δικαίωμα πρόσβασης" }, 403);
  }

  return next();
});
```

- [ ] **Step 2: Create superadmin routes**

Create `packages/api/src/routes/superadmin/index.ts`:

```ts
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../../db/connection";
import { kavas } from "../../db/schema/index";
import { requireAuth } from "../../middleware/require-auth";
import { requireSuperAdmin } from "../../middleware/require-superadmin";
import type { AppEnv } from "../../types";

const superadmin = new Hono<AppEnv>();

superadmin.use("*", requireAuth);
superadmin.use("*", requireSuperAdmin);

// GET /superadmin/kavas — list all tenants
superadmin.get("/kavas", async (c) => {
  const allKavas = await db
    .select({
      id: kavas.id,
      name: kavas.name,
      slug: kavas.slug,
      email: kavas.email,
      createdAt: kavas.createdAt,
    })
    .from(kavas)
    .orderBy(kavas.createdAt);

  return c.json({ kavas: allKavas });
});

// DELETE /superadmin/kavas/:id — hard delete a tenant
superadmin.delete("/kavas/:id", async (c) => {
  const id = c.req.param("id");

  const [kava] = await db.select({ id: kavas.id }).from(kavas).where(eq(kavas.id, id)).limit(1);

  if (!kava) {
    return c.json({ error: "Δεν βρέθηκε κάβα" }, 404);
  }

  await db.delete(kavas).where(eq(kavas.id, id));

  return c.json({ success: true });
});

export { superadmin as superadminRoutes };
```

- [ ] **Step 3: Mount superadmin routes in app.ts**

In `packages/api/src/app.ts`, add the import:

```ts
import { superadminRoutes } from "./routes/superadmin/index";
```

And add the route mount after the existing routes (before the health check):

```ts
app.route("/api/superadmin", superadminRoutes);
```

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/middleware/require-superadmin.ts packages/api/src/routes/superadmin/index.ts packages/api/src/app.ts
git commit -m "feat: add superadmin API routes for listing and deleting tenants"
```

---

### Task 6: Seed Superadmin User

**Files:**

- Modify: `packages/api/src/db/seed.ts`

- [ ] **Step 1: Add superadmin user to seed script**

In `packages/api/src/db/seed.ts`, add the `users` import and insert a superadmin user. Add after the existing imports:

```ts
import { users } from "./schema/index.js";
```

Then, after the `db.insert(seedProducts)` block and before `await sql.end();`, add:

```ts
// Seed superadmin user (no password — set via forgot-password flow)
console.log("Seeding superadmin user...");
await db
  .insert(users)
  .values({
    email: "panos.bechlivanos@gmail.com",
    name: "Super Admin",
    role: "superadmin",
  })
  .onConflictDoNothing();
console.log("Superadmin user seeded.");
```

Note: `kavaId` is omitted (defaults to null since it's now nullable). `onConflictDoNothing` prevents errors on re-runs.

- [ ] **Step 2: Run the seed**

```bash
pnpm db:seed
```

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/db/seed.ts
git commit -m "feat: seed superadmin user in db seed script"
```

---

### Task 7: Frontend — Subdomain Detection + Routing

**Files:**

- Create: `packages/web/src/lib/is-superadmin.ts`
- Create: `packages/web/src/components/layouts/SuperAdminLayout.tsx`
- Create: `packages/web/src/pages/superadmin/KavasPage.tsx`
- Create: `packages/web/src/lib/hooks/use-superadmin-kavas.ts`
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/components/guards/RequireRole.tsx`

- [ ] **Step 1: Create subdomain detection utility**

Create `packages/web/src/lib/is-superadmin.ts`:

```ts
export function isSuperAdminDomain(): boolean {
  const hostname = window.location.hostname;
  const firstSegment = hostname.split(".")[0];
  return firstSegment === "admin";
}
```

- [ ] **Step 2: Create SuperAdminLayout**

Create `packages/web/src/components/layouts/SuperAdminLayout.tsx`:

```tsx
import { useState } from "react";
import { Outlet } from "react-router";
import { useAuth } from "../../lib/hooks/use-auth";
import { useLogout } from "../../lib/hooks/use-logout";

export function SuperAdminLayout() {
  const { user } = useAuth();
  const logout = useLogout();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 lg:px-8">
        <span className="text-lg font-bold text-amber-600">KavaNow Admin</span>

        <div className="relative">
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
          >
            <span>{user?.name}</span>
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                <div className="px-4 py-2 text-sm text-gray-500 border-b border-gray-100">
                  {user?.email}
                </div>
                <button
                  type="button"
                  className="flex w-full items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  onClick={() => logout.mutate()}
                >
                  Αποσύνδεση
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-4 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Create superadmin hooks**

Create `packages/web/src/lib/hooks/use-superadmin-kavas.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

interface KavaListItem {
  id: string;
  name: string;
  slug: string;
  email: string;
  createdAt: string;
}

interface KavasResponse {
  kavas: KavaListItem[];
}

export function useSuperAdminKavas() {
  return useQuery({
    queryKey: ["superadmin", "kavas"],
    queryFn: () => api.get<KavasResponse>("/api/superadmin/kavas"),
  });
}

export function useDeleteKava() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/superadmin/kavas/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["superadmin", "kavas"] });
    },
  });
}
```

- [ ] **Step 4: Create KavasPage**

Create `packages/web/src/pages/superadmin/KavasPage.tsx`:

```tsx
import { useState } from "react";
import { useSuperAdminKavas, useDeleteKava } from "../../lib/hooks/use-superadmin-kavas";
import { Button } from "../../components/ui/Button";
import { Spinner } from "../../components/ui/Spinner";

export function KavasPage() {
  const { data, isLoading } = useSuperAdminKavas();
  const deleteMutation = useDeleteKava();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  const kavas = data?.kavas ?? [];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Κάβες</h1>

      {kavas.length === 0 ? (
        <p className="mt-6 text-sm text-gray-500">Δεν υπάρχουν κάβες.</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Όνομα
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Slug
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Ημ/νία
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {kavas.map((kava) => (
                <tr key={kava.id}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{kava.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{kava.slug}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{kava.email}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(kava.createdAt).toLocaleDateString("el-GR")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {confirmId === kava.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs text-red-600">Σίγουρα;</span>
                        <Button
                          variant="danger"
                          size="sm"
                          loading={deleteMutation.isPending}
                          onClick={() => {
                            deleteMutation.mutate(kava.id, {
                              onSuccess: () => setConfirmId(null),
                            });
                          }}
                        >
                          Ναι
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmId(null)}>
                          Όχι
                        </Button>
                      </div>
                    ) : (
                      <Button variant="danger" size="sm" onClick={() => setConfirmId(kava.id)}>
                        Διαγραφή
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Update RequireRole to handle superadmin**

In `packages/web/src/components/guards/RequireRole.tsx`, add `superadmin` redirect handling. Change the redirect block:

```ts
  if (!allowed.includes(user.role)) {
    if (user.role === "customer") {
      return <Navigate to="/catalog" replace />;
    }
    if (user.role === "superadmin") {
      return <Navigate to="/superadmin/kavas" replace />;
    }
    return <Navigate to="/admin/dashboard" replace />;
  }
```

- [ ] **Step 6: Update App.tsx with conditional superadmin routing**

Replace the entire `packages/web/src/App.tsx` with:

```tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router";
import { queryClient } from "./lib/query-client";
import { isSuperAdminDomain } from "./lib/is-superadmin";

// Layouts
import { AuthLayout } from "./components/layouts/AuthLayout";
import { AdminLayout } from "./components/layouts/AdminLayout";
import { CustomerLayout } from "./components/layouts/CustomerLayout";
import { SuperAdminLayout } from "./components/layouts/SuperAdminLayout";

// Guards
import { RequireAuth } from "./components/guards/RequireAuth";
import { RequireRole } from "./components/guards/RequireRole";

// Auth pages
import { LoginPage } from "./pages/auth/LoginPage";
import { VerifyPage } from "./pages/auth/VerifyPage";
import { RegisterPage } from "./pages/auth/RegisterPage";
import { ForgotPasswordPage } from "./pages/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/auth/ResetPasswordPage";

// Admin pages
import { DashboardPage } from "./pages/admin/DashboardPage";
import { ProductsPage } from "./pages/admin/ProductsPage";
import { CategoriesPage } from "./pages/admin/CategoriesPage";
import { CustomersPage } from "./pages/admin/CustomersPage";
import { CustomerProductsPage } from "./pages/admin/CustomerProductsPage";
import { PricingPage } from "./pages/admin/PricingPage";
import { OrdersPage } from "./pages/admin/OrdersPage";
import { OrderDetailPage } from "./pages/admin/OrderDetailPage";
import { SettingsPage } from "./pages/admin/SettingsPage";
import { ProductFormPage } from "./pages/admin/ProductFormPage";

// Customer pages
import { CatalogPage } from "./pages/customer/CatalogPage";
import { CartPage } from "./pages/customer/CartPage";
import { OrderHistoryPage } from "./pages/customer/OrderHistoryPage";
import { OrderDetailPage as CustomerOrderDetailPage } from "./pages/customer/OrderDetailPage";
import { ProfilePage } from "./pages/customer/ProfilePage";

// Superadmin pages
import { KavasPage } from "./pages/superadmin/KavasPage";

// Other
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";

function SuperAdminApp() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/verify" element={<VerifyPage />} />
        <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
      </Route>

      <Route
        path="/superadmin"
        element={
          <RequireAuth>
            <RequireRole allowed={["superadmin"]}>
              <SuperAdminLayout />
            </RequireRole>
          </RequireAuth>
        }
      >
        <Route path="kavas" element={<KavasPage />} />
      </Route>

      <Route path="/" element={<HomePage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

function TenantApp() {
  return (
    <Routes>
      {/* Auth routes */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/verify" element={<VerifyPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
      </Route>

      {/* Admin routes */}
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <RequireRole allowed={["owner", "staff"]}>
              <AdminLayout />
            </RequireRole>
          </RequireAuth>
        }
      >
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="products/new" element={<ProductFormPage />} />
        <Route path="products/:id" element={<ProductFormPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/:id/products" element={<CustomerProductsPage />} />
        <Route path="pricing" element={<PricingPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="orders/:id" element={<OrderDetailPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      {/* Customer routes */}
      <Route
        element={
          <RequireAuth>
            <RequireRole allowed={["customer"]}>
              <CustomerLayout />
            </RequireRole>
          </RequireAuth>
        }
      >
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/orders" element={<OrderHistoryPage />} />
        <Route path="/orders/:id" element={<CustomerOrderDetailPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>

      {/* Root redirect */}
      <Route path="/" element={<HomePage />} />

      {/* 404 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export function App() {
  const isSuperAdmin = isSuperAdminDomain();

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{isSuperAdmin ? <SuperAdminApp /> : <TenantApp />}</BrowserRouter>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 7: Run typecheck**

```bash
pnpm typecheck
```

Fix any errors before proceeding.

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/lib/is-superadmin.ts packages/web/src/components/layouts/SuperAdminLayout.tsx packages/web/src/pages/superadmin/KavasPage.tsx packages/web/src/lib/hooks/use-superadmin-kavas.ts packages/web/src/App.tsx packages/web/src/components/guards/RequireRole.tsx
git commit -m "feat: add superadmin frontend panel with tenant list and delete"
```

---

### Task 8: Verification

- [ ] **Step 1: Start dev infrastructure and seed**

```bash
docker compose -f docker-compose.dev.yml up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- [ ] **Step 2: Test superadmin forgot-password flow**

1. Go to `http://admin.lvh.me:5173/login`
2. Click "Ξεχάσατε τον κωδικό;"
3. Enter `panos.bechlivanos@gmail.com`
4. Check Mailpit at `http://localhost:8025` for reset email
5. Click the reset link, set a password
6. Log in with the new password

- [ ] **Step 3: Test superadmin panel**

1. After logging in, verify redirect to `/superadmin/kavas`
2. Verify the tenant list shows existing kavas
3. Delete a test tenant, verify it disappears

- [ ] **Step 4: Test that tenant login still works**

1. Go to `http://testcava.lvh.me:5173/login`
2. Log in with a tenant user
3. Verify everything works as before
