import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/ui/Button";

// Email-link prefetch (Mailpit, Gmail TitanLink, Outlook SafeLinks, Chrome
// hover) would burn a single-use magic-link token before the user clicks.
// The emailed URL lands here as a static page; the actual GET to
// /api/auth/magic-link/verify only fires from a user click, which
// prefetchers never trigger.
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
      // No callbackURL on this call: better-auth returns JSON instead of 302.
      const res = await fetch(`/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Ο σύνδεσμος δεν είναι έγκυρος ή έληξε.");
      }
      await queryClient.invalidateQueries({ queryKey: ["auth"] });
      // better-auth emits callbackURL as an absolute URL (resolved against
      // baseURL). React Router's navigate(path) treats absolute URLs as
      // relative paths; for same-origin URLs, strip to pathname; for
      // cross-origin, fall back to a full page nav.
      const target = new URL(callbackURL, window.location.origin);
      if (target.origin === window.location.origin) {
        navigate(target.pathname + target.search + target.hash, { replace: true });
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
        <h2 className="text-lg font-semibold text-gray-900">Λείπει ο σύνδεσμος</h2>
        <p className="mt-2 text-sm text-gray-600">
          Δεν βρέθηκε token στο URL. Ζητήστε νέο σύνδεσμο σύνδεσης.
        </p>
        <Link to="/login" className="mt-6 inline-block text-sm text-amber-600 hover:text-amber-700">
          Επιστροφή στη σύνδεση
        </Link>
      </div>
    );
  }

  return (
    <div className="text-center">
      <h2 className="text-lg font-semibold text-gray-900">Επιβεβαίωση σύνδεσης</h2>
      <p className="mt-2 text-sm text-gray-600">
        Πατήστε το κουμπί για να ολοκληρώσετε τη σύνδεση.
      </p>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <Button className="mt-6 w-full" loading={pending} onClick={confirm}>
        Σύνδεση
      </Button>

      <Link
        to="/login"
        className="mt-4 inline-block text-sm text-gray-500 hover:text-amber-600 transition-colors"
      >
        Ακύρωση
      </Link>
    </div>
  );
}
