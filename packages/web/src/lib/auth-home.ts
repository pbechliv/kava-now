import type { TenantMembership } from "@kava-now/shared";
import type { AuthUser } from "./hooks/use-auth";

/**
 * Where this user belongs after authentication.
 *
 * Priority: superadmin → /admin/tenants. If the user just logged in inside a
 * specific tenant route (`preferSlug` matches one of their memberships), go
 * to that tenant's home. With a single membership, go straight there. With
 * multiple, fall back to the tenant picker on `/`.
 */
export function getUserHomePath(
  user: AuthUser,
  memberships: TenantMembership[],
  preferSlug?: string | null,
): string {
  if (user.isSuperAdmin) return "/admin/tenants";

  if (preferSlug) {
    const match = memberships.find((m) => m.tenantSlug === preferSlug);
    if (match) return membershipHome(match);
  }

  const [only] = memberships;
  if (memberships.length === 1 && only) {
    return membershipHome(only);
  }
  return "/";
}

export function membershipHome(m: TenantMembership): string {
  return m.role === "customer" ? `/k/${m.tenantSlug}/catalog` : `/k/${m.tenantSlug}/admin/dashboard`;
}

/**
 * The in-app path RequireAuth stashed in location.state before bouncing to
 * login. Validated so a crafted state can't open-redirect: same-origin
 * pathnames only ("/x", never "//host" or absolute URLs).
 */
export function returnPathFromState(state: unknown): string | null {
  const from = (state as { from?: { pathname?: string; search?: string } } | null)?.from;
  const pathname = from?.pathname;
  if (!pathname || !pathname.startsWith("/") || pathname.startsWith("//")) return null;
  return pathname + (from?.search ?? "");
}
