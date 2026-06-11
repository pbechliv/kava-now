import { Navigate, useLocation, useParams } from "react-router";
import { useAuth } from "@/lib/hooks/use-auth";
import { Spinner } from "@/components/spinner";
import { AuthUnavailable } from "@/components/auth-unavailable";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, isAuthUnknown, refetch, isRefetching } = useAuth();
  const location = useLocation();
  const { slug } = useParams<{ slug: string }>();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // Server unreachable — auth state unknown. Bouncing to /login here would
  // log out (visually) a user whose session cookie is still valid.
  if (isAuthUnknown) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <AuthUnavailable onRetry={() => void refetch()} retrying={isRefetching} />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    const loginPath = slug ? `/k/${slug}/login` : "/login";
    return <Navigate to={loginPath} state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
