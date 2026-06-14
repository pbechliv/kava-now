import { Navigate, useParams } from "react-router";
import { useAuth } from "@/lib/hooks/use-auth";
import { getUserHomePath } from "@/lib/auth-home";

export function HomePage() {
  const { user, memberships, isAuthenticated } = useAuth();
  const { slug: routeSlug } = useParams<{ slug: string }>();

  // The cold-load spinner is handled by AuthBootGate (the app-level splash), so
  // by the time HomePage renders, /api/auth/me has resolved.

  if (!isAuthenticated || !user) {
    return <Navigate to={routeSlug ? `/k/${routeSlug}/login` : "/login"} replace />;
  }

  return <Navigate to={getUserHomePath(user, memberships, routeSlug ?? null)} replace />;
}
