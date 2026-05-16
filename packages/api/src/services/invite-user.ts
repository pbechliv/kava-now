import { eq, and } from "drizzle-orm";
import { encodeAuthEmail } from "@kava-now/shared";
import { db } from "../db/connection";
import { users, kavas } from "../db/schema/index";
import { auth } from "../auth";
import { config } from "../config";
import type { Context } from "hono";
import type { AppEnv } from "../types";

export type InviteRole = "owner" | "staff" | "customer";

interface InviteOptions {
  c: Context<AppEnv>;
  kavaId: string;
  email: string; // real email
  name: string;
  role: InviteRole;
  customerId?: string | null;
  inviterId?: string | null;
}

/**
 * Create a user in a kava and send a set-password invite. Throws if a user
 * with the same real email already exists in this kava (per-kava uniqueness).
 *
 * The email lands the invitee on /welcome on the tenant's subdomain. The page
 * consumes the reset-password token to set the user's initial password.
 */
export async function inviteUserToKava({
  c,
  kavaId,
  email: realEmail,
  name,
  role,
  customerId = null,
  inviterId = null,
}: InviteOptions): Promise<void> {
  const [kava] = await db
    .select({ slug: kavas.slug })
    .from(kavas)
    .where(eq(kavas.id, kavaId))
    .limit(1);
  if (!kava) throw new Error("Δεν βρέθηκε κάβα");

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.realEmail, realEmail), eq(users.kavaId, kavaId)))
    .limit(1);
  if (existing) {
    throw new InviteConflict("Αυτό το email χρησιμοποιείται ήδη σε αυτήν την κάβα");
  }

  const authEmail = encodeAuthEmail(realEmail, kava.slug);

  await db.insert(users).values({
    email: authEmail,
    realEmail,
    name,
    role,
    kavaId,
    customerId,
    invitedById: inviterId,
  });

  await sendInviteSetPassword(c, authEmail, kava.slug);
}

/**
 * Issue a fresh reset-password token for `authEmail` and dispatch the
 * invite email. The link points the invitee at `<slug>.<baseDomain>/welcome`
 * so they land on the correct tenant subdomain. The `/welcome` path is what
 * the `sendResetPassword` callback in auth/index.ts keys on to pick the
 * "invite" copy.
 */
export async function sendInviteSetPassword(
  c: Context<AppEnv>,
  authEmail: string,
  kavaSlug: string,
): Promise<void> {
  const redirectTo = `${config.protocol}://${kavaSlug}.${config.baseDomain}/welcome`;

  await auth.api.requestPasswordReset({
    body: { email: authEmail, redirectTo },
    headers: c.req.raw.headers,
  });
}

export class InviteConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InviteConflict";
  }
}
