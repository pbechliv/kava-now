import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ProductUnit } from "@kava-now/shared";

export interface CatalogProduct {
  id: string;
  name: string;
  brand: string;
  description: string | null;
  imageUrl: string | null;
  unit: ProductUnit;
  volumeMl: number | null;
  alcoholPct: number | null;
  categoryId: string | null;
  categoryName: string | null;
  resolvedPrice: number;
}

export interface CartItem {
  product: CatalogProduct;
  quantity: number;
}

interface CartState {
  items: Record<string, CartItem>;
  addItem: (product: CatalogProduct, quantity: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: () => number;
  totalPrice: () => number;
}

const CART_KEY = "kavanow-cart";

// Active tenant slug — selects which localStorage key the persisted cart
// reads/writes (`kavanow-cart-{slug}`). Set via activateCartForSlug.
let _currentSlug = "";
let _activeSlug: string | null = null;

function cartKey(slug: string) {
  return slug ? `${CART_KEY}-${slug}` : CART_KEY;
}

/**
 * Slug-scoped cart storage adapter.
 * Reads/writes to `kavanow-cart-{slug}` in localStorage.
 */
function createScopedStorage(getSlug: () => string) {
  return {
    getItem: (name: string) => {
      const slug = getSlug();
      return localStorage.getItem(slug ? `${name}-${slug}` : name);
    },
    setItem: (name: string, value: string) => {
      const slug = getSlug();
      localStorage.setItem(slug ? `${name}-${slug}` : name, value);
    },
    removeItem: (name: string) => {
      const slug = getSlug();
      localStorage.removeItem(slug ? `${name}-${slug}` : name);
    },
  };
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: {},

      addItem: (product, quantity) =>
        set((state) => {
          const existing = state.items[product.id];
          return {
            items: {
              ...state.items,
              [product.id]: {
                product,
                quantity: existing ? existing.quantity + quantity : quantity,
              },
            },
          };
        }),

      removeItem: (productId) =>
        set((state) => {
          const { [productId]: _, ...rest } = state.items;
          return { items: rest };
        }),

      updateQuantity: (productId, quantity) =>
        set((state) => {
          const item = state.items[productId];
          if (!item) return state;
          if (quantity <= 0) {
            const { [productId]: _, ...rest } = state.items;
            return { items: rest };
          }
          return {
            items: {
              ...state.items,
              [productId]: { ...item, quantity },
            },
          };
        }),

      clearCart: () => set({ items: {} }),

      totalItems: () => {
        const items = get().items;
        return Object.values(items).reduce((sum, item) => sum + item.quantity, 0);
      },

      totalPrice: () => {
        const items = get().items;
        return Object.values(items).reduce(
          (sum, item) => sum + item.product.resolvedPrice * item.quantity,
          0,
        );
      },
    }),
    {
      name: CART_KEY,
      storage: createJSONStorage(() => createScopedStorage(() => _currentSlug)),
      partialize: (state) => ({ items: state.items }),
      // Don't auto-hydrate at module load: the tenant slug isn't known yet, so
      // it would read the unscoped `kavanow-cart` key and bleed one tenant's
      // cart into another. The customer layout calls activateCartForSlug(slug)
      // instead, which loads the correct tenant-scoped cart.
      skipHydration: true,
    },
  ),
);

/**
 * Point the cart at a tenant and load that tenant's persisted items. When the
 * tenant has no stored cart the in-memory cart is reset to empty, so one
 * tenant's items never bleed into another's view. Call from the customer layout
 * whenever the URL slug changes; safe to call repeatedly (same slug is a no-op).
 */
export function activateCartForSlug(slug: string): void | Promise<void> {
  if (!slug || slug === _activeSlug) return;
  _currentSlug = slug;
  _activeSlug = slug;
  if (localStorage.getItem(cartKey(slug))) {
    return useCartStore.persist.rehydrate();
  }
  useCartStore.setState({ items: {} });
}
