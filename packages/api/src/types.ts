import type { InferSelectModel } from "drizzle-orm";
import type { MembershipRole } from "@kava-now/shared";
import type { tenants } from "./db/schema/index";
import type { auth } from "./auth";

export type Tenant = InferSelectModel<typeof tenants>;
export type AuthUser = typeof auth.$Infer.Session.user;
export type AuthSession = typeof auth.$Infer.Session.session;

/**
 * Resolved membership for the current request — `requireRole` populates this
 * after looking up `tenant_memberships` for the authenticated user and the
 * tenant resolved from the URL.
 */
export interface RequestMembership {
  role: MembershipRole;
  customerId: string | null;
}

export type AppEnv = {
  Variables: {
    tenant: Tenant | null;
    tenantId: string | null;
    user: AuthUser | null;
    session: AuthSession | null;
    membership: RequestMembership | null;
  };
};
