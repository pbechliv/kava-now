import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray, eq } from "drizzle-orm";
import type { OrderStatus, ErpStatus } from "@kava-now/shared";
import { must } from "../../test-utils";

// Integration tests against a live Postgres reachable as the NOSUPERUSER app
// role (same gate as the RLS suite). Set RLS_TEST_DATABASE_URL to run them.
const APP_URL = process.env.RLS_TEST_DATABASE_URL;
const suite = APP_URL ? describe : describe.skip;

// Must be set before any app module is (dynamically) imported — config reads
// it at import time and the connection is cached per test file.
if (APP_URL) process.env.APP_DATABASE_URL = APP_URL;

describe("assertOrderMutable (ERP + fulfillment hard lock)", () => {
  let assertOrderMutable: typeof import("./orders").assertOrderMutable;

  beforeAll(async () => {
    ({ assertOrderMutable } = await import("./orders"));
  });

  const cases: Array<[OrderStatus, ErpStatus, boolean]> = [
    ["pending", "pending", true],
    ["confirmed", "pending", true],
    ["shipped", "pending", false],
    ["delivered", "pending", false],
    ["cancelled", "pending", false],
    ["cancellation_requested", "pending", false],
    ["cancelled_by_customer", "pending", false],
    ["pending", "transmitted", false],
    ["confirmed", "transmitted", false],
    ["delivered", "transmitted", false],
  ];

  it.each(cases)("status=%s erp=%s → mutable=%s", (status, erpStatus, ok) => {
    expect(assertOrderMutable({ status, erpStatus }).ok).toBe(ok);
  });

  it("reports the ERP lock distinctly from the status lock", () => {
    const byStatus = assertOrderMutable({ status: "delivered", erpStatus: "pending" });
    const byErp = assertOrderMutable({ status: "pending", erpStatus: "transmitted" });
    expect(byStatus.ok || byErp.ok).toBe(false);
    if (!byStatus.ok && !byErp.ok) {
      expect(byStatus.code).not.toBe(byErp.code);
    }
  });
});

