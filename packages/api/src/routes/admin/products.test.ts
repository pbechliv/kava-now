import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

// Integration tests against a live Postgres reachable as the NOSUPERUSER app
// role (same gate as the RLS suite). Set RLS_TEST_DATABASE_URL to run them.
const APP_URL = process.env.RLS_TEST_DATABASE_URL;
const suite = APP_URL ? describe : describe.skip;

if (APP_URL) process.env.APP_DATABASE_URL = APP_URL;

suite("POST /admin/products/import (batch upsert)", () => {
  let app: typeof import("../../app").app;
  let baseDb: typeof import("../../db/connection").baseDb;
  let runWithTenant: typeof import("../../db/connection").runWithTenant;
  let db: typeof import("../../db/connection").db;
  let queryClient: typeof import("../../db/connection").queryClient;
  let schema: typeof import("../../db/schema/index");

  const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const slug = `imp-${suffix}`;
  const ownerEmail = `imp-owner-${suffix}@example.com`;
  const ownerPassword = "importtest-pass-123";

  let tenantId = "";
  let cookie = "";

  const importRows = (rows: unknown[]) =>
    app.request(`/api/k/${slug}/admin/products/import`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ rows }),
    });

  async function productCount() {
    return runWithTenant(tenantId, async () => {
      const rows = await db
        .select({ id: schema.products.id })
        .from(schema.products)
        .where(eq(schema.products.tenantId, tenantId));
      return rows.length;
    });
  }

  beforeAll(async () => {
    const conn = await import("../../db/connection");
    ({ baseDb, runWithTenant, db, queryClient } = conn);
    schema = await import("../../db/schema/index");
    ({ app } = await import("../../app"));
    const { createTenantWithOwner } = await import("../../services/create-tenant");

    const created = await createTenantWithOwner({
      name: "Import Test Tenant",
      slug,
      email: ownerEmail,
      password: ownerPassword,
    });
    tenantId = created.tenantId;

    const signIn = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: ownerEmail, password: ownerPassword }),
    });
    expect(signIn.status).toBe(200);
    cookie = signIn.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
  });

  afterAll(async () => {
    if (baseDb && tenantId) {
      await baseDb.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
      await baseDb.delete(schema.users).where(inArray(schema.users.email, [ownerEmail]));
    }
    if (queryClient) await queryClient.end({ timeout: 5 });
  });

  it("inserts, creates categories race-safely, then updates on re-import", async () => {
    const first = await importRows([
      { name: "Gin A", brand: "Br", basePrice: 10, categoryName: "Spirits", erpRef: "ERP-1" },
      { name: "Gin B", brand: "Br", basePrice: 12, categoryName: "spirits" },
      { name: "Beer C", brand: "Br", basePrice: 3 },
    ]);
    expect(first.status).toBe(200);
    const r1 = await first.json();
    expect(r1).toMatchObject({ inserted: 3, updated: 0, categoriesCreated: 1, total: 3 });

    const second = await importRows([
      { name: "Gin A", brand: "Br", basePrice: 11, erpRef: "ERP-1" },
    ]);
    const r2 = await second.json();
    expect(r2).toMatchObject({ inserted: 0, updated: 1 });
  });

  it("intra-file duplicates of (name, brand): the last row wins, one product", async () => {
    const res = await importRows([
      { name: "Dup", brand: "Br", basePrice: 5 },
      { name: "Dup", brand: "Br", basePrice: 7 },
    ]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inserted + body.updated).toBe(1);

    const price = await runWithTenant(tenantId, async () => {
      const [row] = await db
        .select({ basePrice: schema.products.basePrice })
        .from(schema.products)
        .where(eq(schema.products.name, "Dup"));
      return row?.basePrice;
    });
    expect(Number(price)).toBe(7);
  });

  it("erpRef collision on a different (name, brand) → located 409, nothing imported (#56)", async () => {
    const before = await productCount();

    const res = await importRows([
      { name: "Fresh One", brand: "Br", basePrice: 4 },
      // ERP-1 already belongs to "Gin A"/"Br" — different product key.
      { name: "Other Name", brand: "OtherBrand", basePrice: 6, erpRef: "ERP-1" },
    ]);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("DUPLICATE_PRODUCT_ERP_REF");
    expect(body.rowIndex).toBe(1);

    // All-or-nothing: the valid first row must not have been committed.
    expect(await productCount()).toBe(before);
  });
});
