# Password Authentication

Add optional password-based login alongside the existing magic link flow. All user roles (owner, staff, customer) can set a password. Users who never set a password continue using magic links only.

## Database Changes

### `users` table

- Add nullable `passwordHash text` column. `NULL` means the user has no password set (magic-link-only).

### `magic_link_tokens` table

- Add `purpose text NOT NULL DEFAULT 'login'` column. Values: `'login'` | `'reset'`.
- Existing rows are unaffected (they default to `'login'`).

One new Drizzle migration covers both changes.

## Shared Schema Changes

### Updated schemas

**`loginSchema`** — add optional `password` string field (email remains required).

**`registerSchema`** — add optional `password` (min 8 chars) and `confirmPassword` fields with a refine to check they match. Both omitted or both present.

### New schemas

**`forgotPasswordSchema`** — `{ email: string }`

**`resetPasswordSchema`** — `{ token: string, password: string (min 8), confirmPassword: string }` with match refine.

**`changePasswordSchema`** — `{ currentPassword?: string, newPassword: string (min 8), confirmNewPassword: string }` with match refine. `currentPassword` is optional so users who have never set a password can set one for the first time without providing a current password. The API enforces that `currentPassword` is required when the user already has a password hash.

## API Changes

### Password hashing utility

`packages/api/src/auth/password.ts` — uses Node.js built-in `crypto.scrypt` (no new dependency). Exports `hashPassword(plain): Promise<string>` and `verifyPassword(plain, hash): Promise<boolean>`. Hash format: `salt:derivedKey` (both hex-encoded).

### Route changes

**POST `/auth/login`** (updated)

- If `password` is provided: look up user by email + kavaId, verify password against `passwordHash`. Return 401 on mismatch. Create Lucia session on success.
- If `password` is omitted: existing magic link flow (unchanged).
- Still returns success even when user not found (prevents email enumeration), except for password login where a generic "invalid email or password" error is returned.

**POST `/auth/forgot-password`** (new)

- Accepts `{ email }`. Looks up user by email + kavaId.
- Creates a `magic_link_tokens` row with `purpose: 'reset'`, 15-minute expiry.
- Sends password reset email with link to `/auth/reset-password?token=<token>`.
- Always returns success (prevents email enumeration).

**POST `/auth/reset-password`** (new)

- Accepts `{ token, password, confirmPassword }`.
- Validates token with `purpose: 'reset'`, marks it used.
- Hashes password, updates `users.passwordHash`.
- Does NOT create a session — user must log in after resetting.

**POST `/auth/change-password`** (new, authenticated)

- Accepts `{ currentPassword?, newPassword, confirmNewPassword }`.
- If user has a `passwordHash`: `currentPassword` is required, verify it first.
- If user has no `passwordHash` (first time setting): `currentPassword` not required.
- Hashes `newPassword`, updates `users.passwordHash`.

**POST `/platform/register`** (updated)

- If `password` provided in body: hash it and store in `users.passwordHash` for the new owner user.
- If omitted: magic link flow as before (passwordHash stays NULL).

**GET `/auth/me`** (updated)

- Add `hasPassword: boolean` to the user object in the response (true if `passwordHash` is not null).

## Frontend Changes

### LoginPage (updated)

- Default view: email + password fields with "Login" button.
- Below the form: "Send magic link instead" secondary action. Clicking it sends the magic link (email-only, same as current behavior) and shows the "check your email" confirmation.
- "Forgot password?" link below the password field, navigates to `/auth/forgot-password`.

### ForgotPasswordPage (new) — `/auth/forgot-password`

- Email input + submit button.
- On success: shows "check your email for reset link" confirmation.
- Link back to login page.

### ResetPasswordPage (new) — `/auth/reset-password`

- Reads `token` from query string.
- New password + confirm password fields.
- On success: shows confirmation with link to login page.
- On invalid/expired token: shows error with link to forgot password page.

### RegisterPage (updated)

- Add optional password + confirm password fields below existing fields.
- Helper text indicating password is optional and they can use magic links instead.

### Profile/Settings — Change Password section

- If `hasPassword` is false: new password + confirm fields only (no current password).
- If `hasPassword` is true: current password + new password + confirm fields.
- Submit calls POST `/auth/change-password`.

## Email Templates

**Reset password email** — similar to the existing magic link email but with different copy: "Reset your password" subject, link points to `/auth/reset-password?token=<token>`.

Reuse the existing `sendMagicLink` pattern, adding a new `sendPasswordReset` function in `packages/api/src/services/email.ts`.
