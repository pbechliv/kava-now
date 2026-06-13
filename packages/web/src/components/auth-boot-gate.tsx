import { useAuth } from "@/lib/hooks/use-auth";
import { Spinner } from "@/components/spinner";
import { Logo } from "@/components/Logo";

/**
 * Shows a neutral full-screen splash while the initial `/api/auth/me` check is
 * in flight, then renders the route tree. Without this, a logged-in user hitting
 * `/` would briefly see the login card chrome (`AuthLayout` + `LoginPage` spinner)
 * before the redirect effect resolves — the reported login flicker.
 *
 * `isLoading` is true only on the first fetch with no cached data, so the splash
 * shows once on cold load; subsequent client-side navigations pass through
 * instantly (the `["auth"]` query is already cached). Server-unreachable errors
 * fall through to the route, where `AuthUnavailable` (in `LoginPage`/`RequireAuth`)
 * handles the retry UI.
 */
export function AuthBootGate({ children }: { children: React.ReactNode }) {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/30">
        <Logo className="size-14" />
        <Spinner />
      </div>
    );
  }

  return <>{children}</>;
}
