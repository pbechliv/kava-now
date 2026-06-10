import { api } from "./api";

/**
 * Web Push client (#28). Subscriptions are per browser/device; subscribing or
 * unsubscribing this device IS the user's push preference. iOS only supports
 * web push for installed PWAs — `pushSupported()` is false in plain Safari
 * tabs, and the UI degrades to an explanatory hint.
 */
export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function getPushPublicKey(): Promise<string | null> {
  const res = await api.get<{ publicKey: string | null }>("/api/auth/push/public-key");
  return res.publicKey;
}

/** The browser's current subscription for this origin, if any. */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  // getRegistration, not .ready — .ready never resolves when no SW is
  // registered (dev registers none).
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export type SubscribeResult = "subscribed" | "denied" | "unavailable";

export async function subscribeToPush(publicKey: string): Promise<SubscribeResult> {
  if (!pushSupported()) return "unavailable";
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return "unavailable";

  // Permission is requested here — on an explicit toggle click, never on load.
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
  });
  const json = sub.toJSON();
  if (!json.keys?.p256dh || !json.keys.auth) {
    await sub.unsubscribe();
    return "unavailable";
  }
  await api.post("/api/auth/push/subscribe", {
    endpoint: sub.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  });
  return "subscribed";
}

export async function unsubscribeFromPush(): Promise<void> {
  const sub = await getCurrentSubscription();
  if (!sub) return;
  // Server first: if the browser-side unsubscribe fails we'd rather have a
  // dangling browser subscription than keep sending to a user who opted out.
  await api.post("/api/auth/push/unsubscribe", { endpoint: sub.endpoint });
  await sub.unsubscribe();
}
