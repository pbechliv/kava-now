import { useState, useMemo } from "react";
import { ImageIcon, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useCatalog } from "@/lib/hooks/use-catalog";
import { useCartStore, setCartSlug } from "@/lib/store/cart";
import { useAuth } from "@/lib/hooks/use-auth";
import { UNIT_LABELS } from "@kava-now/shared";
import type { CatalogProduct } from "@/lib/store/cart";

export function CatalogPage() {
  const { kava } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  if (kava?.slug) {
    setCartSlug(kava.slug);
  }

  const addItem = useCartStore((s) => s.addItem);

  const { data: products, isLoading } = useCatalog({
    categoryId: selectedCategory || undefined,
    search: debouncedSearch || undefined,
  });

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
    const qty = getQty(product.id);
    addItem(product, qty);
    setQuantities((prev) => ({ ...prev, [product.id]: 1 }));
    toast.success(`${qty} × ${product.name} προστέθηκε στο καλάθι`);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Κατάλογος</h1>

      <Input
        type="text"
        placeholder="Αναζήτηση προϊόντων..."
        value={search}
        onChange={(e) => handleSearchChange(e.target.value)}
      />

      <div className="flex flex-wrap gap-2">
        <CategoryChip
          label="Όλα"
          active={selectedCategory === ""}
          onClick={() => setSelectedCategory("")}
        />
        {categories.map((cat) => (
          <CategoryChip
            key={cat.id}
            label={cat.name}
            active={selectedCategory === cat.id}
            onClick={() => setSelectedCategory(selectedCategory === cat.id ? "" : cat.id)}
          />
        ))}
      </div>

      {isLoading ? (
        <div className="text-center text-sm text-muted-foreground">Φόρτωση...</div>
      ) : !products || products.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground">Δεν βρέθηκαν προϊόντα.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <Card key={product.id}>
              <CardContent className="p-4">
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="mb-3 aspect-video w-full rounded-md object-cover"
                  />
                ) : (
                  <div className="mb-3 flex aspect-video w-full items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <ImageIcon className="h-10 w-10" />
                  </div>
                )}

                <Badge variant="muted" className="mb-2">
                  {product.categoryName || "Χωρίς κατηγορία"}
                </Badge>
                <h3 className="font-semibold">{product.name}</h3>
                {product.brand && <p className="text-sm text-muted-foreground">{product.brand}</p>}

                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-lg font-bold text-primary">
                    {product.resolvedPrice.toFixed(2)}&nbsp;€
                  </span>
                  <span className="text-xs text-muted-foreground">
                    / {UNIT_LABELS[product.unit]}
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <div className="flex items-center rounded-md border">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-r-none"
                      onClick={() => setQty(product.id, getQty(product.id) - 1)}
                      aria-label="Μείωση"
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-10 text-center text-sm">{getQty(product.id)}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-l-none"
                      onClick={() => setQty(product.id, getQty(product.id) + 1)}
                      aria-label="Αύξηση"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button type="button" className="flex-1" onClick={() => handleAdd(product)}>
                    Προσθήκη
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/80",
      )}
    >
      {label}
    </button>
  );
}
