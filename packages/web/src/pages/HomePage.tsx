import { Navigate } from "react-router";
import { useAuth } from "../lib/hooks/use-auth";
import { Spinner } from "../components/ui/Spinner";

export function HomePage() {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role === "customer") {
    return <Navigate to="/catalog" replace />;
  }

  return <Navigate to="/admin/dashboard" replace />;
}
