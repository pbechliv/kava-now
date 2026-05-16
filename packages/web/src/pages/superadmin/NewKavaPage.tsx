import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, Link } from "react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { registerSchema, type RegisterInput } from "@kava-now/shared";
import { useCreateKava } from "@/lib/hooks/use-superadmin-kavas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

export function NewKavaPage() {
  const navigate = useNavigate();
  const createKava = useCreateKava();

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  });

  const slug = form.watch("slug", "");

  const onSubmit = (data: RegisterInput) => {
    createKava.mutate(data, {
      onSuccess: () => navigate("/superadmin/kavas", { replace: true }),
    });
  };

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Νέα κάβα</h1>
        <Link
          to="/superadmin/kavas"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Πίσω
        </Link>
      </div>

      <Card>
        <CardContent className="p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Όνομα κάβας</FormLabel>
                    <FormControl>
                      <Input placeholder="Η Κάβα της Πελοποννήσου" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slug</FormLabel>
                    <FormControl>
                      <Input placeholder="i-kava-mou" {...field} />
                    </FormControl>
                    {slug && <FormDescription>{slug}.kavanow.gr</FormDescription>}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email ιδιοκτήτη</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="owner@example.com" {...field} />
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
                    <FormLabel>Αρχικός κωδικός (προαιρετικό)</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Τουλάχιστον 8 χαρακτήρες"
                        {...field}
                        value={field.value ?? ""}
                      />
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
                      <Input
                        type="password"
                        placeholder="Επαναλάβετε τον κωδικό"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <p className="text-xs text-muted-foreground">
                Αν δεν ορίσετε κωδικό, ο ιδιοκτήτης θα λάβει σύνδεσμο σύνδεσης στο email του.
              </p>

              {createKava.error && (
                <p className="text-sm text-destructive">
                  {createKava.error instanceof Error
                    ? createKava.error.message
                    : "Κάτι πήγε στραβά"}
                </p>
              )}

              <Button type="submit" disabled={createKava.isPending}>
                {createKava.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Δημιουργία
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
