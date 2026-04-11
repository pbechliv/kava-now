import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { resetPasswordSchema, type ResetPasswordInput } from "@kava-now/shared";
import { useMutation } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { api } from "../../lib/api";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Link } from "react-router";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token },
  });

  const mutation = useMutation({
    mutationFn: (data: ResetPasswordInput) =>
      api.post("/api/auth/reset-password", data),
  });

  const onSubmit = (data: ResetPasswordInput) => {
    mutation.mutate(data);
  };

  if (!token) {
    return (
      <div className="text-center">
        <h2 className="text-lg font-semibold text-gray-900">Μη έγκυρος σύνδεσμος</h2>
        <p className="mt-2 text-sm text-gray-600">
          Ο σύνδεσμος επαναφοράς δεν είναι έγκυρος.
        </p>
        <Link
          to="/auth/forgot-password"
          className="mt-4 inline-block text-sm text-amber-600 hover:text-amber-700 font-medium"
        >
          Ζητήστε νέο σύνδεσμο
        </Link>
      </div>
    );
  }

  if (mutation.isSuccess) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Ο κωδικός άλλαξε</h2>
        <p className="mt-2 text-sm text-gray-600">
          Μπορείτε τώρα να συνδεθείτε με τον νέο σας κωδικό.
        </p>
        <Link
          to="/login"
          className="mt-4 inline-block text-sm text-amber-600 hover:text-amber-700 font-medium"
        >
          Σύνδεση
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900 text-center">
        Νέος κωδικός
      </h2>

      <input type="hidden" {...register("token")} />

      <Input
        id="password"
        type="password"
        label="Νέος κωδικός"
        placeholder="Τουλάχιστον 8 χαρακτήρες"
        error={errors.password?.message}
        {...register("password")}
      />

      <Input
        id="confirmPassword"
        type="password"
        label="Επιβεβαίωση κωδικού"
        placeholder="Επαναλάβετε τον κωδικό"
        error={errors.confirmPassword?.message}
        {...register("confirmPassword")}
      />

      {mutation.error && (
        <p className="text-sm text-red-600">
          {mutation.error instanceof Error ? mutation.error.message : "Κάτι πήγε στραβά"}
        </p>
      )}

      <Button type="submit" className="w-full" loading={mutation.isPending}>
        Αλλαγή κωδικού
      </Button>
    </form>
  );
}
