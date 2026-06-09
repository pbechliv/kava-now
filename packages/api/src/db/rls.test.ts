import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { customers, orderItems, orders, products, tenants } from "./schema/index";

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

  it("order_items (subquery policy): invisible and immutable across tenants", async () => {
    const made = await runWithTenant(tenantA, async () => {
      const [cust] = await db
        .insert(customers)
        .values({ tenantId: tenantA, name: "RLS Customer" })
        .returning({ id: customers.id });
      const [order] = await db
        .insert(orders)
        .values({ tenantId: tenantA, customerId: cust!.id })
        .returning({ id: orders.id });
      const [prod] = await db.select({ id: products.id }).from(products).limit(1);
      const [item] = await db
        .insert(orderItems)
        .values({
          orderId: order!.id,
          productId: prod!.id,
          quantity: 1,
          unitPrice: "1.00",
          productName: "RLS Item",
        })
        .returning({ id: orderItems.id });
      return { orderId: order!.id, itemId: item!.id };
    });

    // order_items has no tenant_id — its policy goes through the parent
    // order. Tenant B must see nothing…
    const bRead = await runWithTenant(tenantB, () =>
      db.select().from(orderItems).where(eq(orderItems.orderId, made.orderId)),
    );
    expect(bRead).toHaveLength(0);

    // …and cross-tenant UPDATE/DELETE must affect zero rows (USING clause).
    const bUpd = await runWithTenant(tenantB, () =>
      db
        .update(orderItems)
        .set({ quantity: 99 })
        .where(eq(orderItems.id, made.itemId))
        .returning({ id: orderItems.id }),
    );
    expect(bUpd).toHaveLength(0);
    const bDel = await runWithTenant(tenantB, () =>
      db.delete(orderItems).where(eq(orderItems.id, made.itemId)).returning({ id: orderItems.id }),
    );
    expect(bDel).toHaveLength(0);

    const aRead = await runWithTenant(tenantA, () =>
      db
        .select({ quantity: orderItems.quantity })
        .from(orderItems)
        .where(eq(orderItems.id, made.itemId)),
    );
    expect(aRead).toEqual([{ quantity: 1 }]);
  });

  it("cross-tenant UPDATE/DELETE on a tenant_id table affect zero rows", async () => {
    const [target] = await runWithTenant(tenantA, () =>
      db.select({ id: products.id }).from(products).limit(1),
    );
    const upd = await runWithTenant(tenantB, () =>
      db
        .update(products)
        .set({ name: "stolen" })
        .where(eq(products.id, target!.id))
        .returning({ id: products.id }),
    );
    expect(upd).toHaveLength(0);
    const del = await runWithTenant(tenantB, () =>
      db.delete(products).where(eq(products.id, target!.id)).returning({ id: products.id }),
    );
    expect(del).toHaveLength(0);
  });

  it("guard: every tenant-scoped table ships with FORCED RLS and a policy", async () => {
    // tenant_memberships deliberately has no RLS (global table, app-enforced
    // via requireRole) — everything else carrying tenant_id, plus order_items
    // (scoped through its parent order), must have forced RLS + >=1 policy so
    // a new tenant-scoped table can't ship silently unprotected.
    const rows = (await baseDb.execute(sql`
      select c.relname as table_name,
             c.relrowsecurity as rls,
             c.relforcerowsecurity as forced,
             count(p.polname)::int as policies
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_policy p on p.polrelid = c.oid
      where n.nspname = 'public'
        and c.relkind = 'r'
        and c.relname <> 'tenant_memberships'
        and (
          c.relname = 'order_items'
          or exists (
            select 1 from information_schema.columns col
            where col.table_schema = 'public'
              and col.table_name = c.relname
              and col.column_name = 'tenant_id'
          )
        )
      group by c.relname, c.relrowsecurity, c.relforcerowsecurity
      order by c.relname
    `)) as unknown as Array<{
      table_name: string;
      rls: boolean;
      forced: boolean;
      policies: number;
    }>;

    const names = rows.map((r) => r.table_name);
    for (const required of [
      "categories",
      "customer_brand_pricing",
      "customers",
      "order_items",
      "orders",
      "products",
    ]) {
      expect(names).toContain(required);
    }
    for (const row of rows) {
      expect(row.rls, `${row.table_name} must have RLS enabled`).toBe(true);
      expect(row.forced, `${row.table_name} must FORCE RLS (owner bypass)`).toBe(true);
      expect(row.policies, `${row.table_name} must have at least one policy`).toBeGreaterThan(0);
    }
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
