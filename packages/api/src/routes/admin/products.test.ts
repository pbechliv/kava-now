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

  const importRows = (rows: unknown[], extra: Record<string, unknown> = {}) =>
    app.request(`/api/k/${slug}/admin/products/import`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ rows, ...extra }),
    });

  const listProducts = (search: string) =>
    app.request(`/api/k/${slug}/admin/products?search=${encodeURIComponent(search)}`, {
      headers: { cookie },
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

  it("dry-run reports counts + dedup without writing anything", async () => {
    const before = await productCount();
    const res = await importRows(
      [
        { name: "DryRun X", brand: "Br", basePrice: 5 },
        { name: "DryRun X", brand: "Br", basePrice: 9 }, // collapsed by dedup
        { name: "Gin A", brand: "Br", basePrice: 99 }, // existing → update
      ],
      { dryRun: true },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      dryRun: true,
      inserted: 1,
      updated: 1,
      duplicatesInFile: 1,
      total: 3,
      conflict: null,
    });
    // Nothing committed: count unchanged and "Gin A" keeps its real price.
    expect(await productCount()).toBe(before);
  });

  it("dry-run surfaces an erpRef conflict in the body instead of a 409", async () => {
    const res = await importRows(
      [{ name: "Other Name", brand: "OtherBrand", basePrice: 6, erpRef: "ERP-1" }],
      { dryRun: true },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.conflict).toMatchObject({ rowIndex: 0, erpRef: "ERP-1" });
  });

  it("records committed imports in the history (audit log)", async () => {
    await importRows([{ name: "Logged Product", brand: "LogBr", basePrice: 8 }], {
      sourceFilename: "supplier.csv",
    });
    const res = await app.request(`/api/k/${slug}/admin/products/import/history`, {
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    const history = await res.json();
    expect(history.length).toBeGreaterThan(0);
    expect(history[0]).toMatchObject({ sourceFilename: "supplier.csv" });
  });

  it("saves, lists, and deletes a column-mapping template", async () => {
    const save = await app.request(`/api/k/${slug}/admin/products/import/mappings`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ name: "Supplier A", mapping: { name: "Όνομα", basePrice: "Τιμή" } }),
    });
    expect(save.status).toBe(201);
    const saved = await save.json();

    const list = await app.request(`/api/k/${slug}/admin/products/import/mappings`, {
      headers: { cookie },
    });
    const templates = await list.json();
    expect(templates.some((t: { name: string }) => t.name === "Supplier A")).toBe(true);

    const del = await app.request(`/api/k/${slug}/admin/products/import/mappings/${saved.id}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(del.status).toBe(200);
  });

  it("search folds Greek accents (unaccented query matches an accented name/brand)", async () => {
    const imp = await importRows([{ name: "Καφές Special", brand: "Βραζιλία", basePrice: 5 }]);
    expect(imp.status).toBe(200);

    // Unaccented, lowercase query matches the accented, capitalized name.
    const byName = await listProducts("καφες");
    expect(byName.status).toBe(200);
    const names = (await byName.json()).data.map((p: { name: string }) => p.name);
    expect(names).toContain("Καφές Special");

    // Brand is matched accent-insensitively too.
    const byBrand = await listProducts("βραζιλια");
    const brandHits = (await byBrand.json()).data.map((p: { name: string }) => p.name);
    expect(brandHits).toContain("Καφές Special");
  });
});
