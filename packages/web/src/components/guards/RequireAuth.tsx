import { Navigate, useLocation, useParams } from "react-router";
import { useAuth } from "@/lib/hooks/use-auth";
import { Spinner } from "@/components/spinner";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const { slug } = useParams<{ slug: string }>();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    const loginPath = slug ? `/k/${slug}/login` : "/login";
    return <Navigate to={loginPath} state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
