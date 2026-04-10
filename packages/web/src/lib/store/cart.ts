import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ProductUnit } from "@kava-now/shared";

export interface CatalogProduct {
  id: string;
  name: string;
  brand: string | null;
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
  _slug: string;
  addItem: (product: CatalogProduct, quantity: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: () => number;
  totalPrice: () => number;
}

/**
 * Slug-scoped cart storage adapter.
 * Reads/writes to `kavanow-cart-{slug}` in localStorage.
 */
function createScopedStorage(getSlug: () => string) {
  return {
    getItem: (name: string) => {
      const slug = getSlug();
      const key = slug ? `${name}-${slug}` : name;
      const value = localStorage.getItem(key);
      return value ?? null;
    },
    setItem: (name: string, value: string) => {
      const slug = getSlug();
      const key = slug ? `${name}-${slug}` : name;
      localStorage.setItem(key, value);
    },
    removeItem: (name: string) => {
      const slug = getSlug();
      const key = slug ? `${name}-${slug}` : name;
      localStorage.removeItem(key);
    },
  };
}

let _currentSlug = "";

export function setCartSlug(slug: string) {
  _currentSlug = slug;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: {},
      _slug: "",

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
      name: "kavanow-cart",
      storage: createJSONStorage(() =>
        createScopedStorage(() => _currentSlug),
      ),
      partialize: (state) => ({ items: state.items }),
    },
  ),
);
