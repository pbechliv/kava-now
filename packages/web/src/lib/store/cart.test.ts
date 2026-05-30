import { beforeEach, describe, expect, it } from "vitest";
import { activateCartForSlug, useCartStore, type CatalogProduct } from "./cart";

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
});
