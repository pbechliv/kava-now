# Password Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional password-based login alongside the existing magic link flow for all user roles.

**Architecture:** Extend the `users` table with a nullable `passwordHash` column and the `magic_link_tokens` table with a `purpose` column. Add password hashing via Node.js built-in `crypto.scrypt`. New API routes handle password login, forgot/reset password, and change password. The frontend LoginPage becomes a dual-mode form, with new pages for forgot/reset password and a change-password section on profile/settings pages.

**Tech Stack:** Node.js `crypto.scrypt` for hashing, Drizzle ORM for migrations, Zod for validation, Hono for API routes, React Hook Form for frontend forms.

**Spec:** `docs/superpowers/specs/2026-04-11-password-auth-design.md`

---

## File Map

**Create:**
- `packages/api/src/auth/password.ts` — scrypt hash/verify utility
- `packages/web/src/pages/auth/ForgotPasswordPage.tsx` — forgot password form
- `packages/web/src/pages/auth/ResetPasswordPage.tsx` — reset password form

**Modify:**
- `packages/api/src/db/schema/users.ts` — add `passwordHash` column
- `packages/api/src/db/schema/magic-links.ts` — add `purpose` column
- `packages/shared/src/schemas/auth.ts` — update loginSchema/registerSchema, add new schemas
- `packages/shared/src/types/index.ts` — add `hasPassword` to User interface
- `packages/api/src/routes/auth.ts` — password login, forgot/reset/change password routes
- `packages/api/src/routes/platform.ts` — hash password on register
- `packages/api/src/services/email.ts` — add `sendPasswordReset` function
- `packages/web/src/lib/hooks/use-login.ts` — update for password field
- `packages/web/src/lib/hooks/use-auth.ts` — update AuthMeResponse for hasPassword
- `packages/web/src/pages/auth/LoginPage.tsx` — dual-mode form
- `packages/web/src/pages/auth/RegisterPage.tsx` — optional password fields
- `packages/web/src/pages/customer/ProfilePage.tsx` — add change password section
- `packages/web/src/pages/admin/SettingsPage.tsx` — add change password section
- `packages/web/src/App.tsx` — add routes for new pages

---

### Task 1: Database Schema Changes

**Files:**
- Modify: `packages/api/src/db/schema/users.ts`
- Modify: `packages/api/src/db/schema/magic-links.ts`

- [ ] **Step 1: Add `passwordHash` column to users schema**

In `packages/api/src/db/schema/users.ts`, add a nullable `passwordHash` text column to the users table:

```ts
// Add after the `customerId` field:
    passwordHash: text("password_hash"),
```

- [ ] **Step 2: Add `purpose` column to magic_link_tokens schema**

In `packages/api/src/db/schema/magic-links.ts`, add a `purpose` text column with default `'login'`:

```ts
// Add after the `used` field:
  purpose: text("purpose").notNull().default("login"),
```

- [ ] **Step 3: Generate and run the migration**

```bash
cd packages/api
pnpm db:generate
pnpm db:migrate
```

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/db/schema/users.ts packages/api/src/db/schema/magic-links.ts packages/api/drizzle/
git commit -m "feat: add passwordHash to users and purpose to magic_link_tokens"
```

---

### Task 2: Password Hashing Utility

**Files:**
- Create: `packages/api/src/auth/password.ts`

- [ ] **Step 1: Create the password utility**

Create `packages/api/src/auth/password.ts`:

```ts
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";

const SALT_LENGTH = 16;
const KEY_LENGTH = 64;

export function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(SALT_LENGTH);
    scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt.toString("hex")}:${derivedKey.toString("hex")}`);
    });
  });
}

export function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [saltHex, keyHex] = stored.split(":");
    if (!saltHex || !keyHex) return resolve(false);
    const salt = Buffer.from(saltHex, "hex");
    const storedKey = Buffer.from(keyHex, "hex");
    scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(timingSafeEqual(storedKey, derivedKey));
    });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/api/src/auth/password.ts
git commit -m "feat: add scrypt password hash/verify utility"
```

---

### Task 3: Shared Schemas

**Files:**
- Modify: `packages/shared/src/schemas/auth.ts`
- Modify: `packages/shared/src/types/index.ts`

