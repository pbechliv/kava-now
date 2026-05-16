import type { KavaMembership } from "@kava-now/shared";
import type { AuthUser } from "./hooks/use-auth";

/**
 * Where this user belongs after authentication.
 *
 * Priority: superadmin → /admin/kavas. If the user just logged in inside a
 * specific tenant route (`preferSlug` matches one of their memberships), go
 * to that tenant's home. With a single membership, go straight there. With
 * multiple, fall back to the kava picker on `/`.
 */
export function getUserHomePath(
  user: AuthUser,
  memberships: KavaMembership[],
  preferSlug?: string | null,
): string {
  if (user.isSuperAdmin) return "/admin/kavas";

  if (preferSlug) {
    const match = memberships.find((m) => m.kavaSlug === preferSlug);
    if (match) return membershipHome(match);
  }

  if (memberships.length === 1) {
    return membershipHome(memberships[0]!);
  }
  return "/";
}

export function membershipHome(m: KavaMembership): string {
  return m.role === "customer" ? `/k/${m.kavaSlug}/catalog` : `/k/${m.kavaSlug}/admin/dashboard`;
}
