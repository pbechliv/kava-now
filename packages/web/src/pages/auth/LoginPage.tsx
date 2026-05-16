import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@kava-now/shared";
import { Link, useParams } from "react-router";
import { Loader2 } from "lucide-react";
import { useLogin } from "@/lib/hooks/use-login";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

export function LoginPage() {
  const login = useLogin();
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
