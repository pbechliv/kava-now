import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@kava-now/shared";
import { Link, useNavigate, useParams } from "react-router";
import { Loader2 } from "lucide-react";
import { GoogleLogin } from "@react-oauth/google";
import { useLogin } from "@/lib/hooks/use-login";
import { useGoogleSignIn } from "@/lib/hooks/use-google-sign-in";
import { useAuth } from "@/lib/hooks/use-auth";
import { membershipHome } from "@/lib/auth-home";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
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
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated, user, memberships } = useAuth();

  const signOut = useMutation({
    mutationFn: async () => {
      await authClient.signOut();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth"] });
    },
  });

  const { data: kavaInfo } = useQuery({
    queryKey: ["kava-info", slug],
    queryFn: () => api.get<{ name: string; slug: string }>(`/api/k/${slug}/kava`),
    enabled: !!slug,
    retry: false,
    staleTime: Infinity,
  });

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    if (user.isSuperAdmin) {
      void navigate("/admin/kavas", { replace: true });
      return;
    }
    if (slug) {
      const match = memberships.find((m) => m.kavaSlug === slug);
      if (match) {
        void navigate(membershipHome(match), { replace: true });
        return;
      }
    }
    if (memberships.length === 1) {
      void navigate(membershipHome(memberships[0]!), { replace: true });
    }
    // 0 or multiple memberships and we're on /login → fall through to render below.
  }, [isAuthenticated, user, memberships, slug, navigate]);

  if (isAuthenticated && user && !user.isSuperAdmin) {
    if (memberships.length > 1) {
      return (
        <div className="space-y-4">
          <h2 className="text-center text-lg font-semibold">Οι κάβες σας</h2>
          <ul className="space-y-2">
            {memberships.map((m) => (
              <li key={m.kavaId}>
                <Button
                  variant="outline"
                  className="w-full justify-between"
                  onClick={() => void navigate(membershipHome(m))}
                >
                  <span>{m.kavaName}</span>
                  <span className="text-xs text-muted-foreground">{m.role}</span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    if (memberships.length === 0) {
      return (
        <div className="space-y-4 text-center">
          <h2 className="text-lg font-semibold">Δεν έχετε πρόσβαση σε κάβα</h2>
          <p className="text-sm text-muted-foreground">
            Επικοινωνήστε με τον διαχειριστή της κάβας σας για πρόσκληση.
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
    // Single membership — useEffect will redirect; render nothing in the meantime.
    return null;
  }

  const onSubmit = (data: LoginInput) => {
    login.mutate(data);
  };

  const forgotPath = slug ? `/k/${slug}/auth/forgot-password` : "/auth/forgot-password";

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {kavaInfo?.name && <h2 className="text-center text-xl font-bold">{kavaInfo.name}</h2>}
        <h2 className="text-center text-lg font-semibold">Σύνδεση</h2>

        {googleEnabled && (
          <>
            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={(cred) => googleSignIn.mutate(cred)}
                onError={() => googleSignIn.reset()}
                text="continue_with"
                theme="outline"
                shape="rectangular"
                size="large"
                logo_alignment="left"
                width="384"
              />
            </div>
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
