// KavaNow service worker.
//
// Intentionally minimal: this app does NOT support offline use. The worker
// caches nothing (no CacheStorage usage at all). Its only job on the network
// path is to replace the browser's default offline error with a branded
// "offline is not supported" page when a navigation request fails.
//
// It exists for two reasons that survive the no-offline decision:
//   1. It renders the offline fallback page below (a SW is the only way to
//      intercept the browser's offline error for navigations).
//   2. It is the required foundation for web push — `push` / `notificationclick`
//      handlers slot in here later.

const OFFLINE_HTML = `<!doctype html>
<html lang="el">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#d97706" />
    <title>Εκτός σύνδεσης — KavaNow</title>
    <style>
      :root { color-scheme: light dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.5rem;
        background: #ffffff;
        color: #1c1917;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      main { max-width: 26rem; text-align: center; }
      .mark {
        width: 4rem;
        height: 4rem;
        margin: 0 auto 1.5rem;
        border-radius: 1rem;
        background: #d97706;
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.75rem;
        font-weight: 700;
      }
      h1 { margin: 0 0 0.75rem; font-size: 1.375rem; font-weight: 700; }
      p { margin: 0 0 1.5rem; line-height: 1.55; color: #57534e; }
      button {
        appearance: none;
        border: 0;
        cursor: pointer;
        padding: 0.7rem 1.5rem;
        border-radius: 0.625rem;
        background: #d97706;
        color: #ffffff;
        font-size: 1rem;
        font-weight: 600;
      }
      button:hover { background: #b45309; }
      @media (prefers-color-scheme: dark) {
        body { background: #09090b; color: #fafafa; }
        p { color: #a1a1aa; }
      }
    </style>
  </head>
  <body>
    <main>
      <div class="mark">K</div>
      <h1>Είστε εκτός σύνδεσης</h1>
      <p>
        Το KavaNow χρειάζεται σύνδεση στο διαδίκτυο. Η λειτουργία εκτός σύνδεσης
        δεν υποστηρίζεται. Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά.
      </p>
      <button type="button" onclick="location.reload()">Δοκιμάστε ξανά</button>
    </main>
  </body>
</html>`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Defensive: this worker never writes caches, but if a previous version
      // (or a future experiment) ever did, clear them so nothing is served stale.
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Only intercept top-level navigations. Assets and /api/* are left entirely
  // to the network — the SW adds no caching and no offline behaviour for them.
  if (request.mode !== "navigate") return;

  // Never intercept /api/* navigations. better-auth replies to the email-link
  // endpoints (e.g. /api/auth/reset-password/:token, clicked straight from an
  // invite/reset mail) with a 302 to the app. The no-store shell fetch below
  // uses redirect:"follow" (the default for a URL-string fetch), so it would
  // follow that 302 and hand respondWith() a `redirected` response — which the
  // browser rejects for a navigation (its redirect mode is "manual"), failing
  // the navigation with ERR_FAILED ("This site can't be reached"). A direct
  // link to an /api/* URL is a navigation, so request.mode above never
  // excludes it; leave these to the network so the browser follows the 302.
  if (new URL(request.url).pathname.startsWith("/api/")) return;

  // Always pull the live shell, bypassing the HTTP cache. Without this an
  // installed PWA (iOS standalone especially) can relaunch from a cached
  // index.html that points at hashed chunks a newer deploy has already
  // deleted — the entry script 404s, React never mounts, and the app is a
  // white screen. A plain fetch(request) respects the HTTP cache, so the stale
  // shell keeps coming back; no-store removes the shell from the cache equation
  // entirely, so a launch can never boot a deleted build. Fetch by URL (not the
  // navigation Request) so the cache override is honoured everywhere.
  // redirect:"manual" keeps any server redirect as an opaqueredirect the
  // browser follows itself — a `redirected` response is invalid for a
  // navigation and fails with ERR_FAILED.
  event.respondWith(
    fetch(request.url, {
      cache: "no-store",
      credentials: "same-origin",
      redirect: "manual",
    }).catch(
      () =>
        new Response(OFFLINE_HTML, {
          status: 503,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          },
        }),
    ),
  );
});

// --- Web Push (#28) ---

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "KavaNow", {
      body: payload.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
