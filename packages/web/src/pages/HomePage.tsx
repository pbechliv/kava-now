import { Navigate } from "react-router";
import { useAuth } from "@/lib/hooks/use-auth";
import { Spinner } from "@/components/spinner";
import { getUserHome, resolveHomeHref } from "@/lib/auth-home";

export function HomePage() {
  const { user, kava, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  const target = getUserHome(user, kava?.slug ?? null);
  const { href, isSameSubdomain } = resolveHomeHref(target);

  if (isSameSubdomain) {
    return <Navigate to={target.path} replace />;
  }

  if (window.location.href !== href) {
    window.location.replace(href);
  }
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner />
    </div>
  );
}