- [ ] **Step 1: Update loginSchema and registerSchema, add new schemas**

Replace the contents of `packages/shared/src/schemas/auth.ts` with:

```ts
import { z } from "zod";

const RESERVED_SLUGS = [
  "www",
  "api",
  "admin",
  "app",
  "mail",
  "ftp",
  "smtp",
  "pop",
  "imap",
  "blog",
  "help",
  "support",
  "status",
  "docs",
];

export const loginSchema = z.object({
  email: z.string().email("Μη έγκυρη διεύθυνση email"),
  password: z.string().optional(),
});

const passwordField = z
  .string()
  .min(8, "Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες");

export const registerSchema = z
  .object({
    name: z
      .string()
      .min(2, "Το όνομα πρέπει να έχει τουλάχιστον 2 χαρακτήρες"),
    slug: z
      .string()
      .min(3, "Το slug πρέπει να έχει τουλάχιστον 3 χαρακτήρες")
      .max(30, "Το slug πρέπει να έχει το πολύ 30 χαρακτήρες")
      .regex(
        /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
        "Το slug πρέπει να περιέχει μόνο πεζά γράμματα, αριθμούς και παύλες",
      )
      .refine(
        (val) => !RESERVED_SLUGS.includes(val),
        "Αυτό το slug είναι δεσμευμένο",
      ),
    email: z.string().email("Μη έγκυρη διεύθυνση email"),
    password: passwordField.optional(),
    confirmPassword: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.password && !data.confirmPassword) return false;
      if (!data.password && data.confirmPassword) return false;
      if (data.password && data.confirmPassword) {
        return data.password === data.confirmPassword;
      }
      return true;
    },
    {
      message: "Οι κωδικοί δεν ταιριάζουν",
      path: ["confirmPassword"],
    },
  );

export const forgotPasswordSchema = z.object({
  email: z.string().email("Μη έγκυρη διεύθυνση email"),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Οι κωδικοί δεν ταιριάζουν",
    path: ["confirmPassword"],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().optional(),
    newPassword: passwordField,
    confirmNewPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "Οι κωδικοί δεν ταιριάζουν",
    path: ["confirmNewPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
```

- [ ] **Step 2: Add `hasPassword` to User interface**

In `packages/shared/src/types/index.ts`, add `hasPassword` to the `User` interface:

```ts
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  kavaId: string;
  customerId: string | null;
  hasPassword: boolean;
  createdAt: string;
}
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```

