import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

// Integration tests against a live Postgres (same gate as the RLS suite).
const APP_URL = process.env.RLS_TEST_DATABASE_URL;
const suite = APP_URL ? describe : describe.skip;

if (APP_URL) process.env.APP_DATABASE_URL = APP_URL;

suite("afterTenantCommit (post-commit dispatch)", () => {
  let conn: typeof import("./connection");
  let schema: typeof import("./schema/index");

  const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  // set_config only carries the value — no FK behind it, any UUID works.
  const tenantId = crypto.randomUUID();
  const userEmails: string[] = [];

  beforeAll(async () => {
    conn = await import("./connection");
    schema = await import("./schema/index");
  });

  afterAll(async () => {
    if (userEmails.length) {
      await conn.baseDb.delete(schema.users).where(inArray(schema.users.email, userEmails));
    }
    await conn.queryClient.end({ timeout: 5 });
  });

  it("runs after COMMIT, outside the tenant transaction, seeing committed rows", async () => {
    const email = `pc-commit-${suffix}@example.com`;
    userEmails.push(email);

    const events: string[] = [];
    let visibleFromPool = -1;
    let release!: () => void;
    const callbackDone = new Promise<void>((r) => (release = r));

    await conn.runWithTenant(tenantId, async () => {
      await conn.db.insert(schema.users).values({ email, name: "Post Commit" });
      await conn.afterTenantCommit(async () => {
        // Runs with no tenant context → the proxy targets the base pool. The
        // row is only visible from another connection once committed, so this
        // count doubles as proof we're past COMMIT.
        const rows = await conn.db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(eq(schema.users.email, email));
        visibleFromPool = rows.length;
        events.push("callback");
        release();
      });
      events.push("handler-end");
    });
    await callbackDone;

    expect(events).toEqual(["handler-end", "callback"]);
    expect(visibleFromPool).toBe(1);
  });

  it("never fires when the transaction rolls back", async () => {
    let fired = false;
    await expect(
      conn.runWithTenant(tenantId, async () => {
        await conn.afterTenantCommit(async () => {
          fired = true;
        });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    await new Promise((r) => setTimeout(r, 25));
    expect(fired).toBe(false);
  });

  it("outside a tenant transaction the callback runs (and is awaited) inline", async () => {
    let ran = false;
    await conn.afterTenantCommit(async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });
});
