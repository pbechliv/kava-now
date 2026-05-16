import { eq, and } from "drizzle-orm";
import { db } from "../db/connection";
import { accounts, kavaMemberships, kavas, users } from "../db/schema/index";
import { auth } from "../auth";
import { config } from "../config";
import { sendMembershipAdded } from "./email";
import type { Context } from "hono";
import type { AppEnv } from "../types";
import type { MembershipRole } from "@kava-now/shared";

interface InviteOptions {
  c: Context<AppEnv>;
  kavaId: string;
  email: string;
  name: string;
  role: MembershipRole;
  customerId?: string | null;
  inviterId?: string | null;
}

export class InviteConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InviteConflict";
  }
}

/**
 * Attach a user to a kava with a role. Two paths:
 * - Email already exists globally: create the membership only; notify the
 *   existing user that they were added (they sign in with their existing
 *   password).
 * - Email is new: create the user without a password, create the membership,
 *   send a set-password invite that lands them on `/k/<slug>/welcome`.
 *
 * Throws `InviteConflict` if the user already has a membership in this kava.
 */
export async function inviteUserToKava({
  c,
  kavaId,
  email,
  name,
  role,
  customerId = null,
  inviterId = null,
}: InviteOptions): Promise<void> {
  const [kava] = await db
    .select({ slug: kavas.slug, name: kavas.name })
    .from(kavas)
    .where(eq(kavas.id, kavaId))
    .limit(1);
  if (!kava) throw new Error("Δεν βρέθηκε κάβα");

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser) {
    const [existingMembership] = await db
      .select({ id: kavaMemberships.id })
      .from(kavaMemberships)
      .where(and(eq(kavaMemberships.userId, existingUser.id), eq(kavaMemberships.kavaId, kavaId)))
      .limit(1);
    if (existingMembership) {
      throw new InviteConflict("Αυτός ο χρήστης είναι ήδη μέλος αυτής της κάβας");
    }

    await db.insert(kavaMemberships).values({
      userId: existingUser.id,
      kavaId,
      role,
      customerId,
      invitedById: inviterId,
    });

    // Best-effort notification — the membership is already persisted.
    try {
      const loginUrl = `${config.appOrigin}/k/${kava.slug}/login`;
      await sendMembershipAdded(email, loginUrl, kava.name);
    } catch (err) {
      console.error("[invite] Failed to send membership-added notification:", err);
    }
    return;
  }

  const [createdUser] = await db
    .insert(users)
    .values({ email, name, emailVerified: false })
    .returning({ id: users.id });
  if (!createdUser) throw new Error("Αποτυχία δημιουργίας χρήστη");

  await db.insert(kavaMemberships).values({
    userId: createdUser.id,
    kavaId,
    role,
    customerId,
    invitedById: inviterId,
  });

  await sendInviteSetPassword(c, email, kava.slug);
}

/**
 * Issue a fresh reset-password token for `email` and dispatch the invite
 * email. The link points the invitee at `/k/<slug>/welcome` on the single
 * app origin; the `/welcome` path is what better-auth's `sendResetPassword`
 * callback keys on to render the "invite" copy.
 */
export async function sendInviteSetPassword(
  c: Context<AppEnv>,
  email: string,
  kavaSlug: string,
): Promise<void> {
  const redirectTo = `${config.appOrigin}/k/${kavaSlug}/welcome`;

  await auth.api.requestPasswordReset({
    body: { email, redirectTo },
    headers: c.req.raw.headers,
  });
}

/**
 * Whether the given user has set a password (has a credential account row).
 */
export async function userHasPassword(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .limit(1);
  return !!row;
}
