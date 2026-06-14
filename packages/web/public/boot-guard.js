// Deploy-race recovery: an index.html fetched just before a deploy references
// hashed entry chunks the new build no longer serves — the script 404s, React
// never mounts, and the empty shell stays a white screen. When an /assets/
// script fails to load, recover once; the revalidated shell (Cache-Control:
// no-cache) points at the live build. Must be an external script — the
// production CSP has no 'unsafe-inline' for script-src.
//
// A controlling service worker can keep handing back the SAME stale shell
// (it fetches navigations through the HTTP cache), so a plain reload would
// 404 on the same dead chunk again — the classic stuck PWA white screen.
// Unregister the worker first so the reload goes straight to the network for a
// fresh index.html; main.tsx re-registers it once the live shell boots.
//
// The sessionStorage guard is shared with the vite:preloadError handler in
// src/main.tsx: at most one automatic reload per minute per tab, so a
// genuinely broken deploy degrades to a single retry, not a reload loop.
(function () {
  var KEY = "kn-reload-guard";
  window.addEventListener(
    "error",
    function (event) {
      var el = event.target;
      if (!el || el.tagName !== "SCRIPT" || !el.src) return;
      if (el.src.indexOf("/assets/") === -1) return;
      try {
        var last = Number(sessionStorage.getItem(KEY) || 0);
        if (Date.now() - last < 60000) return;
        sessionStorage.setItem(KEY, String(Date.now()));
      } catch {
        return;
      }
      var reload = function () {
        location.reload();
      };
      // Drop the service worker before reloading, then reload regardless of
      // whether unregister succeeds — never let a failed unregister strand the
      // white screen.
      if (navigator.serviceWorker) {
        navigator.serviceWorker
          .getRegistrations()
          .then(function (regs) {
            return Promise.all(
              regs.map(function (r) {
                return r.unregister();
              }),
            );
          })
          .then(reload, reload);
      } else {
        reload();
      }
    },
    // Resource load errors don't bubble — only a capture listener sees them.
    true,
  );
})();
