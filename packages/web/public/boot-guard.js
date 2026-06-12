// Deploy-race recovery: an index.html fetched just before a deploy references
// hashed entry chunks the new build no longer serves — the script 404s, React
// never mounts, and the empty shell stays a white screen. When an /assets/
// script fails to load, reload once; the revalidated shell (Cache-Control:
// no-cache) points at the live build. Must be an external script — the
// production CSP has no 'unsafe-inline' for script-src.
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
      location.reload();
    },
    // Resource load errors don't bubble — only a capture listener sees them.
    true,
  );
})();
