/**
 * Deploy-window guard (prod only). A deploy recreates the single api + caddy
 * containers in place, so for ~15–35s `/api/*` is unreachable (old caddy still
 * serves static assets, but its upstream is down) before the new build is live.
 * Without this, that window surfaces as cryptic 5xx toasts, a stuck boot
 * splash, or the Sentry error boundary — a white-screen-ish "is it broken?".
 *
 * Instead we infer the deploy from the symptom and block the UI with a calm
 * "update in progress" overlay ([deploy-overlay.tsx]), then recover on our own:
 *
 *   api.ts calls notifyServerError() on any network failure or 5xx. We poll
 *   `/api/health` ({ status, version }, version = deployed git SHA) until it
 *   answers, then branch:
 *     - unreachable / 503 / 5xx -> blocked: show the overlay, keep polling.
 *       The copy splits on navigator.onLine: "offline" when the device itself
 *       has no link (a reliable signal), "update in progress" otherwise. Both
 *       are recovered by the same /api/health success — onLine === true is NOT
 *       trusted to dismiss (captive portals report online with no connectivity).
 *     - 200, same version as boot -> transient blip: dismiss, resume
 *     - 200, new version -> deploy finished, this tab is stale: reload to the
 *       fresh shell (subsumes the brittle 60s reload guard for the API path)
 *
 * A single business 500 with a healthy `/api/health` never shows the overlay:
 * the very next probe returns ok/same-version and we dismiss.
 */
import { useSyncExternalStore } from "react";

export const SERVER_ERROR_EVENT = "kn:server-error";
/** Fired once when the server comes back at the SAME version (no reload). */
export const SERVER_RECOVERED_EVENT = "kn:server-recovered";

type DeployState = "ok" | "updating" | "offline";

const POLL_MS = 3000;
/** Shared with public/boot-guard.js + main.tsx: one auto-reload per minute. */
const RELOAD_GUARD_KEY = "kn-reload-guard";

let state: DeployState = "ok";
let bootVersion: string | null = null;
let pollActive = false;
/** Resolves the in-flight poll delay early so an `online` event re-probes now. */
let wakePoll: (() => void) | null = null;
const listeners = new Set<() => void>();

function setState(next: DeployState): void {
  if (next === state) return;
  const recovered = state !== "ok" && next === "ok";
  state = next;
  for (const listener of listeners) listener();
  // Recovery from any blocked state (same-version deploy blip OR a network drop
  // that's now back): the overlay dismisses, but failed queries — e.g. the
  // /api/auth/me probe behind the AuthUnavailable retry panel — are still
  // errored. Let listeners re-hydrate so the user lands back on the app, not on
  // a stranded "try again" screen.
  if (recovered && typeof window !== "undefined") {
    window.dispatchEvent(new Event(SERVER_RECOVERED_EVENT));
  }
}

/** True while the blocking overlay (deploy update OR offline) owns the screen. */
export function isOverlayBlocking(): boolean {
  return state !== "ok";
}

/** Dispatched by api.ts — kept dependency-free via the DOM event bus. */
export function notifyServerError(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SERVER_ERROR_EVENT));
  }
}

/**
 * Like a plain sleep, but exposes `wakePoll()` so an `online` event can cut the
 * poll short and re-probe immediately instead of waiting out the 3s tick. Only
 * one poll loop runs at a time (pollActive), so there's at most one outstanding
 * delay and a single wake handle.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      wakePoll = null;
      resolve();
    }, ms);
    wakePoll = () => {
      clearTimeout(timer);
      wakePoll = null;
      resolve();
    };
  });
}

async function probeHealth(): Promise<{ reachable: boolean; version: string | null }> {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    // 503 = API up but DB unreachable (mid-deploy / restart): treat as down.
    if (!res.ok) return { reachable: false, version: null };
    const body = (await res.json().catch(() => null)) as { version?: string } | null;
    return { reachable: true, version: body?.version ?? null };
  } catch {
    // Network error / 5xx from caddy with no upstream: the deploy window.
    return { reachable: false, version: null };
  }
}

/** At most one auto-reload per minute per tab, shared with the other guards. */
function consumeReloadBudget(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    return true;
  } catch {
    // Storage blocked (private mode): don't let that prevent recovery.
    return true;
  }
}

async function runPoll(): Promise<void> {
  if (pollActive) return;
  pollActive = true;
  try {
    for (;;) {
      const health = await probeHealth();
      if (health.reachable) {
        if (bootVersion === null) bootVersion = health.version;
        if (health.version && bootVersion && health.version !== bootVersion) {
          // Deploy finished; this tab booted on the previous build.
          if (consumeReloadBudget()) {
            window.location.reload();
            return;
          }
          // Reloaded very recently — keep the overlay; the manual button reloads.
          setState("updating");
          return;
        }
        setState("ok");
        return;
      }
      // navigator.onLine === false is a reliable "device has no link" signal;
      // === true is not (captive portals), so a failed probe while "online"
      // stays "updating" — the deploy window and a flaky upstream look identical
      // from here and both auto-recover on the next reachable probe.
      setState(navigator.onLine ? "updating" : "offline");
      await delay(POLL_MS);
    }
  } finally {
    pollActive = false;
  }
}

export function initDeployWatch(): void {
  window.addEventListener(SERVER_ERROR_EVENT, () => void runPoll());
  // The device dropped its link: surface the offline overlay at once instead of
  // waiting for the next API call to fail, and make sure a poll is running so we
  // notice the moment it's reachable again.
  window.addEventListener("offline", () => {
    setState("offline");
    void runPoll();
  });
  // Back online (maybe): re-probe immediately. wakePoll() cuts short a sleeping
  // poll; runPoll() starts one if none is active. The overlay only clears on the
  // probe's success, never on this event alone.
  window.addEventListener("online", () => {
    wakePoll?.();
    void runPoll();
  });
  // Establish the boot version up front (one cheap request), so a later
  // recovery can detect a version change even if the first failure this tab
  // sees happens well into the session.
  void runPoll();
}

/** Overlay's manual "try again" button: re-probe `/api/health` right now. */
export function retryDeployWatch(): void {
  wakePoll?.();
  void runPoll();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getState(): DeployState {
  return state;
}

export function useDeployState(): DeployState {
  return useSyncExternalStore(subscribe, getState, getState);
}
