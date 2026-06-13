import { useDeployState } from "@/lib/deploy-watch";
import { Logo } from "@/components/Logo";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";

/**
 * Blocking "update in progress" screen shown while a deploy makes the API
 * briefly unreachable. Driven entirely by the deploy-watch store ([deploy-watch.ts]),
 * which auto-reloads to the fresh build once the new version is live — the
 * manual button is just an escape hatch. Mounted at the App root so it paints
 * over every layout, including the auth boot splash.
 */
export function DeployOverlay() {
  const state = useDeployState();
  if (state !== "updating") return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-live="assertive"
      aria-label="Γίνεται ενημέρωση"
      // z-index sits above sonner's toaster (999999999): during the deploy
      // window the overlay is the single source of truth, so any stray toast
      // that fired just before it appeared stays hidden behind it.
      className="fixed inset-0 z-[1000000000] flex flex-col items-center justify-center gap-5 bg-background/95 px-6 text-center backdrop-blur-sm"
    >
      <Logo className="size-14" />
      <div className="space-y-1.5">
        <h1 className="text-lg font-semibold text-foreground">Γίνεται ενημέρωση</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Το KavaNow ενημερώνεται. Θα επιστρέψουμε σε λίγα δευτερόλεπτα — η σελίδα θα ανανεωθεί
          αυτόματα μόλις ολοκληρωθεί.
        </p>
      </div>
      <Spinner className="size-6" />
      <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
        Ανανέωση τώρα
      </Button>
    </div>
  );
}