suite("admin order mutations (HTTP, hard lock + soft-cancel totals)", () => {
  let app: typeof import("../../app").app;
  let db: typeof import("../../db/connection").db;
  let baseDb: typeof import("../../db/connection").baseDb;
  let runWithTenant: typeof import("../../db/connection").runWithTenant;
  let queryClient: typeof import("../../db/connection").queryClient;
  let schema: typeof import("../../db/schema/index");

  const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const slug = `ord-${suffix}`;
  const ownerEmail = `ord-owner-${suffix}@example.com`;
  const ownerPassword = "ordertest-pass-123";

  let tenantId = "";
  let cookie = "";
  let customerId = "";
  let p1 = ""; // 10.00
  let p2 = ""; // 5.00
  let p3 = ""; // 7.50 (replacement target)

  const api = (path: string, init?: Omit<RequestInit, "headers">) =>
    app.request(`/api/k/${slug}/admin${path}`, {
      ...init,
      headers: { cookie, "content-type": "application/json" },
    });

  /** Create a pending order with 2×p1 (10.00) + 3×p2 (5.00) = 35.00. */
  async function createOrder() {
    return runWithTenant(tenantId, async () => {
      const [order] = await db
        .insert(schema.orders)
        .values({ tenantId, customerId })
        .returning({ id: schema.orders.id });
      const items = await db
        .insert(schema.orderItems)
        .values([
          {
            orderId: must(order).id,
            productId: p1,
            quantity: 2,
            unitPrice: "10.00",
            productName: "P1",
          },
          {
            orderId: must(order).id,
            productId: p2,
            quantity: 3,
            unitPrice: "5.00",
            productName: "P2",
          },
        ])
        .returning({ id: schema.orderItems.id });
      return { orderId: must(order).id, itemIds: items.map((i) => i.id) };
    });
  }

  beforeAll(async () => {
    const conn = await import("../../db/connection");
    ({ db, baseDb, runWithTenant, queryClient } = conn);
    schema = await import("../../db/schema/index");
    ({ app } = await import("../../app"));
    const { createTenantWithOwner } = await import("../../services/create-tenant");

    const created = await createTenantWithOwner({
      name: "Order Test Tenant",
      slug,
      email: ownerEmail,
      password: ownerPassword,
    });
    tenantId = created.tenantId;

    // Customer + products, inside the tenant context so RLS WITH CHECK passes.
    await runWithTenant(tenantId, async () => {
      const [customer] = await db
        .insert(schema.customers)
        .values({ tenantId, name: "Order Test Customer" })
        .returning({ id: schema.customers.id });
      customerId = must(customer).id;

      const products = await db
        .insert(schema.products)
        .values([
          { tenantId, name: "P1", brand: "T", basePrice: "10.00" },
          { tenantId, name: "P2", brand: "T", basePrice: "5.00" },
          { tenantId, name: "P3", brand: "T", basePrice: "7.50" },
        ])
        .returning({ id: schema.products.id });
      [p1, p2, p3] = products.map((p) => p.id) as [string, string, string];
    });

    // Real session via better-auth sign-in.
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

  it("soft-cancel keeps the line for audit but drops it from totals", async () => {
    const { orderId, itemIds } = await createOrder();

    const cancel = await api(`/orders/${orderId}/items/${itemIds[1]}/cancel`, { method: "POST" });
    expect(cancel.status).toBe(200);

    // Detail: cancelled line still present, total counts active lines only.
    const detail = await (await api(`/orders/${orderId}`)).json();
    expect(detail.items).toHaveLength(2);
    const cancelled = detail.items.find((i: { id: string }) => i.id === itemIds[1]);
    expect(cancelled.status).toBe("cancelled");
    expect(detail.total).toBe(20); // 2 × 10.00

    // List aggregation filters status='active' too.
    const list = await (await api(`/orders`)).json();
    const row = list.data.find((r: { id: string }) => r.id === orderId);
    expect(row.itemCount).toBe(1);
    expect(Number(row.total)).toBe(20);

    // Dashboard recentOrders must apply the same filter (regression: #45 —
    // cancelled lines were counted and replaced lines double-counted).
    const stats = await (await api(`/dashboard/stats`)).json();
    const recent = stats.recentOrders.find((r: { id: string }) => r.id === orderId);
    expect(recent.itemCount).toBe(1);
    expect(Number(recent.total)).toBe(20);

    // Cancelling the same line again → 409.
    const again = await api(`/orders/${orderId}/items/${itemIds[1]}/cancel`, { method: "POST" });
    expect(again.status).toBe(409);
  });

  it("replace cancels the old line, links it, and re-prices the new one", async () => {
    const { orderId, itemIds } = await createOrder();

    const replace = await api(`/orders/${orderId}/items/${itemIds[0]}/replace`, {
      method: "POST",
      body: JSON.stringify({ productId: p3, quantity: 4 }),
    });
    expect(replace.status).toBe(201);
    const newItem = await replace.json();

    const detail = await (await api(`/orders/${orderId}`)).json();
    const old = detail.items.find((i: { id: string }) => i.id === itemIds[0]);
    expect(old.status).toBe("cancelled");
    expect(old.replacedByItemId).toBe(newItem.id);
    expect(detail.total).toBe(4 * 7.5 + 3 * 5); // replacement + untouched P2
  });

  it("ERP transmission is one-shot and hard-locks all item mutations", async () => {
    const { orderId, itemIds } = await createOrder();

    const first = await api(`/orders/${orderId}/erp`, {
      method: "PATCH",
      body: JSON.stringify({ mark: "400001234567890" }),
    });
    expect(first.status).toBe(200);

    const second = await api(`/orders/${orderId}/erp`, {
      method: "PATCH",
      body: JSON.stringify({ mark: "400009999999999" }),
    });
    expect(second.status).toBe(409);

    // The original MARK survives the rejected retry.
    const detail = await (await api(`/orders/${orderId}`)).json();
    expect(detail.erpMark).toBe("400001234567890");
    expect(detail.erpStatus).toBe("transmitted");

    // All item mutations are rejected with the ERP-lock code.
    const responses = await Promise.all([
      api(`/orders/${orderId}/items`, {
        method: "POST",
        body: JSON.stringify({ productId: p3, quantity: 1 }),
      }),
      api(`/orders/${orderId}/items/${itemIds[0]}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity: 9 }),
      }),
      api(`/orders/${orderId}/items/${itemIds[0]}/cancel`, { method: "POST" }),
      api(`/orders/${orderId}/items/${itemIds[0]}/replace`, {
        method: "POST",
        body: JSON.stringify({ productId: p3, quantity: 1 }),
      }),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe("ORDER_LOCKED_BY_ERP");
    }
  });

  it("internal notes round-trip, clear, and stay editable after the ERP lock", async () => {
    const { orderId } = await createOrder();

    // Set: leading/trailing whitespace is trimmed before store.
    const set = await api(`/orders/${orderId}/internal-notes`, {
      method: "PATCH",
      body: JSON.stringify({ internalNotes: "  call the warehouse first  " }),
    });
    expect(set.status).toBe(200);
    expect((await set.json()).internalNotes).toBe("call the warehouse first");

    // Hard-lock the order via ERP transmission, then confirm the note is still editable.
    const erp = await api(`/orders/${orderId}/erp`, {
      method: "PATCH",
      body: JSON.stringify({ mark: "400003333333333" }),
    });
    expect(erp.status).toBe(200);

    const update = await api(`/orders/${orderId}/internal-notes`, {
      method: "PATCH",
      body: JSON.stringify({ internalNotes: "transmitted — invoice on file" }),
    });
    expect(update.status).toBe(200);

    // Empty string clears the note (stored as NULL).
    const clear = await api(`/orders/${orderId}/internal-notes`, {
      method: "PATCH",
      body: JSON.stringify({ internalNotes: "" }),
    });
    expect(clear.status).toBe(200);
    expect((await clear.json()).internalNotes).toBeNull();
  });

  it("normalizes a pasted MARK (strips whitespace) and rejects non-numeric input", async () => {
    const { orderId } = await createOrder();

    // Copy-paste cruft: surrounding + internal whitespace is stripped before store.
    const ok = await api(`/orders/${orderId}/erp`, {
      method: "PATCH",
      body: JSON.stringify({ mark: "  4000 0123 4567 890  " }),
    });
    expect(ok.status).toBe(200);
    expect((await ok.json()).erpMark).toBe("400001234567890");

    // A MARK with letters is rejected at the boundary, not stored.
    const { orderId: other } = await createOrder();
    const bad = await api(`/orders/${other}/erp`, {
      method: "PATCH",
      body: JSON.stringify({ mark: "MARK-123" }),
    });
    expect(bad.status).toBe(400);
    const detail = await (await api(`/orders/${other}`)).json();
    expect(detail.erpStatus).toBe("pending");
    expect(detail.erpMark).toBeNull();
  });

  it("filters the orders list by erpStatus", async () => {
    const { orderId: transmitted } = await createOrder();
    const { orderId: pending } = await createOrder();

    const mark = await api(`/orders/${transmitted}/erp`, {
      method: "PATCH",
      body: JSON.stringify({ mark: "400007777777777" }),
    });
    expect(mark.status).toBe(200);

    const ids = async (query: string) => {
      const list = await (await api(`/orders${query}`)).json();
      return new Set(list.data.map((r: { id: string }) => r.id));
    };

    const transmittedIds = await ids("?erpStatus=transmitted");
    expect(transmittedIds.has(transmitted)).toBe(true);
    expect(transmittedIds.has(pending)).toBe(false);

    const pendingIds = await ids("?erpStatus=pending");
    expect(pendingIds.has(pending)).toBe(true);
    expect(pendingIds.has(transmitted)).toBe(false);
  });

  it("fulfillment status past 'confirmed' locks item mutations; invalid transitions 400", async () => {
    const { orderId, itemIds } = await createOrder();

    // Walk pending → confirmed → shipped.
    for (const status of ["confirmed", "shipped"]) {
      const res = await api(`/orders/${orderId}/status`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      expect(res.status).toBe(200);
    }

    const mutate = await api(`/orders/${orderId}/items/${itemIds[0]}`, {
      method: "PATCH",
      body: JSON.stringify({ quantity: 9 }),
    });
    expect(mutate.status).toBe(409);
    expect((await mutate.json()).code).toBe("ORDER_LOCKED_BY_STATUS");

    // shipped → confirmed is not an allowed transition.
    const invalid = await api(`/orders/${orderId}/status`, {
      method: "PUT",
      body: JSON.stringify({ status: "confirmed" }),
    });
    expect(invalid.status).toBe(400);
  });

  const setStatus = (orderId: string, status: OrderStatus) =>
    runWithTenant(tenantId, () =>
      db.update(schema.orders).set({ status }).where(eq(schema.orders.id, orderId)),
    );

  it("approving a cancellation request finalizes it as cancelled_by_customer", async () => {
    const { orderId } = await createOrder();
    await setStatus(orderId, "cancellation_requested");

    const res = await api(`/orders/${orderId}/cancellation-request`, {
      method: "POST",
      body: JSON.stringify({ decision: "approve" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("cancelled_by_customer");
  });

  it("rejecting a cancellation request returns the order to confirmed", async () => {
    const { orderId } = await createOrder();
    await setStatus(orderId, "cancellation_requested");

    const res = await api(`/orders/${orderId}/cancellation-request`, {
      method: "POST",
      body: JSON.stringify({ decision: "reject" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("confirmed");
  });

  it("resolving an order with no pending request → 409", async () => {
    const { orderId } = await createOrder(); // still pending
    const res = await api(`/orders/${orderId}/cancellation-request`, {
      method: "POST",
      body: JSON.stringify({ decision: "approve" }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("ORDER_CANCELLATION_NOT_REQUESTED");
  });

  it("a staff cancellation stays the distinct 'cancelled' status", async () => {
    const { orderId } = await createOrder();
    const res = await api(`/orders/${orderId}/status`, {
      method: "PUT",
      body: JSON.stringify({ status: "cancelled" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("cancelled");
  });

  it("a customer-cancelled order cannot be transmitted to ERP", async () => {
    const { orderId } = await createOrder();
    await setStatus(orderId, "cancelled_by_customer");

    const res = await api(`/orders/${orderId}/erp`, {
      method: "PATCH",
      body: JSON.stringify({ mark: "400001111111111" }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("ORDER_LOCKED_BY_STATUS");
  });

  it("garbage ids and dates are rejected at the boundary, not as 500s (#55)", async () => {
    // Non-UUID path param → Postgres 22P02 mapped to 400, not a 500 + Sentry.
    const detail = await api(`/orders/not-a-uuid`);
    expect(detail.status).toBe(400);

    // Garbage date filter → 400, no postgres-js "Invalid time value".
    const list = await api(`/orders?dateFrom=garbage`);
    expect(list.status).toBe(400);

    // Garbage customerId filter → 400.
    const filtered = await api(`/orders?customerId=abc`);
    expect(filtered.status).toBe(400);
  });

  it("customer/product deletion never destroys order history (no-action FK)", async () => {
    await createOrder();

    // Route refuses: customer has orders.
    const delCustomer = await api(`/customers/${customerId}`, { method: "DELETE" });
    expect(delCustomer.status).toBe(400);
    expect((await delCustomer.json()).code).toBe("CUSTOMER_HAS_ORDERS");

    // Referenced product is deactivated, never hard-deleted — the response
    // carries the (now inactive) product alongside the success flag.
    const delProduct = await api(`/products/${p1}`, { method: "DELETE" });
    expect(delProduct.status).toBe(200);
    const delBody = await delProduct.json();
    expect(delBody.success).toBe(true);
    expect(delBody.product.active).toBe(false);

    // DB-level backstop (the race path): a raw delete is refused by the
    // deferred FK at commit instead of cascading the order history away.
    await expect(
      runWithTenant(tenantId, () =>
        db.delete(schema.customers).where(eq(schema.customers.id, customerId)),
      ),
    ).rejects.toThrow();
  });
});
