import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useAuth } from "@/lib/hooks/use-auth";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";

function buildSchema(hasPassword: boolean) {
  return z
    .object({
      currentPassword: z.string(),
      newPassword: z.string().min(8, "Ο νέος κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες"),
      confirmNewPassword: z.string(),
    })
    .refine((d) => !hasPassword || d.currentPassword.length > 0, {
      message: "Ο τρέχων κωδικός είναι υποχρεωτικός",
      path: ["currentPassword"],
    })
    .refine((d) => d.newPassword === d.confirmNewPassword, {
      message: "Οι κωδικοί δεν ταιριάζουν",
      path: ["confirmNewPassword"],
    });
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>;

function ChangePasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const schema = useMemo(() => buildSchema(hasPassword), [hasPassword]);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { currentPassword: "", newPassword: "", confirmNewPassword: "" },
  });

  const mutation = useMutation({
    mutationFn: async (data: FormValues) => {
      if (hasPassword) {
        const { error } = await authClient.changePassword({
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
        });
        if (error) throw new Error(error.message ?? "Σφάλμα");
        return;
      }
      await api.post("/api/auth/set-password", { newPassword: data.newPassword });
    },
    onSuccess: () => form.reset(),
  });

  const onSubmit = (data: FormValues) => mutation.mutate(data);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{hasPassword ? "Αλλαγή κωδικού" : "Ορισμός κωδικού"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasPassword && (
              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Τρέχων κωδικός</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Νέος κωδικός</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Τουλάχιστον 8 χαρακτήρες"
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmNewPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Επιβεβαίωση νέου κωδικού</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
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
            {mutation.isSuccess && (
              <p className="text-sm text-success">Ο κωδικός άλλαξε επιτυχώς</p>
            )}
          </CardContent>
        </Card>
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={!form.formState.isValid || form.formState.isSubmitting || mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {hasPassword ? "Αλλαγή κωδικού" : "Ορισμός κωδικού"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export function ChangePasswordCard() {
  const { user, isLoading } = useAuth();
  if (isLoading || !user) return null;
  return <ChangePasswordForm key={String(user.hasPassword)} hasPassword={!!user.hasPassword} />;
}
