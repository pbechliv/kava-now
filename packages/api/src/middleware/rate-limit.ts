import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

interface Bucket {
  count: number;
  resetAt: number;
}

interface Limit {
  max: number;
  windowMs: number;
}

const buckets = new Map<string, Bucket>();

// Periodic cleanup of expired buckets to keep the Map from growing forever.
// Timer is unref'd so it doesn't keep the process alive on shutdown.
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}, 60_000);
if (typeof cleanup.unref === "function") cleanup.unref();

function hitBucket(bucketKey: string, limit: Limit, now: number): boolean {
  const existing = buckets.get(bucketKey);
  if (!existing || existing.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + limit.windowMs });
    return true;
  }
  if (existing.count >= limit.max) return false;
  existing.count += 1;
  return true;
}

/**
 * Simple in-memory rate limiter. Keyed by IP (+ optional extra key). Intended
 * for auth-facing endpoints where abuse is the main concern. For multi-instance
 * deployments swap the Map for a shared store (Redis) — the middleware
 * interface stays the same.
 */
export function rateLimit(config: {
  key: string;
  perIp?: Limit[];
  perExtra?: { extract: (body: unknown) => string | null; limits: Limit[] };
}) {
  return createMiddleware<AppEnv>(async (c, next) => {
    // Caddy validates the client via trusted_proxies and SETS X-Real-IP
    // itself, so it's the only trustworthy source. The old X-Forwarded-For
    // first-hop fallback was client-suppliable (bucket-splitting bypass).
    const ip = c.req.header("x-real-ip") || "unknown";
    const now = Date.now();

    for (const limit of config.perIp ?? []) {
      const bk = `${config.key}:ip:${ip}:${limit.windowMs}`;
      if (!hitBucket(bk, limit, now)) {
        return c.json({ error: "Too many requests. Please try again later." }, 429);
      }
    }

    if (config.perExtra) {
      // Read + cache the body so downstream handlers can still parse it.
      let body: unknown = null;
      try {
        body = await c.req.raw.clone().json();
      } catch {
        // Non-JSON bodies just skip the per-extra limit.
      }
      const extra = body ? config.perExtra.extract(body) : null;
      if (extra) {
        for (const limit of config.perExtra.limits) {
          const bk = `${config.key}:x:${extra}:${limit.windowMs}`;
          if (!hitBucket(bk, limit, now)) {
            return c.json({ error: "Too many requests. Please try again later." }, 429);
          }
        }
      }
    }

    return next();
  });
}

// Pre-configured limiters for auth routes.
const MIN = 60_000;
const HOUR = 60 * MIN;

export const signInRateLimit = rateLimit({
  key: "sign-in",
  perIp: [{ max: 10, windowMs: MIN }],
});

export const forgotPasswordRateLimit = rateLimit({
  key: "forget-password",
  perIp: [{ max: 3, windowMs: MIN }],
  perExtra: {
    // Lowercased — User@x.com and user@x.com must share one bucket.
    extract: (body) =>
      typeof body === "object" &&
      body &&
      "email" in body &&
      typeof (body as { email: unknown }).email === "string"
        ? (body as { email: string }).email.toLowerCase().trim() || null
        : null,
    limits: [{ max: 10, windowMs: HOUR }],
  },
});
