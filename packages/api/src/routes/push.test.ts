import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import webpush from "web-push";

// Integration tests against a live Postgres (same gate as the RLS suite).
const APP_URL = process.env.RLS_TEST_DATABASE_URL;
const suite = APP_URL ? describe : describe.skip;

if (APP_URL) {
  process.env.APP_DATABASE_URL = APP_URL;
  // Must be set before the config singleton is (dynamically) imported — this
  // file runs in its own worker, so other suites keep push disabled.
  const keys = webpush.generateVAPIDKeys();
  process.env.VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.VAPID_PRIVATE_KEY = keys.privateKey;
}

suite("push subscription endpoints (#28)", () => {
  let app: typeof import("../app").app;
  let baseDb: typeof import("../db/connection").baseDb;
  let queryClient: typeof import("../db/connection").queryClient;
  let schema: typeof import("../db/schema/index");

  const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const ownerEmail = `push-owner-${suffix}@example.com`;
  const password = "pushtest-pass-123";
  const endpoint = `https://push.example.com/sub/${suffix}`;

  let tenantId = "";
  let userId = "";
  let cookie = "";

  const post = (path: string, body: unknown) =>
    app.request(path, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  async function subscriptionRows() {
    return baseDb
      .select({ userId: schema.pushSubscriptions.userId })
      .from(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.endpoint, endpoint));
  }

  beforeAll(async () => {
    const conn = await import("../db/connection");
    ({ baseDb, queryClient } = conn);
    schema = await import("../db/schema/index");
    ({ app } = await import("../app"));
    const { createTenantWithOwner } = await import("../services/create-tenant");

    const created = await createTenantWithOwner({
      name: "Push Test Tenant",
      slug: `push-${suffix}`,
      email: ownerEmail,
      password,
    });
    tenantId = created.tenantId;
    userId = created.ownerUserId;

    const signIn = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: ownerEmail, password }),
    });
    expect(signIn.status).toBe(200);
    cookie = signIn.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
  });

  afterAll(async () => {
    if (baseDb && tenantId) {
      await baseDb
        .delete(schema.pushSubscriptions)
        .where(eq(schema.pushSubscriptions.endpoint, endpoint));
      await baseDb.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
      await baseDb.delete(schema.users).where(eq(schema.users.email, ownerEmail));
    }
    if (queryClient) await queryClient.end({ timeout: 5 });
  });

  it("serves the VAPID public key", async () => {
    const res = await app.request("/api/auth/push/public-key");
    expect(res.status).toBe(200);
    expect((await res.json()).publicKey).toBe(process.env.VAPID_PUBLIC_KEY);
  });

  it("subscribe requires auth", async () => {
    const res = await app.request("/api/auth/push/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint, keys: { p256dh: "k", auth: "a" } }),
    });
    expect(res.status).toBe(401);
  });

  it("subscribe upserts by endpoint; unsubscribe removes it", async () => {
    const sub = await post("/api/auth/push/subscribe", {
      endpoint,
      keys: { p256dh: "p256dh-key", auth: "auth-key" },
    });
    expect(sub.status).toBe(200);
    expect(await subscriptionRows()).toEqual([{ userId }]);

    // Same endpoint again → still one row (re-bind, not duplicate).
    const again = await post("/api/auth/push/subscribe", {
      endpoint,
      keys: { p256dh: "rotated", auth: "rotated" },
    });
    expect(again.status).toBe(200);
    expect(await subscriptionRows()).toHaveLength(1);

    const unsub = await post("/api/auth/push/unsubscribe", { endpoint });
    expect(unsub.status).toBe(200);
    expect(await subscriptionRows()).toHaveLength(0);
  });

  it("rejects malformed subscriptions", async () => {
    const res = await post("/api/auth/push/subscribe", { endpoint: "not-a-url", keys: {} });
    expect(res.status).toBe(400);
  });
});
