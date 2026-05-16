import { Navigate, useParams } from "react-router";
import { useAuth } from "@/lib/hooks/use-auth";
import { Spinner } from "@/components/spinner";
import { getUserHomePath } from "@/lib/auth-home";

export function HomePage() {
  const { user, memberships, isLoading, isAuthenticated } = useAuth();
  const { slug: routeSlug } = useParams<{ slug: string }>();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to={routeSlug ? `/k/${routeSlug}/login` : "/login"} replace />;
  }

  return <Navigate to={getUserHomePath(user, memberships, routeSlug ?? null)} replace />;
}
