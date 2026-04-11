import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@kava-now/shared";
import { useLogin } from "../../lib/hooks/use-login";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Link } from "react-router";

export function LoginPage() {
  const login = useLogin();
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = (data: LoginInput) => {
    login.mutate(data, {
      onSuccess: (res) => {
        // If no redirect, it was a magic link request
        if (!res.redirect) {
          setMagicLinkSent(true);
        }
      },
    });
  };

  const sendMagicLink = () => {
    const email = getValues("email");
    if (!email) return;
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
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Ελέγξτε το email σας</h2>
        <p className="mt-2 text-sm text-gray-600">
          Ελέγξτε το email σας για τον σύνδεσμο εισόδου
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900 text-center">Σύνδεση</h2>

      <Input
        id="email"
        type="email"
        label="Email"
        placeholder="you@example.com"
        error={errors.email?.message}
        {...register("email")}
      />

      <Input
        id="password"
        type="password"
        label="Κωδικός"
        placeholder="Εισάγετε τον κωδικό σας"
        error={errors.password?.message}
        {...register("password")}
      />

      <div className="text-right">
        <Link
          to="/auth/forgot-password"
          className="text-sm text-amber-600 hover:text-amber-700"
        >
          Ξεχάσατε τον κωδικό;
        </Link>
      </div>

      {login.error && (
        <p className="text-sm text-red-600">
          {login.error instanceof Error ? login.error.message : "Κάτι πήγε στραβά"}
        </p>
      )}

      <Button type="submit" className="w-full" loading={login.isPending}>
        Σύνδεση
      </Button>

      <button
        type="button"
        onClick={sendMagicLink}
        className="w-full text-center text-sm text-gray-500 hover:text-amber-600 transition-colors"
      >
        Αποστολή συνδέσμου εισόδου στο email
      </button>

      <p className="text-center text-sm text-gray-500">
        Δεν έχετε λογαριασμό;{" "}
        <Link to="/register" className="text-amber-600 hover:text-amber-700 font-medium">
          Εγγραφή
        </Link>
      </p>
    </form>
  );
}
