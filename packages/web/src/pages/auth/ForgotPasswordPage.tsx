import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  forgotPasswordSchema,
  type ForgotPasswordInput,
} from "@kava-now/shared";
import { useMutation } from "@tanstack/react-query";
import { authClient } from "../../lib/auth-client";
import { authEmailFor } from "../../lib/auth-email";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Link } from "react-router";

export function ForgotPasswordPage() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const mutation = useMutation({
    mutationFn: async (data: ForgotPasswordInput) => {
      const { error } = await authClient.requestPasswordReset({
        email: authEmailFor(data.email),
        redirectTo: "/auth/reset-password",
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
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Ελέγξτε το email σας</h2>
        <p className="mt-2 text-sm text-gray-600">
          Αν υπάρχει λογαριασμός με αυτό το email, θα λάβετε σύνδεσμο επαναφοράς κωδικού.
        </p>
        <Link
          to="/login"
          className="mt-4 inline-block text-sm text-amber-600 hover:text-amber-700 font-medium"
        >
          Επιστροφή στη σύνδεση
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900 text-center">
        Επαναφορά κωδικού
      </h2>
      <p className="text-sm text-gray-500 text-center">
        Εισάγετε το email σας και θα σας στείλουμε σύνδεσμο επαναφοράς.
      </p>

      <Input
        id="email"
        type="email"
        label="Email"
        placeholder="you@example.com"
        error={errors.email?.message}
        {...register("email")}
      />

      {mutation.error && (
        <p className="text-sm text-red-600">
          {mutation.error instanceof Error ? mutation.error.message : "Κάτι πήγε στραβά"}
        </p>
      )}

      <Button type="submit" className="w-full" loading={mutation.isPending}>
        Αποστολή συνδέσμου
      </Button>

      <p className="text-center text-sm text-gray-500">
        <Link to="/login" className="text-amber-600 hover:text-amber-700 font-medium">
          Επιστροφή στη σύνδεση
        </Link>
      </p>
    </form>
  );
}
