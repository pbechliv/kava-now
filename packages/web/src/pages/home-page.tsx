import { Navigate, useParams } from "@tanstack/react-router";
import { useAuth } from "@/lib/hooks/use-auth";
import { getUserHomePath } from "@/lib/auth-home";
import { href } from "@/lib/utils";

export function HomePage() {
  const { user, memberships, isAuthenticated } = useAuth();
  const { slug: routeSlug } = useParams({ strict: false });

  // The cold-load spinner is handled by AuthBootGate (the app-level splash), so
  // by the time HomePage renders, /api/auth/me has resolved.

  if (!isAuthenticated || !user) {
    return <Navigate to={href(routeSlug ? `/k/${routeSlug}/login` : "/login")} replace />;
  }

  return <Navigate to={getUserHomePath(user, memberships, routeSlug ?? null)} replace />;
}
