import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { kavaSlugSchema, type KavaSlugInput } from "@kava-now/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/hooks/use-auth";
import { membershipHome } from "@/lib/auth-home";
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

export function KavaSelectPage() {
  const [checking, setChecking] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const navigate = useNavigate();
  const { isAuthenticated, memberships } = useAuth();

  const form = useForm<KavaSlugInput>({
    resolver: zodResolver(kavaSlugSchema),
  });

  const onSubmit = async (data: KavaSlugInput) => {
    setChecking(true);
    setNotFound(false);
    try {
      const res = await api.get<{ exists: boolean }>(
        `/api/platform/kava-exists?slug=${encodeURIComponent(data.slug)}`,
      );
      if (res.exists) {
        void navigate(`/k/${data.slug}/login`);
      } else {
        setNotFound(true);
      }
    } finally {
      setChecking(false);
    }
  };

  // Logged-in users with memberships see their kava list as a shortcut.
  if (isAuthenticated && memberships.length > 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-center text-lg font-semibold">Οι κάβες σας</h2>
        <ul className="space-y-2">
          {memberships.map((m) => (
            <li key={m.kavaId}>
              <Button
                variant="outline"
                className="w-full justify-between"
                onClick={() => navigate(membershipHome(m))}
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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <h2 className="text-center text-lg font-semibold">Βρείτε την κάβα σας</h2>

        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Όνομα κάβας</FormLabel>
              <FormControl>
                <Input placeholder="my-kava" {...field} />
              </FormControl>
              <FormMessage />
              {notFound && !form.formState.errors.slug && (
                <p className="text-sm text-destructive">Κάβα δεν βρέθηκε</p>
              )}
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={checking}>
          {checking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Συνέχεια
        </Button>
      </form>
    </Form>
  );
}
