import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { App } from "./App";
import { DeployOverlay } from "./components/deploy-overlay";
import { initUpdateCheck } from "./lib/update-check";
import { initDeployWatch, SERVER_RECOVERED_EVENT } from "./lib/deploy-watch";
import { queryClient } from "./lib/query-client";
import "./index.css";

const dsn = import.meta.env.VITE_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || "development",
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });

  const tenantSlug = window.location.pathname.match(/^\/k\/([^/]+)/)?.[1];
  if (tenantSlug) {
    Sentry.getCurrentScope().setTag("tenant.slug", tenantSlug);
  }
}

// Register the service worker in production only — it backs the offline
// fallback page and is the foundation for web push. It caches nothing, so it
// never interferes with the dev server / HMR; we still gate on PROD to avoid
// a stray registration lingering on localhost across dev sessions.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

// Keep long-lived tabs and installed PWAs on the latest deploy — reload once
// when a newer build is detected (on tab focus + a slow interval).
if (import.meta.env.PROD) {
  initUpdateCheck();

  // Block the UI with a calm "update in progress" overlay while a deploy makes
  // the API briefly unreachable, then reload to the fresh build automatically.
  initDeployWatch();

  // When the server comes back at the same version (a transient blip, not a
  // new build), refetch so errored queries — like the /api/auth/me probe that
  // drives the AuthUnavailable retry panel — recover on their own instead of
  // leaving the user on a "try again" screen once the overlay clears.
  window.addEventListener(SERVER_RECOVERED_EVENT, () => {
    void queryClient.invalidateQueries();
  });

  // A deploy replaces the hashed chunk tree, so a stale tab's next lazy route
  // import can 404. Reload — the revalidated shell references the live build.
  // Rate-limited via the same sessionStorage key as public/boot-guard.js so a
  // genuinely missing chunk surfaces to the error boundary instead of looping.
  window.addEventListener("vite:preloadError", (event) => {
    const KEY = "kn-reload-guard";
    try {
      const last = Number(sessionStorage.getItem(KEY) || 0);
      if (Date.now() - last < 60_000) return;
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      return;
    }
    event.preventDefault();
    window.location.reload();
  });
}

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

const tree = (
  <>
    <Sentry.ErrorBoundary fallback={<div>Something went wrong. Please refresh.</div>}>
      <App />
    </Sentry.ErrorBoundary>
    {/* Outside the boundary: an "update in progress" overlay must survive a
        render-throw fallback during the deploy window, not be replaced by it. */}
    <DeployOverlay />
  </>
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {googleClientId ? (
      <GoogleOAuthProvider clientId={googleClientId}>{tree}</GoogleOAuthProvider>
    ) : (
      tree
    )}
  </StrictMode>,
);
