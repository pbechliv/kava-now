import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { products, tenants } from "./schema/index";

// These are integration tests against a live Postgres reachable as the
// NOSUPERUSER application role (RLS is bypassed for superusers, so the role
// matters). Set RLS_TEST_DATABASE_URL to the kavanow_app connection string to
// run them; otherwise they skip (so they never hit a dev/prod DB by accident).
const APP_URL = process.env.RLS_TEST_DATABASE_URL;
const suite = APP_URL ? describe : describe.skip;

suite("RLS tenant isolation", () => {
  let db: typeof import("./connection").db;
  let runWithTenant: typeof import("./connection").runWithTenant;
  let baseDb: typeof import("./connection").baseDb;
  let queryClient: typeof import("./connection").queryClient;

  const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  let tenantA = "";
  let tenantB = "";

  beforeAll(async () => {
    process.env.APP_DATABASE_URL = APP_URL;
    const conn = await import("./connection");
    ({ db, runWithTenant, baseDb, queryClient } = conn);

    // `tenants` has no RLS — create directly on the base connection.
    const [a] = await baseDb
      .insert(tenants)
      .values({ name: "RLS A", slug: `rls-a-${suffix}`, email: "a@example.com" })
      .returning({ id: tenants.id });
    const [b] = await baseDb
      .insert(tenants)
      .values({ name: "RLS B", slug: `rls-b-${suffix}`, email: "b@example.com" })
      .returning({ id: tenants.id });
    tenantA = a!.id;
    tenantB = b!.id;

    // `products` is RLS-scoped — insert each within its tenant context so the
    // WITH CHECK clause passes.
    await runWithTenant(tenantA, () =>
      db.insert(products).values([
        { tenantId: tenantA, name: "A-Cola", brand: "A", basePrice: "1.00" },
        { tenantId: tenantA, name: "A-Water", brand: "A", basePrice: "2.00" },
      ]),
    );
    await runWithTenant(tenantB, () =>
      db
        .insert(products)
        .values([{ tenantId: tenantB, name: "B-Cola", brand: "B", basePrice: "3.00" }]),
    );
  });

  afterAll(async () => {
    if (baseDb && tenantA && tenantB) {
      await baseDb.delete(tenants).where(inArray(tenants.id, [tenantA, tenantB]));
    }
    if (queryClient) await queryClient.end({ timeout: 5 });
  });

  it("scopes reads to the active tenant", async () => {
    const aRows = await runWithTenant(tenantA, () => db.select().from(products));
    expect(aRows).toHaveLength(2);
    expect(aRows.every((r) => r.tenantId === tenantA)).toBe(true);

    const bRows = await runWithTenant(tenantB, () => db.select().from(products));
    expect(bRows).toHaveLength(1);
    expect(bRows.every((r) => r.tenantId === tenantB)).toBe(true);
  });

  it("returns zero rows with no tenant context (fail-safe, never a leak)", async () => {
    const rows = await db.select().from(products);
    expect(rows).toHaveLength(0);
  });

  it("blocks writes that target another tenant (WITH CHECK)", async () => {
    await expect(
      runWithTenant(tenantA, () =>
        db
          .insert(products)
          .values({ tenantId: tenantB, name: "evil", brand: "X", basePrice: "9.99" }),
      ),
    ).rejects.toThrow();
  });

  it("does not leak tenant context across concurrent requests", async () => {
    const [aRows, bRows] = await Promise.all([
      runWithTenant(tenantA, async () => {
        await new Promise((r) => setTimeout(r, 25));
        return db.select().from(products);
      }),
      runWithTenant(tenantB, () => db.select().from(products)),
    ]);
    expect(aRows).toHaveLength(2);
    expect(aRows.every((r) => r.tenantId === tenantA)).toBe(true);
    expect(bRows).toHaveLength(1);
    expect(bRows.every((r) => r.tenantId === tenantB)).toBe(true);
  });
});
