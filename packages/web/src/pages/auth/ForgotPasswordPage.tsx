import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@kava-now/shared";
import { useMutation } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { Loader2, MailCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
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

export function ForgotPasswordPage() {
  const { slug } = useParams<{ slug: string }>();

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const resetPath = slug ? `/k/${slug}/auth/reset-password` : "/auth/reset-password";
  const loginPath = slug ? `/k/${slug}/login` : "/login";

  const mutation = useMutation({
    mutationFn: async (data: ForgotPasswordInput) => {
      const { error } = await authClient.requestPasswordReset({
        email: data.email,
        redirectTo: resetPath,
      });
      if (error) throw new Error(error.message ?? "Σφάλμα");
    },
  });

  const onSubmit = (data: ForgotPasswordInput) => {
    mutation.mutate(data);
  };

  if (mutation.isSuccess) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <MailCheck className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-lg font-semibold">Ελέγξτε το email σας</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Αν υπάρχει λογαριασμός με αυτό το email, θα λάβετε σύνδεσμο επαναφοράς κωδικού.
        </p>
        <Link
          to={loginPath}
          className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
        >
          Επιστροφή στη σύνδεση
        </Link>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <h2 className="text-center text-lg font-semibold">Επαναφορά κωδικού</h2>
        <p className="text-center text-sm text-muted-foreground">
          Εισάγετε το email σας και θα σας στείλουμε σύνδεσμο επαναφοράς.
        </p>

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

        {mutation.error && (
          <p className="text-sm text-destructive">
            {mutation.error instanceof Error ? mutation.error.message : "Κάτι πήγε στραβά"}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Αποστολή συνδέσμου
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          <Link to={loginPath} className="font-medium text-primary hover:underline">
            Επιστροφή στη σύνδεση
          </Link>
        </p>
      </form>
    </Form>
  );
}
