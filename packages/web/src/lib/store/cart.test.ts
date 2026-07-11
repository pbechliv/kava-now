import { beforeEach, describe, expect, it } from "vitest";
import { activateCartForSlug, deactivateCart, useCartStore, type CatalogProduct } from "./cart";

function product(id: string, price: number): CatalogProduct {
  return {
    id,
    name: id,
    brand: "ACME",
    description: null,
    imageUrl: null,
    unit: "bottle",
    volumeMl: null,
    alcoholPct: null,
    categoryId: null,
    categoryName: null,
    resolvedPrice: price,
  };
}

describe("cart store tenant scoping (C3)", () => {
  beforeEach(() => {
    localStorage.clear();
    useCartStore.setState({ items: {} });
  });

  it("keeps each tenant's cart separate and never bleeds across tenants", async () => {
    // Tenant alpha: add an item.
    await activateCartForSlug("alpha");
    useCartStore.getState().addItem(product("p1", 5), 2);
    expect(useCartStore.getState().totalItems()).toBe(2);

    // Switch to beta (no stored cart) → must start empty, not show alpha's items.
    await activateCartForSlug("beta");
    expect(useCartStore.getState().totalItems()).toBe(0);
    useCartStore.getState().addItem(product("p2", 3), 1);
    expect(useCartStore.getState().totalItems()).toBe(1);

    // Back to alpha → its cart is restored intact; beta's item is absent.
    await activateCartForSlug("alpha");
    expect(useCartStore.getState().items.p1?.quantity).toBe(2);
    expect(useCartStore.getState().items.p2).toBeUndefined();
    expect(useCartStore.getState().totalItems()).toBe(2);

    // Persisted under tenant-scoped keys, never the shared `kavanow-cart` key.
    expect(localStorage.getItem("kavanow-cart-alpha")).toBeTruthy();
    expect(localStorage.getItem("kavanow-cart-beta")).toBeTruthy();
  });

  it("loadItems replaces the whole cart (reorder) and clamps to the line cap", () => {
    const store = useCartStore.getState();
    // A stray item that must NOT survive a reorder-load.
    store.addItem(product("stale", 9), 4);

    store.loadItems([
      { product: product("p1", 5), quantity: 2 },
      { product: product("p2", 3), quantity: 999_999 },
    ]);

    const items = useCartStore.getState().items;
    expect(items.stale).toBeUndefined();
    expect(items.p1?.quantity).toBe(2);
    // Clamped to MAX_ORDER_QUANTITY (9999).
    expect(items.p2?.quantity).toBe(9999);
    expect(useCartStore.getState().totalItems()).toBe(9999 + 2);
  });

  it("logout forgets every cart — the next user never inherits items or prices", async () => {
    // User A leaves carts in two tenants on this machine.
    await activateCartForSlug("alpha");
    useCartStore.getState().addItem(product("p1", 5), 2);
    await activateCartForSlug("beta");
    useCartStore.getState().addItem(product("p2", 3), 1);
    expect(localStorage.getItem("kavanow-cart-alpha")).toBeTruthy();
    expect(localStorage.getItem("kavanow-cart-beta")).toBeTruthy();

    deactivateCart();

    // In-memory and persisted carts (all tenants) are gone.
    expect(useCartStore.getState().totalItems()).toBe(0);
    expect(localStorage.getItem("kavanow-cart-alpha")).toBeNull();
    expect(localStorage.getItem("kavanow-cart-beta")).toBeNull();

    // User B logging into the same tenant starts empty — the same-slug early
    // return must not resurrect A's in-memory items.
    await activateCartForSlug("beta");
    expect(useCartStore.getState().totalItems()).toBe(0);
  });
});
