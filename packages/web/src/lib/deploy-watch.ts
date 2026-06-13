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
 *     - unreachable / 503 / 5xx -> "updating": show the overlay, keep polling
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

type DeployState = "ok" | "updating";

const POLL_MS = 3000;
/** Shared with public/boot-guard.js + main.tsx: one auto-reload per minute. */
const RELOAD_GUARD_KEY = "kn-reload-guard";

let state: DeployState = "ok";
let bootVersion: string | null = null;
let pollActive = false;
const listeners = new Set<() => void>();

function setState(next: DeployState): void {
  if (next === state) return;
  const recovered = state === "updating" && next === "ok";
  state = next;
  for (const listener of listeners) listener();
  // Same-version recovery (a transient blip, not a new build): the overlay
  // dismisses, but failed queries — e.g. the /api/auth/me probe behind the
  // AuthUnavailable retry panel — are still errored. Let listeners re-hydrate
  // so the user lands back on the app, not on a stranded "try again" screen.
  if (recovered && typeof window !== "undefined") {
    window.dispatchEvent(new Event(SERVER_RECOVERED_EVENT));
  }
}

/** True while the blocking "update in progress" overlay is shown. */
export function isDeployUpdating(): boolean {
  return state === "updating";
}

/** Dispatched by api.ts — kept dependency-free via the DOM event bus. */
export function notifyServerError(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SERVER_ERROR_EVENT));
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      setState("updating");
      await delay(POLL_MS);
    }
  } finally {
    pollActive = false;
  }
}

export function initDeployWatch(): void {
  window.addEventListener(SERVER_ERROR_EVENT, () => void runPoll());
  // Establish the boot version up front (one cheap request), so a later
  // recovery can detect a version change even if the first failure this tab
  // sees happens well into the session.
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
