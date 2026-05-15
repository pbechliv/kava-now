import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../lib/hooks/use-auth";
import { api } from "../../lib/api";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Spinner } from "../../components/ui/Spinner";

export function WelcomePage() {
  const { user, kava, isLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  const setPasswordMutation = useMutation({
    mutationFn: (newPassword: string) => api.post("/api/auth/set-password", { newPassword }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth"] });
      goToDashboard();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Σφάλμα");
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  const goToDashboard = () => {
    if (user.role === "owner" || user.role === "staff") {
      void navigate("/admin/dashboard", { replace: true });
    } else if (user.role === "customer") {
      void navigate("/catalog", { replace: true });
    } else {
      void navigate("/", { replace: true });
    }
  };

  // If they already have a password, they can skip and go to the dashboard.
  if (user.hasPassword) {
    return (
      <div className="text-center">
        <h2 className="text-lg font-semibold text-gray-900">Καλώς ήρθατε, {user.name}!</h2>
        {kava && <p className="mt-2 text-sm text-gray-600">Έχετε συνδεθεί στο {kava.name}.</p>}
        <Button className="mt-6" onClick={goToDashboard}>
          Συνέχεια
        </Button>
      </div>
    );
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες");
      return;
    }
    if (password !== confirm) {
      setError("Οι κωδικοί δεν ταιριάζουν");
      return;
    }
    setPasswordMutation.mutate(password);
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 text-center">
        Καλώς ήρθατε, {user.name}!
      </h2>
      {kava && (
        <p className="mt-2 text-sm text-gray-600 text-center">
          Έχετε προσκληθεί στο <strong>{kava.name}</strong>.
        </p>
      )}
      <p className="mt-4 text-sm text-gray-600 text-center">
        Ορίστε έναν κωδικό για να συνδέεστε χωρίς magic link στο μέλλον (προαιρετικό).
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Input
          id="welcome-password"
          type="password"
          label="Νέος κωδικός"
          placeholder="Τουλάχιστον 8 χαρακτήρες"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Input
          id="welcome-confirm"
          type="password"
          label="Επιβεβαίωση κωδικού"
          placeholder="Επαναλάβετε τον κωδικό"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button type="submit" className="w-full" loading={setPasswordMutation.isPending}>
          Ορισμός κωδικού & Συνέχεια
        </Button>

        <button
          type="button"
          onClick={goToDashboard}
          className="w-full text-center text-sm text-gray-500 hover:text-amber-600 transition-colors"
        >
          Παράλειψη
        </button>
      </form>
    </div>
  );
}
