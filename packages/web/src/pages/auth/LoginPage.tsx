import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@kava-now/shared";
import { Link, useParams } from "react-router";
import { Loader2 } from "lucide-react";
import { GoogleLogin } from "@react-oauth/google";
import { useLogin } from "@/lib/hooks/use-login";
import { useGoogleSignIn } from "@/lib/hooks/use-google-sign-in";
import { api } from "@/lib/api";
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
