import { useAuth } from "@/lib/hooks/use-auth";
import { BootSplash } from "@/components/boot-splash";

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
 *
 * The same `BootSplash` backs the route Suspense fallback (see `App.tsx`), so the
 * auth gate and the first lazy-chunk load read as one continuous loader.
 */
export function AuthBootGate({ children }: { children: React.ReactNode }) {
  const { isLoading } = useAuth();

  if (isLoading) {
    return <BootSplash />;
  }

  return <>{children}</>;
}
