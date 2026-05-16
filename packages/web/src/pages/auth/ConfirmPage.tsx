import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ConfirmPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = params.get("token") ?? "";
  const callbackURL = params.get("callbackURL") ?? "/";
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const confirm = async () => {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Ο σύνδεσμος δεν είναι έγκυρος ή έληξε.");
      }
      await queryClient.invalidateQueries({ queryKey: ["auth"] });
      const target = new URL(callbackURL, window.location.origin);
      if (target.origin === window.location.origin) {
        void navigate(target.pathname + target.search + target.hash, { replace: true });
      } else {
        window.location.assign(target.toString());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Κάτι πήγε στραβά.");
      setPending(false);
    }
  };

  if (!token) {
    return (
      <div className="text-center">
        <h2 className="text-lg font-semibold">Λείπει ο σύνδεσμος</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Δεν βρέθηκε token στο URL. Ζητήστε νέο σύνδεσμο σύνδεσης.
        </p>
        <Link to="/login" className="mt-6 inline-block text-sm text-primary hover:underline">
          Επιστροφή στη σύνδεση
        </Link>
      </div>
    );
  }

  return (
    <div className="text-center">
      <h2 className="text-lg font-semibold">Επιβεβαίωση σύνδεσης</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Πατήστε το κουμπί για να ολοκληρώσετε τη σύνδεση.
      </p>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      <Button className="mt-6 w-full" disabled={pending} onClick={confirm}>
        {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Σύνδεση
      </Button>

      <Link
        to="/login"
        className="mt-4 inline-block text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        Ακύρωση
      </Link>
    </div>
  );
}
