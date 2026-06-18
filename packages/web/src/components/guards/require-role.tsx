import { Navigate, useParams } from "@tanstack/react-router";
import { useAuth } from "@/lib/hooks/use-auth";
import { getUserHomePath } from "@/lib/auth-home";
import type { MembershipRole } from "@kava-now/shared";

interface RequireRoleProps {
  allowed: Array<MembershipRole | "superadmin">;
  children: React.ReactNode;
}

/**
 * Allow access if:
 * - user is superadmin and `superadmin` is in `allowed`, OR
 * - user has a membership in the current `:slug` tenant whose role is in `allowed`.
 *
 * Otherwise redirect to the user's own home.
 */
export function RequireRole({ allowed, children }: RequireRoleProps) {
  const { user, memberships, currentMembership } = useAuth();
  const { slug: routeSlug } = useParams({ strict: false });

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.isSuperAdmin && allowed.includes("superadmin")) {
    return <>{children}</>;
  }

  // Tenant-mismatch: user is logged in but has no membership in this slug.
  if (routeSlug && !currentMembership) {
    return <Navigate to={getUserHomePath(user, memberships, null)} replace />;
  }

  if (currentMembership && allowed.includes(currentMembership.role)) {
    return <>{children}</>;
  }

  return <Navigate to={getUserHomePath(user, memberships, routeSlug ?? null)} replace />;
}
