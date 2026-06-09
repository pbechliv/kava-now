import { eq, and, like } from "drizzle-orm";
import { afterTenantCommit, db } from "../db/connection";
import { accounts, tenantMemberships, tenants, users, verifications } from "../db/schema/index";
import { isUniqueViolation, UNIQUE_CONSTRAINTS } from "../db/errors";
import { auth } from "../auth";
import { config } from "../config";
import { sendMembershipAdded } from "./email";
import type { Context } from "hono";
import type { AppEnv } from "../types";
import {
  API_ERROR_CODES,
  normalizeEmail,
  type ApiErrorCode,
  type MembershipRole,
} from "@kava-now/shared";

interface InviteOptions {
  c: Context<AppEnv>;
  tenantId: string;
  email: string;
  name: string;
  role: MembershipRole;
  customerId?: string | null;
  inviterId?: string | null;
}

export class InviteConflict extends Error {
  readonly code: ApiErrorCode;
  constructor(message: string, code: ApiErrorCode = API_ERROR_CODES.DUPLICATE_TENANT_MEMBERSHIP) {
    super(message);
    this.name = "InviteConflict";
    this.code = code;
  }
}

/**
 * Attach a user to a tenant with a role. Two paths:
 * - Email already exists globally: create the membership only; notify the
 *   existing user that they were added (they sign in with their existing
 *   password).
 * - Email is new: create the user without a password, create the membership,
 *   send a set-password invite that lands them on `/k/<slug>/welcome`.
 *
 * Throws `InviteConflict` if the user already has a membership in this tenant.
 */
export async function inviteUserToTenant({
  c,
  tenantId,
  email: rawEmail,
  name,
  role,
  customerId = null,
  inviterId = null,
}: InviteOptions): Promise<void> {
  // One users row per human — mixed-case invites must dedupe to it (#53).
  const email = normalizeEmail(rawEmail);
  const [tenant] = await db
    .select({ slug: tenants.slug, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!tenant) throw new Error("Tenant not found");

  const membershipValues = { tenantId, role, customerId, invitedById: inviterId };

  // The duplicate-membership check is the unique constraint itself (no SELECT
  // pre-check — that was racy under concurrent invites). Every insert runs in
  // a nested transaction (savepoint): a unique violation inside the
  // per-request tenant transaction would otherwise abort it, silently turning
  // the final COMMIT into a ROLLBACK while the handler keeps going (#46).
  const insertMembershipOrConflict = async (userId: string) => {
    try {
      await db.transaction(async (tx) => {
        await tx.insert(tenantMemberships).values({ userId, ...membershipValues });
      });
    } catch (err) {
      if (isUniqueViolation(err, UNIQUE_CONSTRAINTS.tenantMembership)) {
        throw new InviteConflict("User is already a member of this tenant");
      }
      throw err;
    }
  };

  // Emails dispatch after the request transaction commits (#47): sending
  // inside it would hold the pooled connection across SMTP latency, and the
  // invitee would get a mail even if the surrounding request rolled back.
  const notifyMembershipAdded = () =>
    afterTenantCommit(async () => {
      // Best-effort notification — the membership is already persisted.
      try {
        const loginUrl = `${config.appOrigin}/k/${tenant.slug}/login`;
        await sendMembershipAdded(email, loginUrl, tenant.name);
      } catch (err) {
        console.error("[invite] Failed to send membership-added notification:", err);
      }
    });

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser) {
    await insertMembershipOrConflict(existingUser.id);
    await notifyMembershipAdded();
    return;
  }

  // New email → create user + membership atomically (savepoint).
  try {
    await db.transaction(async (tx) => {
      const [createdUser] = await tx
        .insert(users)
        .values({ email, name, emailVerified: false })
        .returning({ id: users.id });
      if (!createdUser) throw new Error("User insert returned no row");
      await tx.insert(tenantMemberships).values({ userId: createdUser.id, ...membershipValues });
    });
  } catch (err) {
    if (isUniqueViolation(err, UNIQUE_CONSTRAINTS.userEmail)) {
      // Lost a cross-request race: the user appeared since our lookup. The
      // savepoint rolled back cleanly — fall back to the existing-user path.
      const [racedUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (!racedUser) throw err;
      await insertMembershipOrConflict(racedUser.id);
      await notifyMembershipAdded();
      return;
    }
    if (isUniqueViolation(err, UNIQUE_CONSTRAINTS.tenantMembership)) {
      throw new InviteConflict("User is already a member of this tenant");
    }
    throw err;
  }

  // Post-commit too: requestPasswordReset both *reads* the user row and
  // *writes* the verification token — those must hit the base pool after the
  // user insert is committed, not the request transaction.
  await afterTenantCommit(async () => {
    try {
      await sendInviteSetPassword(c, email, tenant.slug);
    } catch (err) {
      console.error("[invite] Failed to send set-password invite:", err);
    }
  });
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
  tenantSlug: string,
): Promise<void> {
  const redirectTo = `${config.appOrigin}/k/${tenantSlug}/welcome`;

  await auth.api.requestPasswordReset({
    body: { email, redirectTo },
    headers: c.req.raw.headers,
  });
}

export type ResendInviteResult =
  | { ok: true }
  | { ok: false; status: 400 | 404; code?: ApiErrorCode; error: string };

/**
 * Re-issue the set-password invite for a not-yet-activated member of this
 * tenant. Shared by the staff and customer-user resend endpoints; returns a
 * result object the routes map onto their HTTP responses.
 */
export async function resendSetPasswordInvite(opts: {
  c: Context<AppEnv>;
  tenantId: string;
  tenantSlug: string;
  userId: string;
  customerId?: string;
}): Promise<ResendInviteResult> {
  const conditions = [
    eq(tenantMemberships.userId, opts.userId),
    eq(tenantMemberships.tenantId, opts.tenantId),
  ];
  if (opts.customerId) {
    conditions.push(eq(tenantMemberships.customerId, opts.customerId));
  }

  const [target] = await db
    .select({ id: users.id, email: users.email })
    .from(tenantMemberships)
    .innerJoin(users, eq(users.id, tenantMemberships.userId))
    .where(and(...conditions))
    .limit(1);

  if (!target) {
    return { ok: false, status: 404, error: "User not found" };
  }
  if (await userHasPassword(target.id)) {
    return {
      ok: false,
      status: 400,
      code: API_ERROR_CODES.USER_ALREADY_ACTIVATED,
      error: "User is already activated",
    };
  }

  // Invalidate outstanding reset tokens so the fresh link is the only valid
  // one. better-auth stores them as identifier "reset-password:<token>" with
  // the user id in `value` — the old delete matched identifier = email,
  // i.e. zero rows, leaving stale invite links live until expiry (#57).
  await db
    .delete(verifications)
    .where(
      and(like(verifications.identifier, "reset-password:%"), eq(verifications.value, target.id)),
    );

  await sendInviteSetPassword(opts.c, target.email, opts.tenantSlug);
  return { ok: true };
}

/**
 * Whether the given user has set a password (has a credential account row).
 */
export async function userHasPassword(userId: string): Promise<boolean> {
  // Credential rows only — a Google-linked account row is not a password
  // (keeps this consistent with /me's hasPassword).
  const [row] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
    .limit(1);
  return !!row;
}