There will be type errors in the API and web packages since the backend doesn't yet send `hasPassword` — that's expected at this stage. Verify no errors in the shared package itself.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/schemas/auth.ts packages/shared/src/types/index.ts
git commit -m "feat: add password auth schemas and hasPassword to User type"
```

---

### Task 4: Email Service — Password Reset Email

**Files:**
- Modify: `packages/api/src/services/email.ts`

- [ ] **Step 1: Add `sendPasswordReset` function**

Add this function at the end of `packages/api/src/services/email.ts` (before the closing of the file, after `sendOrderStatusChange`):

```ts
export async function sendPasswordReset(
  email: string,
  link: string,
  kavaName: string,
): Promise<void> {
  await transporter.sendMail({
    from: config.smtp.from,
    to: email,
    subject: `Επαναφορά κωδικού — ${kavaName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Επαναφορά κωδικού</h2>
        <p>Πατήστε τον παρακάτω σύνδεσμο για να ορίσετε νέο κωδικό:</p>
        <p>
          <a href="${link}"
             style="display: inline-block; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px;">
            Επαναφορά κωδικού
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">
          Ο σύνδεσμος λήγει σε 15 λεπτά. Αν δεν ζητήσατε επαναφορά κωδικού, αγνοήστε αυτό το email.
        </p>
      </div>
    `,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/api/src/services/email.ts
git commit -m "feat: add sendPasswordReset email function"
```

---

### Task 5: API Auth Routes — Password Login, Forgot, Reset, Change

**Files:**
- Modify: `packages/api/src/routes/auth.ts`

- [ ] **Step 1: Add imports for password utilities and new schemas**

At the top of `packages/api/src/routes/auth.ts`, update the imports:

```ts
import {
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from "@kava-now/shared";
import { hashPassword, verifyPassword } from "../auth/password";
import { sendMagicLink, sendPasswordReset } from "../services/email";
```

Remove the existing single `loginSchema` import and `sendMagicLink` import lines that they replace.

- [ ] **Step 2: Update POST `/login` to handle password auth**

Replace the existing `auth.post("/login", ...)` handler with:

```ts
// POST /auth/login — password login or magic link request
auth.post("/login", async (c) => {
  const body = await c.req.json();
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const kava = c.get("kava");

  if (!kava) {
    return c.json({ error: "Δεν βρέθηκε κάβα" }, 400);
  }

  const { email, password } = parsed.data;

  // Look up user by email + kava_id
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), eq(users.kavaId, kava.id)))
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

  // Magic link flow (no password provided)
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

- [ ] **Step 3: Update the verify route to filter by `purpose: 'login'`**

In the `auth.get("/verify", ...)` handler, add a `purpose` filter to the magic link query. Find the `.where(and(...))` block and add:

```ts
eq(magicLinkTokens.purpose, "login"),
```

as an additional condition inside the `and(...)` call, after the `gt(magicLinkTokens.expiresAt, new Date())` line.

- [ ] **Step 4: Add POST `/forgot-password` route**

Add after the verify route:

```ts
// POST /auth/forgot-password
auth.post("/forgot-password", async (c) => {
  const body = await c.req.json();
  const parsed = forgotPasswordSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const kava = c.get("kava");

  if (!kava) {
    return c.json({ error: "Δεν βρέθηκε κάβα" }, 400);
  }

  const { email } = parsed.data;

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), eq(users.kavaId, kava.id)))
    .limit(1);

  // Always return success to prevent email enumeration
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
    purpose: "reset",
  });

  const link = `${config.protocol}://${kava.slug}.${config.baseDomain}/auth/reset-password?token=${token}`;
  await sendPasswordReset(email, link, kava.name);

  return c.json({ success: true });
});
```

- [ ] **Step 5: Add POST `/reset-password` route**

Add after the forgot-password route:

```ts
// POST /auth/reset-password
auth.post("/reset-password", async (c) => {
  const body = await c.req.json();
  const parsed = resetPasswordSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const kava = c.get("kava");

  if (!kava) {
    return c.json({ error: "Δεν βρέθηκε κάβα" }, 400);
  }

  const { token, password } = parsed.data;

  const [magicLink] = await db
    .select()
    .from(magicLinkTokens)
    .where(
      and(
        eq(magicLinkTokens.token, token),
        eq(magicLinkTokens.kavaId, kava.id),
        eq(magicLinkTokens.used, false),
        eq(magicLinkTokens.purpose, "reset"),
        gt(magicLinkTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!magicLink) {
    return c.json({ error: "Μη έγκυρο ή ληγμένο token" }, 400);
  }

  await db
    .update(magicLinkTokens)
    .set({ used: true })
    .where(eq(magicLinkTokens.id, magicLink.id));

  const [user] = await db
    .select()
    .from(users)
    .where(
      and(eq(users.email, magicLink.email), eq(users.kavaId, kava.id)),
    )
    .limit(1);

  if (!user) {
    return c.json({ error: "Δεν βρέθηκε χρήστης" }, 400);
  }

  const passwordHash = await hashPassword(password);
  await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, user.id));

  return c.json({ success: true });
});
```

- [ ] **Step 6: Add POST `/change-password` route**

Add after the reset-password route:

```ts
// POST /auth/change-password (authenticated)
auth.post("/change-password", requireAuth, async (c) => {
  const body = await c.req.json();
  const parsed = changePasswordSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const authUser = c.get("user")!;
  const { currentPassword, newPassword } = parsed.data;

  // Fetch the full user record with passwordHash
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, authUser.id))
    .limit(1);

  if (!user) {
    return c.json({ error: "Δεν βρέθηκε χρήστης" }, 400);
  }

  // If user already has a password, require current password
  if (user.passwordHash) {
    if (!currentPassword) {
      return c.json({ error: "Απαιτείται ο τρέχων κωδικός" }, 400);
    }
    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) {
      return c.json({ error: "Λάθος τρέχων κωδικός" }, 401);
    }
  }

  const passwordHash = await hashPassword(newPassword);
  await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, user.id));

  return c.json({ success: true });
});
```

- [ ] **Step 7: Update GET `/me` to include `hasPassword`**

In the `auth.get("/me", ...)` handler, fetch the full user record to check for passwordHash. Replace the handler:

```ts
auth.get("/me", requireAuth, async (c) => {
  const authUser = c.get("user")!;

  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, authUser.id))
    .limit(1);

  const kava = c.get("kava");

  return c.json({
    user: {
      id: authUser.id,
      email: authUser.email,
      name: authUser.name,
      role: authUser.role,
      hasPassword: !!user?.passwordHash,
    },
    kava: kava
      ? {
          id: kava.id,
          name: kava.name,
          slug: kava.slug,
        }
      : null,
  });
});
```

- [ ] **Step 8: Run typecheck**

```bash
pnpm typecheck
```

Fix any errors before proceeding.

- [ ] **Step 9: Commit**

```bash
git add packages/api/src/routes/auth.ts
git commit -m "feat: add password login, forgot/reset/change password API routes"
```

---

### Task 6: Platform Register — Optional Password

**Files:**
- Modify: `packages/api/src/routes/platform.ts`

- [ ] **Step 1: Add password hashing import**

At the top of `packages/api/src/routes/platform.ts`, add:

```ts
import { hashPassword } from "../auth/password";
```

- [ ] **Step 2: Hash password on registration if provided**

In the `platform.post("/register", ...)` handler, after `const { name, slug, email } = parsed.data;`, add:

```ts
const { password } = parsed.data;
```

Then update the `db.insert(users).values(...)` call to include the password hash. Change:

```ts
    .insert(users)
    .values({
      email,
      name,
      role: "owner",
      kavaId: kava.id,
    })
