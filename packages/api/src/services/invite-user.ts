import { eq, and } from "drizzle-orm";
import { encodeAuthEmail } from "@kava-now/shared";
import { db } from "../db/connection";
import { users, kavas } from "../db/schema/index";
import { auth } from "../auth";
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
 * Create a user in a kava and send a magic-link invite. Throws if a user
 * with the same real email already exists in this kava (per-kava uniqueness).
 *
 * The magic-link email lands the invitee on /welcome on the same subdomain
 * that triggered the invite.
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

  const requestHost = c.req.header("x-forwarded-host") || c.req.header("host") || "";
  const protocol = requestHost.includes("localhost") ? "http" : "https";
  const callbackURL = `${protocol}://${requestHost}/welcome`;

  await auth.api.signInMagicLink({
    body: { email: authEmail, callbackURL },
    headers: c.req.raw.headers,
  });
}

export class InviteConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InviteConflict";
  }
}
