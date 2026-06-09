import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { PaginationControls } from "@/components/PaginationControls";
import { useCatalog, useCatalogCategories } from "@/lib/hooks/use-catalog";
import { useCartStore } from "@/lib/store/cart";
import { UNIT_LABELS } from "@kava-now/shared";
import type { CatalogProduct } from "@/lib/store/cart";

const PAGE_SIZE = 50;

export function CatalogPage() {
  const [selectedCategory, setSelectedCategoryState] = useState<string>("");
  const [search, setSearch] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);

  const addItem = useCartStore((s) => s.addItem);
  const debouncedSearch = useDebouncedValue(search);

  const setSelectedCategory = (id: string) => {
    setSelectedCategoryState(id);
    setPage(1);
  };

  const { data, isLoading } = useCatalog({
    categoryId: selectedCategory || undefined,
    search: debouncedSearch || undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  const products = data?.data ?? [];
  const total = data?.total ?? 0;

  // Chips come from a dedicated endpoint — deriving them from the current
  // page of results made chips vanish under filters/search (#58).
  const { data: categories = [] } = useCatalogCategories();

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
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
      ) : products.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground">Δεν βρέθηκαν προϊόντα.</div>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Όνομα</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Κατηγορία</TableHead>
                    <TableHead>Μονάδα</TableHead>
                    <TableHead className="text-right">Τιμή</TableHead>
                    <TableHead className="text-right">Ενέργειες</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {product.brand ?? "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {product.categoryName ?? "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {UNIT_LABELS[product.unit]}
                      </TableCell>
                      <TableCell className="text-right">
                        {product.resolvedPrice.toFixed(2)}&nbsp;€
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
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
                          <Button type="button" onClick={() => handleAdd(product)}>
                            Προσθήκη
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
          <PaginationControls
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        </>
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