```

to:

```ts
    .insert(users)
    .values({
      email,
      name,
      role: "owner",
      kavaId: kava.id,
      passwordHash: password ? await hashPassword(password) : null,
    })
```

- [ ] **Step 3: If password was provided, skip magic link — auto-login instead**

After the owner user is created and seed products are imported, replace the magic link token creation + email block at the end with conditional logic:

```ts
  if (password) {
    // Password was set during registration — no magic link needed
    return c.json({ success: true, slug, hasPassword: true });
  }

  // No password — send magic link for first login
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await db.insert(magicLinkTokens).values({
    email,
    token,
    kavaId: kava.id,
    expiresAt,
    purpose: "login",
  });

  const link = `${config.protocol}://${slug}.${config.baseDomain}/auth/verify?token=${token}`;
  await sendMagicLink(email, link, name);

  return c.json({ success: true, slug });
```

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routes/platform.ts
git commit -m "feat: support optional password on kava registration"
```

---

### Task 7: Frontend — Update Login Page

**Files:**
- Modify: `packages/web/src/lib/hooks/use-login.ts`
- Modify: `packages/web/src/pages/auth/LoginPage.tsx`

- [ ] **Step 1: Update use-login hook**

Replace `packages/web/src/lib/hooks/use-login.ts` with:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { api } from "../api";
import type { LoginInput } from "@kava-now/shared";

interface LoginResponse {
  success: boolean;
  redirect?: string;
  user?: { id: string; email: string; name: string; role: string };
}

export function useLogin() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (data: LoginInput) =>
      api.post<LoginResponse>("/api/auth/login", data),
    onSuccess: (data) => {
      if (data.redirect) {
        queryClient.invalidateQueries({ queryKey: ["auth"] });
        navigate(data.redirect, { replace: true });
      }
    },
  });
}
```

- [ ] **Step 2: Rewrite LoginPage for dual-mode form**

Replace `packages/web/src/pages/auth/LoginPage.tsx` with:

```tsx
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@kava-now/shared";
import { useLogin } from "../../lib/hooks/use-login";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Link } from "react-router";

