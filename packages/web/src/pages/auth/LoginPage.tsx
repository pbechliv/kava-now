import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@kava-now/shared";
import { Link } from "react-router";
import { Loader2, MailCheck } from "lucide-react";
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
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { data: kavaInfo } = useQuery({
    queryKey: ["kava-info"],
    queryFn: () => api.get<{ name: string; slug: string }>("/api/kava"),
    retry: false,
    staleTime: Infinity,
  });

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = (data: LoginInput) => {
    login.mutate(data, {
      onSuccess: (res) => {
        if (res.magicLinkSent) {
          setMagicLinkSent(true);
        }
      },
    });
  };

  const sendMagicLink = () => {
    const email = form.getValues("email");
    if (!email) {
      void form.trigger("email");
      return;
    }
    login.mutate(
      { email },
      {
        onSuccess: () => setMagicLinkSent(true),
      },
    );
  };

  if (magicLinkSent) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <MailCheck className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-lg font-semibold">Ελέγξτε το email σας</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Ελέγξτε το email σας για τον σύνδεσμο εισόδου
        </p>
      </div>
    );
  }

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

        {showPassword ? (
          <>
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
              <Link to="/auth/forgot-password" className="text-sm text-primary hover:underline">
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

            <button
              type="button"
              onClick={() => setShowPassword(false)}
              className="block w-full text-center text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              Σύνδεση με σύνδεσμο
            </button>
          </>
        ) : (
          <>
            {login.error && (
              <p className="text-sm text-destructive">
                {login.error instanceof Error ? login.error.message : "Κάτι πήγε στραβά"}
              </p>
            )}

            <Button
              type="button"
              className="w-full"
              disabled={login.isPending}
              onClick={sendMagicLink}
            >
              {login.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Σύνδεση με σύνδεσμο
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setShowPassword(true)}
            >
              Σύνδεση με κωδικό
            </Button>
          </>
        )}

        <p className="text-center text-sm text-muted-foreground">
          Δεν έχετε λογαριασμό;{" "}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Εγγραφή
          </Link>
        </p>
      </form>
    </Form>
  );
}
