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
      :root { color-scheme: light; }
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

  event.respondWith(
    fetch(request).catch(
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