export function LoginPage() {
  const login = useLogin();
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = (data: LoginInput) => {
    login.mutate(data, {
      onSuccess: (res) => {
        // If no redirect, it was a magic link request
        if (!res.redirect) {
          setMagicLinkSent(true);
        }
      },
    });
  };

  const sendMagicLink = () => {
    const email = getValues("email");
    if (!email) return;
    login.mutate(
      { email },
      {
        onSuccess: () => setMagicLinkSent(true),
      },
    );
  };

  if (magicLinkSent) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Ελέγξτε το email σας</h2>
        <p className="mt-2 text-sm text-gray-600">
          Ελέγξτε το email σας για τον σύνδεσμο εισόδου
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900 text-center">Σύνδεση</h2>

      <Input
        id="email"
        type="email"
        label="Email"
        placeholder="you@example.com"
        error={errors.email?.message}
        {...register("email")}
      />

      <Input
        id="password"
        type="password"
        label="Κωδικός"
        placeholder="Εισάγετε τον κωδικό σας"
        error={errors.password?.message}
        {...register("password")}
      />

      <div className="text-right">
        <Link
          to="/auth/forgot-password"
          className="text-sm text-amber-600 hover:text-amber-700"
        >
          Ξεχάσατε τον κωδικό;
        </Link>
      </div>

      {login.error && (
        <p className="text-sm text-red-600">
          {login.error instanceof Error ? login.error.message : "Κάτι πήγε στραβά"}
        </p>
      )}

      <Button type="submit" className="w-full" loading={login.isPending}>
        Σύνδεση
      </Button>

      <button
        type="button"
        onClick={sendMagicLink}
        className="w-full text-center text-sm text-gray-500 hover:text-amber-600 transition-colors"
      >
        Αποστολή συνδέσμου εισόδου στο email
      </button>

      <p className="text-center text-sm text-gray-500">
        Δεν έχετε λογαριασμό;{" "}
        <Link to="/register" className="text-amber-600 hover:text-amber-700 font-medium">
          Εγγραφή
        </Link>
      </p>
    </form>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/lib/hooks/use-login.ts packages/web/src/pages/auth/LoginPage.tsx
git commit -m "feat: update login page with password field and magic link option"
```

---

### Task 8: Frontend — Forgot Password & Reset Password Pages

**Files:**
- Create: `packages/web/src/pages/auth/ForgotPasswordPage.tsx`
- Create: `packages/web/src/pages/auth/ResetPasswordPage.tsx`
- Modify: `packages/web/src/App.tsx`

- [ ] **Step 1: Create ForgotPasswordPage**

Create `packages/web/src/pages/auth/ForgotPasswordPage.tsx`:

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  forgotPasswordSchema,
  type ForgotPasswordInput,
} from "@kava-now/shared";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Link } from "react-router";

export function ForgotPasswordPage() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const mutation = useMutation({
    mutationFn: (data: ForgotPasswordInput) =>
      api.post("/api/auth/forgot-password", data),
  });

  const onSubmit = (data: ForgotPasswordInput) => {
    mutation.mutate(data);
  };

  if (mutation.isSuccess) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Ελέγξτε το email σας</h2>
        <p className="mt-2 text-sm text-gray-600">
          Αν υπάρχει λογαριασμός με αυτό το email, θα λάβετε σύνδεσμο επαναφοράς κωδικού.
        </p>
        <Link
          to="/login"
          className="mt-4 inline-block text-sm text-amber-600 hover:text-amber-700 font-medium"
        >
          Επιστροφή στη σύνδεση
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900 text-center">
        Επαναφορά κωδικού
      </h2>
      <p className="text-sm text-gray-500 text-center">
        Εισάγετε το email σας και θα σας στείλουμε σύνδεσμο επαναφοράς.
      </p>

      <Input
        id="email"
        type="email"
        label="Email"
        placeholder="you@example.com"
        error={errors.email?.message}
        {...register("email")}
      />

      {mutation.error && (
        <p className="text-sm text-red-600">
          {mutation.error instanceof Error ? mutation.error.message : "Κάτι πήγε στραβά"}
        </p>
      )}

      <Button type="submit" className="w-full" loading={mutation.isPending}>
        Αποστολή συνδέσμου
      </Button>

      <p className="text-center text-sm text-gray-500">
        <Link to="/login" className="text-amber-600 hover:text-amber-700 font-medium">
          Επιστροφή στη σύνδεση
        </Link>
      </p>
    </form>
  );
}
```

- [ ] **Step 2: Create ResetPasswordPage**

Create `packages/web/src/pages/auth/ResetPasswordPage.tsx`:

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { resetPasswordSchema, type ResetPasswordInput } from "@kava-now/shared";
import { useMutation } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { api } from "../../lib/api";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Link } from "react-router";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token },
  });

  const mutation = useMutation({
    mutationFn: (data: ResetPasswordInput) =>
      api.post("/api/auth/reset-password", data),
  });

  const onSubmit = (data: ResetPasswordInput) => {
    mutation.mutate(data);
  };

  if (!token) {
    return (
      <div className="text-center">
        <h2 className="text-lg font-semibold text-gray-900">Μη έγκυρος σύνδεσμος</h2>
        <p className="mt-2 text-sm text-gray-600">
          Ο σύνδεσμος επαναφοράς δεν είναι έγκυρος.
        </p>
        <Link
          to="/auth/forgot-password"
          className="mt-4 inline-block text-sm text-amber-600 hover:text-amber-700 font-medium"
        >
          Ζητήστε νέο σύνδεσμο
        </Link>
      </div>
    );
  }

  if (mutation.isSuccess) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Ο κωδικός άλλαξε</h2>
        <p className="mt-2 text-sm text-gray-600">
          Μπορείτε τώρα να συνδεθείτε με τον νέο σας κωδικό.
        </p>
        <Link
          to="/login"
          className="mt-4 inline-block text-sm text-amber-600 hover:text-amber-700 font-medium"
        >
          Σύνδεση
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900 text-center">
        Νέος κωδικός
      </h2>

      <input type="hidden" {...register("token")} />

      <Input
        id="password"
        type="password"
        label="Νέος κωδικός"
        placeholder="Τουλάχιστον 8 χαρακτήρες"
        error={errors.password?.message}
        {...register("password")}
      />

      <Input
        id="confirmPassword"
        type="password"
        label="Επιβεβαίωση κωδικού"
        placeholder="Επαναλάβετε τον κωδικό"
        error={errors.confirmPassword?.message}
        {...register("confirmPassword")}
      />

      {mutation.error && (
        <p className="text-sm text-red-600">
          {mutation.error instanceof Error ? mutation.error.message : "Κάτι πήγε στραβά"}
        </p>
      )}

      <Button type="submit" className="w-full" loading={mutation.isPending}>
        Αλλαγή κωδικού
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Add routes to App.tsx**

