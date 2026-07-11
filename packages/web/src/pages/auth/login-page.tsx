import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, ROLE_LABELS, type LoginInput } from "@kava-now/shared";
import { Link, Navigate, useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { AuthUnavailable } from "@/components/auth-unavailable";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { useLogin } from "@/lib/hooks/use-login";
import { useGoogleSignIn } from "@/lib/hooks/use-google-sign-in";
import { useAuth } from "@/lib/hooks/use-auth";
import { membershipHome, returnPathFromState } from "@/lib/auth-home";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { deactivateCart } from "@/lib/store/cart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const googleEnabled = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;

export function LoginPage() {
  const login = useLogin();
  const googleSignIn = useGoogleSignIn();
  const { slug } = useParams({ strict: false });
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { isAuthenticated, user, memberships, isAuthUnknown, refetch, isRefetching } = useAuth();

  const signOut = useMutation({
    mutationFn: async () => {
      await authClient.signOut();
    },
    onSuccess: () => {
      deactivateCart();
      // Full wipe, same as useLogout — invalidating only ["auth"] left the
      // previous user's tenant data cached for whoever signs in next (#62).
      queryClient.clear();
    },
  });

  const { data: tenantInfo } = useQuery({
    queryKey: ["tenant-info", slug],
    queryFn: () => api.get<{ name: string; slug: string }>(`/api/k/${slug}/tenant`),
    enabled: !!slug,
    retry: false,
    staleTime: Infinity,
  });

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  // The cold-load spinner is handled by AuthBootGate (the app-level splash), so
  // by the time LoginPage renders, /api/auth/me has resolved.

  // Server unreachable — auth state unknown. Don't show the login form to a
  // possibly-logged-in user; offer a retry instead.
  if (isAuthUnknown) {
    return <AuthUnavailable onRetry={() => void refetch()} retrying={isRefetching} />;
  }

  // Already signed in? Redirect *during render* (not in an effect) so the login
  // form never paints for a frame before navigating away — the reported flicker.
  if (isAuthenticated && user) {
    const returnTo = returnPathFromState(location.state);
    if (returnTo) return <Navigate to={returnTo} replace />;
    if (user.isSuperAdmin) return <Navigate to="/admin/tenants" replace />;
    if (slug) {
      const match = memberships.find((m) => m.tenantSlug === slug);
      if (match) return <Navigate to={membershipHome(match)} replace />;
    }
    const [only] = memberships;
    if (memberships.length === 1 && only) {
      return <Navigate to={membershipHome(only)} replace />;
    }
    // No single home to send them to — show an in-place chooser instead of the
    // login form. (Superadmins always redirect above and never reach here.)
    if (memberships.length > 1) {
      return (
        <div className="space-y-4">
          <h2 className="text-center text-lg font-semibold">Οι λογαριασμοί σας</h2>
          <ul className="space-y-2">
            {memberships.map((m) => (
              <li key={m.tenantId}>
                <Button
                  variant="outline"
                  className="w-full justify-between"
                  onClick={() => void navigate({ to: membershipHome(m) })}
                >
                  <span>{m.tenantName}</span>
                  <span className="text-xs text-muted-foreground">{ROLE_LABELS[m.role]}</span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-lg font-semibold">Δεν έχετε πρόσβαση σε λογαριασμό</h2>
        <p className="text-sm text-muted-foreground">
          Επικοινωνήστε με τον διαχειριστή της λογαριασμού σας για πρόσκληση.
        </p>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => signOut.mutate()}
          disabled={signOut.isPending}
        >
          {signOut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Σύνδεση με άλλον λογαριασμό
        </Button>
      </div>
    );
  }

  const onSubmit = (data: LoginInput) => {
    login.mutate(data);
  };

  const forgotPath = slug ? `/k/${slug}/auth/forgot-password` : "/auth/forgot-password";

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {tenantInfo?.name && <h2 className="text-center text-xl font-bold">{tenantInfo.name}</h2>}
        <h2 className="text-center text-lg font-semibold">Σύνδεση</h2>

        {googleEnabled && (
          <>
            <GoogleSignInButton
              onSuccess={(cred) => googleSignIn.mutate(cred)}
              onError={() => googleSignIn.reset()}
            />
            {googleSignIn.error && (
              <p className="text-sm text-destructive">
                {googleSignIn.error instanceof Error
                  ? googleSignIn.error.message
                  : "Η σύνδεση με Google απέτυχε"}
              </p>
            )}
            <div className="relative my-2">
              <Separator />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                ή με email
              </span>
            </div>
          </>
        )}

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="you@example.com" autoComplete="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Κωδικός</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder="Εισάγετε τον κωδικό σας"
                  autoComplete="current-password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="text-right">
          <Link to={forgotPath} className="text-sm text-primary hover:underline">
            Ξεχάσατε τον κωδικό;
          </Link>
        </div>

        {login.error && (
          <p className="text-sm text-destructive">
            {login.error instanceof Error ? login.error.message : "Κάτι πήγε στραβά"}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Σύνδεση
        </Button>
      </form>
    </Form>
  );
}
