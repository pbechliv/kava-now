import { sql } from "drizzle-orm";
import { accounts, users } from "./schema/index";

/**
 * Correlated `exists` on `accounts` — whether the user has any way to sign in
 * yet, credential or OAuth. Shared by the admin user lists, which show an
 * "invite pending" badge (and a resend button) when it's false.
 *
 * Deliberately *not* `users.emailVerified`: nothing in this app flips that when
 * an invitee activates by setting a password (email verification is off and
 * better-auth's resetPassword doesn't touch it), so it stays false forever.
 * Deliberately not credential-only either — a user who activated through Google
 * has no credential row but is very much activated.
 */
export const userActivated = sql<boolean>`exists (
  select 1 from ${accounts} where ${accounts.userId} = ${users.id}
)`;