In `packages/web/src/App.tsx`, add imports for the new pages:

```tsx
import { ForgotPasswordPage } from "./pages/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/auth/ResetPasswordPage";
```

Add routes inside the `<Route element={<AuthLayout />}>` block, after the existing auth routes:

```tsx
<Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
<Route path="/auth/reset-password" element={<ResetPasswordPage />} />
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/pages/auth/ForgotPasswordPage.tsx packages/web/src/pages/auth/ResetPasswordPage.tsx packages/web/src/App.tsx
git commit -m "feat: add forgot password and reset password pages"
```

---

### Task 9: Frontend — Update Register Page

**Files:**
- Modify: `packages/web/src/pages/auth/RegisterPage.tsx`

- [ ] **Step 1: Add optional password fields to RegisterPage**

In `packages/web/src/pages/auth/RegisterPage.tsx`, add the password and confirm password fields after the email Input and before the error display:

```tsx
      <Input
        id="password"
        type="password"
        label="Κωδικός (προαιρετικό)"
        placeholder="Τουλάχιστον 8 χαρακτήρες"
        error={errors.password?.message}
        {...reg("password")}
      />

      <Input
        id="confirmPassword"
        type="password"
        label="Επιβεβαίωση κωδικού"
        placeholder="Επαναλάβετε τον κωδικό"
        error={errors.confirmPassword?.message}
        {...reg("confirmPassword")}
      />
```

- [ ] **Step 2: Update success message conditionally**

In the `mutation.isSuccess` block, update the success message to account for password registration. Replace the success return block:

```tsx
  if (mutation.isSuccess) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Επιτυχής εγγραφή!</h2>
        <p className="mt-2 text-sm text-gray-600">
          Ελέγξτε το email σας για τον σύνδεσμο εισόδου
        </p>
      </div>
    );
  }
```

