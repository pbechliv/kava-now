import { Navigate } from "react-router";
import { useAuth } from "@/lib/hooks/use-auth";
import { Spinner } from "@/components/spinner";
import { getUserHome, resolveHomeHref } from "@/lib/auth-home";
import type { UserRole } from "@kava-now/shared";

interface RequireRoleProps {
  allowed: UserRole[];
  children: React.ReactNode;
}

export function RequireRole({ allowed, children }: RequireRoleProps) {
  const { user, kava } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowed.includes(user.role)) {
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

  return <>{children}</>;
}
