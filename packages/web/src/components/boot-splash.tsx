import { Spinner } from "@/components/spinner";
import { Logo } from "@/components/Logo";

/**
 * Full-screen branded loading splash. Shared by the auth boot gate
 * (`AuthBootGate`, waiting on `/api/auth/me`) and the top-level route Suspense
 * fallback (waiting on a lazy route chunk). Using one component for both means a
 * cold boot reads as a single continuous loader instead of an icon-splash
 * handing off to a bare spinner. The route's own data loader still renders
 * separately once the page is mounted.
 */
export function BootSplash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/30">
      <Logo className="size-14" />
      <Spinner />
    </div>
  );
}
