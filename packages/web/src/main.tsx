import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { App } from "./App";
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

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

const tree = (
  <Sentry.ErrorBoundary fallback={<div>Something went wrong. Please refresh.</div>}>
    <App />
  </Sentry.ErrorBoundary>
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
