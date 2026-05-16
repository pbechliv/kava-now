import { useForm } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@kava-now/shared";
import { Link, useParams, useSearchParams } from "react-router";
import { Loader2 } from "lucide-react";
import { useLogin } from "@/lib/hooks/use-login";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { GoogleIcon } from "@/components/icons/GoogleIcon";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const googleEnabled = import.meta.env.VITE_GOOGLE_ENABLED === "true";

export function LoginPage() {
  const login = useLogin();
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const oauthError = searchParams.get("error") === "oauth";

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

  const onSubmit = (data: LoginInput) => {
    login.mutate(data);
  };

  const loginPath = slug ? `/k/${slug}/login` : "/login";
  const forgotPath = slug ? `/k/${slug}/auth/forgot-password` : "/auth/forgot-password";
  const homePath = slug ? `/k/${slug}` : "/";

  const googleSignIn = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signIn.social({
        provider: "google",
        callbackURL: homePath,
        errorCallbackURL: `${loginPath}?error=oauth`,
      });
      if (error) throw new Error(error.message ?? "Σφάλμα Google σύνδεσης");
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {kavaInfo?.name && <h2 className="text-center text-xl font-bold">{kavaInfo.name}</h2>}
        <h2 className="text-center text-lg font-semibold">Σύνδεση</h2>

        {googleEnabled && (
          <>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => googleSignIn.mutate()}
              disabled={googleSignIn.isPending}
            >
              {googleSignIn.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <GoogleIcon className="mr-2 h-4 w-4" />
              )}
              Συνέχεια με Google
            </Button>
            {(googleSignIn.error || oauthError) && (
              <p className="text-sm text-destructive">
                {googleSignIn.error instanceof Error
                  ? googleSignIn.error.message
                  : "Η σύνδεση με Google απέτυχε. Βεβαιωθείτε ότι έχετε λάβει πρόσκληση."}
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
