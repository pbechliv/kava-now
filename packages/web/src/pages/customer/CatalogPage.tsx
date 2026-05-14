import { useState, useMemo } from "react";
import { useCatalog } from "../../lib/hooks/use-catalog";
import { useCartStore, setCartSlug } from "../../lib/store/cart";
import { useAuth } from "../../lib/hooks/use-auth";
import { UNIT_LABELS } from "@kava-now/shared";
import type { CatalogProduct } from "../../lib/store/cart";

export function CatalogPage() {
  const { kava } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // Set cart slug for localStorage scoping
  if (kava?.slug) {
    setCartSlug(kava.slug);
  }

  const addItem = useCartStore((s) => s.addItem);

  const { data: products, isLoading } = useCatalog({
    categoryId: selectedCategory || undefined,
    search: debouncedSearch || undefined,
  });

  // Extract unique categories from products
  const categories = useMemo(() => {
    if (!products) return [];
    const map = new Map<string, string>();
    for (const p of products) {
      if (p.categoryId && p.categoryName) {
        map.set(p.categoryId, p.categoryName);
      }
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name, "el"),
    );
  }, [products]);

  // Debounce search
  const handleSearchChange = (value: string) => {
    setSearch(value);
    clearTimeout(
      (window as unknown as Record<string, ReturnType<typeof setTimeout>>).__catalogSearchTimer,
    );
    (window as unknown as Record<string, ReturnType<typeof setTimeout>>).__catalogSearchTimer =
      setTimeout(() => {
        setDebouncedSearch(value);
      }, 300);
  };

  const getQty = (productId: string) => quantities[productId] ?? 1;

  const setQty = (productId: string, qty: number) => {
    setQuantities((prev) => ({ ...prev, [productId]: Math.max(1, qty) }));
  };

  const handleAdd = (product: CatalogProduct) => {
    addItem(product, getQty(product.id));
    setQuantities((prev) => ({ ...prev, [product.id]: 1 }));
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Κατάλογος</h1>

      {/* Search + Filters */}
      <div className="mt-4 flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Αναζήτηση προϊόντων..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      </div>

      {/* Category tabs */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelectedCategory("")}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
            selectedCategory === ""
              ? "bg-amber-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          Όλα
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setSelectedCategory(selectedCategory === cat.id ? "" : cat.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              selectedCategory === cat.id
                ? "bg-amber-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Product grid */}
      {isLoading ? (
        <div className="mt-8 text-center text-sm text-gray-500">Φόρτωση...</div>
      ) : !products || products.length === 0 ? (
        <div className="mt-8 text-center text-sm text-gray-500">Δεν βρέθηκαν προϊόντα.</div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <div
              key={product.id}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              {/* Image placeholder */}
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="mb-3 h-32 w-full rounded-md object-cover"
                />
              ) : (
                <div className="mb-3 flex h-32 w-full items-center justify-center rounded-md bg-gray-100 text-gray-400">
                  <svg
                    className="h-10 w-10"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z"
                    />
                  </svg>
                </div>
              )}

              <div className="mb-1 text-xs text-gray-500">
                {product.categoryName || "Χωρίς κατηγορία"}
              </div>
              <h3 className="font-semibold text-gray-900">{product.name}</h3>
              {product.brand && <p className="text-sm text-gray-500">{product.brand}</p>}

              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-lg font-bold text-amber-600">
                  {product.resolvedPrice.toFixed(2)}&euro;
                </span>
                <span className="text-xs text-gray-500">/ {UNIT_LABELS[product.unit]}</span>
              </div>

              {/* Quantity + Add */}
              <div className="mt-3 flex items-center gap-2">
                <div className="flex items-center rounded-md border border-gray-300">
                  <button
                    type="button"
                    onClick={() => setQty(product.id, getQty(product.id) - 1)}
                    className="px-2 py-1 text-gray-600 hover:bg-gray-100"
                  >
                    -
                  </button>
                  <span className="w-8 text-center text-sm">{getQty(product.id)}</span>
                  <button
                    type="button"
                    onClick={() => setQty(product.id, getQty(product.id) + 1)}
                    className="px-2 py-1 text-gray-600 hover:bg-gray-100"
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleAdd(product)}
                  className="flex-1 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
                >
                  Προσθήκη
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
