import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterInput } from "@kava-now/shared";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Link } from "react-router";

export function RegisterPage() {
  const {
    register: reg,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  });

  const slug = watch("slug", "");

  const mutation = useMutation({
    mutationFn: (data: RegisterInput) =>
      api.post<{ success: boolean; slug: string; hasPassword?: boolean }>("/api/platform/register", data),
  });

  const onSubmit = (data: RegisterInput) => {
    mutation.mutate(data);
  };

  if (mutation.isSuccess) {
    const hasPassword = mutation.data?.hasPassword;
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Επιτυχής εγγραφή!</h2>
        <p className="mt-2 text-sm text-gray-600">
          {hasPassword
            ? "Μπορείτε τώρα να συνδεθείτε με τον κωδικό σας."
            : "Ελέγξτε το email σας για τον σύνδεσμο εισόδου"}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900 text-center">Εγγραφή Κάβας</h2>

      <Input
        id="name"
        label="Όνομα Κάβας"
        placeholder="Η Κάβα μου"
        error={errors.name?.message}
        {...reg("name")}
      />

      <div>
        <Input
          id="slug"
          label="Slug"
          placeholder="i-kava-mou"
          error={errors.slug?.message}
          {...reg("slug")}
        />
        {slug && (
          <p className="mt-1 text-xs text-gray-500">
            {slug}.kavanow.gr
          </p>
        )}
      </div>

      <Input
        id="email"
        type="email"
        label="Email"
        placeholder="you@example.com"
        error={errors.email?.message}
        {...reg("email")}
      />

      <Input
        id="password"
        type="password"
        label="Κωδικός (προαιρετικό)"
        placeholder="Τουλάχιστον 8 χαρακτήρες"
        error={errors.password?.message}
        {...reg("password")}
      />

      <Input
        id="confirmPassword"
        type="password"
        label="Επιβεβαίωση κωδικού"
        placeholder="Επαναλάβετε τον κωδικό"
        error={errors.confirmPassword?.message}
        {...reg("confirmPassword")}
      />

      <p className="text-xs text-gray-400">
        Αν δεν ορίσετε κωδικό, μπορείτε να συνδεθείτε μέσω magic link στο email σας.
      </p>

      {mutation.error && (
        <p className="text-sm text-red-600">
          {mutation.error instanceof Error ? mutation.error.message : "Κάτι πήγε στραβά"}
        </p>
      )}

      <Button type="submit" className="w-full" loading={mutation.isPending}>
        Εγγραφή
      </Button>

      <p className="text-center text-sm text-gray-500">
        Έχετε ήδη λογαριασμό;{" "}
        <Link to="/login" className="text-amber-600 hover:text-amber-700 font-medium">
          Σύνδεση
        </Link>
      </p>
    </form>
  );
}