This message is still appropriate: even with a password, the user navigates to their subdomain to log in. The message serves as confirmation that registration worked.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/pages/auth/RegisterPage.tsx
git commit -m "feat: add optional password fields to registration form"
```

---

### Task 10: Frontend — Change Password in Profile & Settings

**Files:**
- Modify: `packages/web/src/lib/hooks/use-auth.ts`
- Modify: `packages/web/src/pages/customer/ProfilePage.tsx`
- Modify: `packages/web/src/pages/admin/SettingsPage.tsx`

- [ ] **Step 1: Update useAuth hook to expose hasPassword**

In `packages/web/src/lib/hooks/use-auth.ts`, update the `AuthMeResponse` interface and return value:

```ts
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { Kava } from "@kava-now/shared";

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  hasPassword: boolean;
}

interface AuthMeResponse {
  user: AuthUser;
  kava: Kava;
}

export function useAuth() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api.get<AuthMeResponse>("/api/auth/me"),
    retry: false,
  });

  return {
    user: data?.user ?? null,
    kava: data?.kava ?? null,
    isLoading,
    isAuthenticated: !!data?.user,
    error,
  };
}
```

- [ ] **Step 2: Add change password section to ProfilePage**

Replace `packages/web/src/pages/customer/ProfilePage.tsx` with:

```tsx
import { useState } from "react";
import { useProfile } from "../../lib/hooks/use-profile";
import { useAuth } from "../../lib/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";

