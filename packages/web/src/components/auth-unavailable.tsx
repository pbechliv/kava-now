import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AuthUnavailableProps {
  onRetry: () => void;
  retrying: boolean;
}

/**
 * Shown when the session check (`/api/auth/me`) failed with a non-401 —
 * the server was unreachable, so auth state is unknown. Rendering the login
 * form here would wrongly tell a logged-in user they were logged out.
 */
export function AuthUnavailable({ onRetry, retrying }: AuthUnavailableProps) {
  return (
    <div className="space-y-4 text-center">
      <h2 className="text-lg font-semibold">Πρόβλημα σύνδεσης</h2>
      <p className="text-sm text-muted-foreground">
        Δεν ήταν δυνατή η επικοινωνία με τον διακομιστή. Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά.
      </p>
      <Button variant="outline" className="w-full" onClick={onRetry} disabled={retrying}>
        {retrying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Δοκιμάστε ξανά
      </Button>
    </div>
  );
}
