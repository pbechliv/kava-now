import { retryDeployWatch, useDeployState } from "@/lib/deploy-watch";
import { Logo } from "@/components/logo";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";

/**
 * Blocking screen shown while the API is unreachable. Two flavours, both driven
 * by the deploy-watch store ([deploy-watch.ts]) and both dismissed the moment a
 * `/api/health` probe succeeds:
 *   - "updating": a deploy made the API briefly unreachable; the store
 *     auto-reloads to the fresh build, so the button is just an escape hatch.
 *   - "offline": the device has no connection; we recover in place when it's
 *     back, so the button re-probes rather than reloading (a reload while
 *     offline would only bounce to the service worker's offline page).
 * Mounted at the App root so it paints over every layout, including the auth
 * boot splash.
 */
export function DeployOverlay() {
  const state = useDeployState();
  if (state === "ok") return null;

  const offline = state === "offline";

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-live="assertive"
      aria-label={offline ? "Είστε εκτός σύνδεσης" : "Γίνεται ενημέρωση"}
      // z-index sits above sonner's toaster (999999999): while the overlay is up
      // it's the single source of truth, so any stray toast that fired just
      // before it appeared stays hidden behind it.
      className="fixed inset-0 z-[1000000000] flex flex-col items-center justify-center gap-5 bg-background/95 px-6 text-center backdrop-blur-sm"
    >
      <Logo className="size-14" />
      <div className="space-y-1.5">
        <h1 className="text-lg font-semibold text-foreground">
          {offline ? "Είστε εκτός σύνδεσης" : "Γίνεται ενημέρωση"}
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          {offline
            ? "Το KavaNow χρειάζεται σύνδεση στο διαδίκτυο. Ελέγξτε τη σύνδεσή σας — θα συνεχίσουμε αυτόματα μόλις επανέλθει."
            : "Το KavaNow ενημερώνεται. Θα επιστρέψουμε σε λίγα δευτερόλεπτα — η σελίδα θα ανανεωθεί αυτόματα μόλις ολοκληρωθεί."}
        </p>
      </div>
      <Spinner className="size-6" />
      {offline ? (
        <Button variant="outline" size="sm" onClick={retryDeployWatch}>
          Δοκιμάστε ξανά
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          Ανανέωση τώρα
        </Button>
      )}
    </div>
  );
}
