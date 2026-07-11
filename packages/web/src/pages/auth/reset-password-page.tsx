import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { resetPasswordSchema, type ResetPasswordInput } from "@kava-now/shared";
import { useMutation } from "@tanstack/react-query";
import { Link, useParams, useSearch } from "@tanstack/react-router";
import { CheckCircle2, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
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

export function ResetPasswordPage() {
  const { token = "" } = useSearch({ strict: false });
  const { slug } = useParams({ strict: false });
  const forgotPath = slug ? `/k/${slug}/auth/forgot-password` : "/auth/forgot-password";
  const loginPath = slug ? `/k/${slug}/login` : "/login";

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token },
  });

  const mutation = useMutation({
    mutationFn: async (data: ResetPasswordInput) => {
      const { error } = await authClient.resetPassword({
        newPassword: data.password,
        token: data.token,
      });
      if (error) {
        throw new Error(authErrorMessage(error, "Η αλλαγή κωδικού απέτυχε — δοκιμάστε ξανά"));
      }
    },
  });

  const onSubmit = (data: ResetPasswordInput) => {
    mutation.mutate(data);
  };

  if (!token) {
    return (
      <div className="text-center">
        <h2 className="text-lg font-semibold">Μη έγκυρος σύνδεσμος</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Ο σύνδεσμος επαναφοράς δεν είναι έγκυρος.
        </p>
        <Link
          to={forgotPath}
          className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
        >
          Ζητήστε νέο σύνδεσμο
        </Link>
      </div>
    );
  }

  if (mutation.isSuccess) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-lg font-semibold">Ο κωδικός άλλαξε</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Μπορείτε τώρα να συνδεθείτε με τον νέο σας κωδικό.
        </p>
        <Link
          to={loginPath}
          className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
        >
          Σύνδεση
        </Link>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <h2 className="text-center text-lg font-semibold">Νέος κωδικός</h2>

        <input type="hidden" {...form.register("token")} />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Νέος κωδικός</FormLabel>
              <FormControl>
                <Input type="password" placeholder="Τουλάχιστον 8 χαρακτήρες" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Επιβεβαίωση κωδικού</FormLabel>
              <FormControl>
                <Input type="password" placeholder="Επαναλάβετε τον κωδικό" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {mutation.error && (
          <div className="text-sm text-destructive">
            <p>{mutation.error instanceof Error ? mutation.error.message : "Κάτι πήγε στραβά"}</p>
            <Link
              to={forgotPath}
              className="mt-2 inline-block font-medium text-primary hover:underline"
            >
              Ζητήστε νέο σύνδεσμο επαναφοράς
            </Link>
          </div>
        )}

        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Αλλαγή κωδικού
        </Button>
      </form>
    </Form>
  );
}
