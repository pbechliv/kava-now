import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/hooks/use-auth";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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

  if (user.hasPassword) {
    return (
      <div className="text-center">
        <h2 className="text-lg font-semibold">Καλώς ήρθατε, {user.name}!</h2>
        {kava && (
          <p className="mt-2 text-sm text-muted-foreground">Έχετε συνδεθεί στο {kava.name}.</p>
        )}
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
      <h2 className="text-center text-lg font-semibold">Καλώς ήρθατε, {user.name}!</h2>
      {kava && (
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Έχετε προσκληθεί στο <strong>{kava.name}</strong>.
        </p>
      )}
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Ορίστε έναν κωδικό για να συνδέεστε χωρίς magic link στο μέλλον (προαιρετικό).
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="welcome-password">Νέος κωδικός</Label>
          <Input
            id="welcome-password"
            type="password"
            placeholder="Τουλάχιστον 8 χαρακτήρες"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="welcome-confirm">Επιβεβαίωση κωδικού</Label>
          <Input
            id="welcome-confirm"
            type="password"
            placeholder="Επαναλάβετε τον κωδικό"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" className="w-full" disabled={setPasswordMutation.isPending}>
          {setPasswordMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Ορισμός κωδικού & Συνέχεια
        </Button>

        <button
          type="button"
          onClick={goToDashboard}
          className="block w-full text-center text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          Παράλειψη
        </button>
      </form>
    </div>
  );
}
