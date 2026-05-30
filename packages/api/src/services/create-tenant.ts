import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db } from "../db/connection";
import { accounts, tenantMemberships, tenants, users } from "../db/schema/index";

export interface CreateTenantInput {
  name: string;
  slug: string;
  email: string;
  password?: string | null;
}

export interface CreateTenantResult {
  tenantId: string;
  ownerUserId: string;
  isNewUser: boolean;
}

/**
 * Create a tenant and its owner (user + membership) atomically.
 *
 * If the owner email is new and a password is provided, a credential account is
 * inserted directly. (better-auth's `signUpEmail` cannot be used — the
 * invite-only `databaseHooks.user.create.before` hook rejects it, which
 * previously left an owner-less, orphaned tenant.) All writes run in a single
 * transaction, so any failure rolls back the tenant too — there is no path that
 * creates a tenant without an owner.
 *
 * The caller sends the set-password invite when `isNewUser` is true and no
 * password was provided.
 */
export async function createTenantWithOwner({
  name,
  slug,
  email,
  password,
}: CreateTenantInput): Promise<CreateTenantResult> {
  return db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({ name, slug, email })
      .returning({ id: tenants.id });
    if (!tenant) throw new Error("Tenant insert returned no row");

    const [existingUser] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    let ownerUserId: string;
    let isNewUser = false;

    if (existingUser) {
      ownerUserId = existingUser.id;
    } else {
      isNewUser = true;
      const [created] = await tx
        .insert(users)
        .values({ email, name, emailVerified: false })
        .returning({ id: users.id });
      if (!created) throw new Error("User insert returned no row");
      ownerUserId = created.id;

      if (password) {
        await tx.insert(accounts).values({
          accountId: ownerUserId,
          providerId: "credential",
          userId: ownerUserId,
          password: await hashPassword(password),
        });
      }
    }

    await tx.insert(tenantMemberships).values({
      userId: ownerUserId,
      tenantId: tenant.id,
      role: "owner",
    });

    return { tenantId: tenant.id, ownerUserId, isNewUser };
  });
}
