/**
 * Deploy freshness check (prod only). The SPA never performs full navigations,
 * so a long-lived tab or installed PWA keeps running a stale bundle until
 * something forces a reload — Cache-Control headers can't fix in-memory JS.
 *
 * On return-to-foreground (and on a slow interval for always-visible tabs) we
 * re-fetch the shell, compare its hashed entry script against the one this
 * page booted from, and reload once when they differ. The reload is lossless
 * for the cart — it is persisted per tenant in localStorage.
 */

const FOCUS_COOLDOWN_MS = 60_000;
const INTERVAL_MS = 15 * 60_000;

let lastCheck = 0;

function currentEntryPath(): string | null {
  const el = document.querySelector<HTMLScriptElement>('script[type="module"][src^="/assets/"]');
  return el?.getAttribute("src") ?? null;
}

async function latestEntryPath(): Promise<string | null> {
  const res = await fetch("/", { cache: "no-cache", headers: { Accept: "text/html" } });
  if (!res.ok) return null;
  const html = await res.text();
  return html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1] ?? null;
}

async function reloadIfStale(): Promise<void> {
  const current = currentEntryPath();
  if (!current) return;
  try {
    const latest = await latestEntryPath();
    if (latest && latest !== current) window.location.reload();
  } catch {
    // Offline or flaky network — try again on the next trigger.
  }
}

function check(): void {
  const now = Date.now();
  if (now - lastCheck < FOCUS_COOLDOWN_MS) return;
  lastCheck = now;
  void reloadIfStale();
  // Nudge the service worker update check too — without full navigations the
  // browser rarely re-fetches sw.js on its own.
  void navigator.serviceWorker
    ?.getRegistration()
    .then((reg) => reg?.update())
    .catch(() => {});
}

export function initUpdateCheck(): void {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
  setInterval(check, INTERVAL_MS);
}
