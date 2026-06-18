import { Navigate, useLocation, useParams } from "@tanstack/react-router";
import { useAuth } from "@/lib/hooks/use-auth";
import { AuthUnavailable } from "@/components/auth-unavailable";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAuthUnknown, refetch, isRefetching } = useAuth();
  const location = useLocation();
  const { slug } = useParams({ strict: false });

  // The cold-load spinner is handled by AuthBootGate (the app-level splash), so
  // by the time RequireAuth renders, /api/auth/me has resolved.

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
    return (
      <Navigate
        to={loginPath}
        state={{ from: { pathname: location.pathname, search: location.searchStr } }}
        replace
      />
    );
  }

  return <>{children}</>;
}