export function ProfilePage() {
  const { data: customer, isLoading } = useProfile();
  const { user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const changePassword = useMutation({
    mutationFn: (data: {
      currentPassword?: string;
      newPassword: string;
      confirmNewPassword: string;
    }) => api.post("/api/auth/change-password", data),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordError("");
    },
    onError: (err) => {
      setPasswordError(
        err instanceof Error ? err.message : "Κάτι πήγε στραβά",
      );
    },
  });

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");

    if (newPassword.length < 8) {
      setPasswordError("Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError("Οι κωδικοί δεν ταιριάζουν");
      return;
    }

    changePassword.mutate({
      ...(user?.hasPassword ? { currentPassword } : {}),
      newPassword,
      confirmNewPassword,
    });
  };

  if (isLoading) {
    return (
      <div className="text-center text-sm text-gray-500 py-8">Φόρτωση...</div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center text-sm text-gray-500 py-8">
        Δεν βρέθηκε προφίλ πελάτη.
      </div>
    );
  }

  const fields = [
    { label: "Επωνυμία", value: customer.name },
    { label: "Email", value: customer.email },
    { label: "Τηλέφωνο", value: customer.phone },
    { label: "Υπεύθυνος επικοινωνίας", value: customer.contactPerson },
    { label: "Διεύθυνση", value: customer.address },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Προφίλ</h1>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white shadow-sm">
        <dl className="divide-y divide-gray-100">
          {fields.map((field) => (
            <div
              key={field.label}
              className="flex flex-col sm:flex-row sm:items-center px-4 py-3"
            >
              <dt className="text-sm font-medium text-gray-500 sm:w-48">
                {field.label}
              </dt>
              <dd className="mt-1 sm:mt-0 text-sm text-gray-900">
                {field.value || (
                  <span className="text-gray-400">-</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">
          {user?.hasPassword ? "Αλλαγή κωδικού" : "Ορισμός κωδικού"}
        </h2>
        <form
          onSubmit={handleChangePassword}
          className="mt-4 max-w-md space-y-4"
        >
          {user?.hasPassword && (
            <Input
              id="currentPassword"
              type="password"
              label="Τρέχων κωδικός"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          )}
          <Input
            id="newPassword"
            type="password"
            label="Νέος κωδικός"
            placeholder="Τουλάχιστον 8 χαρακτήρες"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <Input
            id="confirmNewPassword"
            type="password"
            label="Επιβεβαίωση νέου κωδικού"
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
          />

          {passwordError && (
            <p className="text-sm text-red-600">{passwordError}</p>
          )}

          {changePassword.isSuccess && (
            <p className="text-sm text-green-600">
              Ο κωδικός άλλαξε επιτυχώς
            </p>
          )}

          <Button type="submit" loading={changePassword.isPending}>
            {user?.hasPassword ? "Αλλαγή κωδικού" : "Ορισμός κωδικού"}
          </Button>
        </form>
      </div>

      <p className="mt-4 text-xs text-gray-400">
        Για αλλαγές στα στοιχεία σας, επικοινωνήστε με τον προμηθευτή σας.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Add change password section to SettingsPage**

In `packages/web/src/pages/admin/SettingsPage.tsx`, add imports at the top:

```tsx
import { useAuth } from "../../lib/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";
```

Inside the `SettingsPage` component, after the existing state declarations, add:

```tsx
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const changePassword = useMutation({
    mutationFn: (data: {
      currentPassword?: string;
      newPassword: string;
      confirmNewPassword: string;
    }) => api.post("/api/auth/change-password", data),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordError("");
    },
    onError: (err) => {
      setPasswordError(
        err instanceof Error ? err.message : "Κάτι πήγε στραβά",
      );
    },
  });

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");

    if (newPassword.length < 8) {
      setPasswordError("Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError("Οι κωδικοί δεν ταιριάζουν");
      return;
    }

    changePassword.mutate({
      ...(user?.hasPassword ? { currentPassword } : {}),
      newPassword,
      confirmNewPassword,
    });
  };
```

Then, after the closing `</form>` of the existing settings form (before the closing `</div>`), add:

```tsx
      <form onSubmit={handleChangePassword} className="mt-6 max-w-2xl space-y-6">
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {user?.hasPassword ? "Αλλαγή κωδικού" : "Ορισμός κωδικού"}
          </h2>
          <div className="space-y-4">
            {user?.hasPassword && (
              <Input
                id="currentPassword"
                type="password"
                label="Τρέχων κωδικός"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            )}
            <Input
              id="newPassword"
              type="password"
              label="Νέος κωδικός"
              placeholder="Τουλάχιστον 8 χαρακτήρες"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <Input
              id="confirmNewPassword"
              type="password"
              label="Επιβεβαίωση νέου κωδικού"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
            />

            {passwordError && (
              <p className="text-sm text-red-600">{passwordError}</p>
            )}

            {changePassword.isSuccess && (
              <p className="text-sm text-green-600">
                Ο κωδικός άλλαξε επιτυχώς
              </p>
            )}
          </div>
        </Card>
        <div className="flex justify-end">
          <Button type="submit" loading={changePassword.isPending}>
            {user?.hasPassword ? "Αλλαγή κωδικού" : "Ορισμός κωδικού"}
          </Button>
        </div>
      </form>
```

Note: The `useMutation` import and `api` import are already available — `useMutation` is pulled in from `@tanstack/react-query`, and `api` from `../../lib/api`. The `useState` import is already present too.

- [ ] **Step 4: Run typecheck and dev server**

```bash
pnpm typecheck
pnpm dev
```

Verify the app loads and navigate to login, register, and settings pages.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/hooks/use-auth.ts packages/web/src/pages/customer/ProfilePage.tsx packages/web/src/pages/admin/SettingsPage.tsx
git commit -m "feat: add change password UI to profile and settings pages"
```

---

### Task 11: Manual Verification

- [ ] **Step 1: Start dev infrastructure**

```bash
docker compose -f docker-compose.dev.yml up -d
pnpm db:migrate
pnpm dev
```

- [ ] **Step 2: Test password registration**

1. Go to `http://lvh.me:5173/register`
2. Register a new kava with a password
3. Navigate to `http://<slug>.lvh.me:5173/login`
4. Log in with the password

- [ ] **Step 3: Test magic link login (still works)**

1. On the login page, enter email and click "Αποστολή συνδέσμου εισόδου στο email"
2. Check Mailpit at `http://localhost:8025`
3. Click the magic link and verify redirect

- [ ] **Step 4: Test forgot/reset password**

1. Go to login page, click "Ξεχάσατε τον κωδικό;"
2. Enter email, submit
3. Check Mailpit for reset email
4. Click the link, set new password
5. Log in with the new password

- [ ] **Step 5: Test change password**

1. Log in as admin, go to Settings
2. Set or change password
3. Log out, log back in with new password

- [ ] **Step 6: Test customer change password**

1. Log in as customer, go to Profile
2. Set or change password
3. Log out, log back in with new password

- [ ] **Step 7: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during manual testing"
```
