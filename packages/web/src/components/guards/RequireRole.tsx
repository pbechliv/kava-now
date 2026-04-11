import { Navigate } from "react-router";
import { useAuth } from "../../lib/hooks/use-auth";
import type { UserRole } from "@kava-now/shared";

interface RequireRoleProps {
  allowed: UserRole[];
  children: React.ReactNode;
}

export function RequireRole({ allowed, children }: RequireRoleProps) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowed.includes(user.role)) {
    // Redirect to the appropriate portal
    if (user.role === "customer") {
      return <Navigate to="/catalog" replace />;
    }
    if (user.role === "superadmin") {
      return <Navigate to="/superadmin/kavas" replace />;
    }
    return <Navigate to="/admin/dashboard" replace />;
  }

  return <>{children}</>;
}
