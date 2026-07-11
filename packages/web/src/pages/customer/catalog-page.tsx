import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MobileList, MobileListItem } from "@/components/ui/mobile-list";
import { Chip } from "@/components/ui/chip";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useFilterSearch } from "@/lib/hooks/use-filter-search";
import { ErrorBanner } from "@/components/error-banner";
import { Spinner } from "@/components/spinner";
import { PaginationControls } from "@/components/pagination-controls";
import { EmptyState } from "@/components/empty-state";
import { useCatalog, useCatalogCategories } from "@/lib/hooks/use-catalog";
import { useCartStore } from "@/lib/store/cart";
import { MAX_ORDER_QUANTITY, UNIT_LABELS, type CatalogSearch } from "@kava-now/shared";
import type { CatalogProduct } from "@/lib/store/cart";
import { PAGE_SIZE } from "@/lib/constants";
import { formatMoney } from "@/lib/format";

export function CatalogPage() {
  const { search: urlSearch, setFilters } = useFilterSearch<CatalogSearch>();
  const selectedCategory = urlSearch.categoryId ?? "";
  const page = urlSearch.page ?? 1;
  const [search, setSearch] = useState(urlSearch.search ?? "");
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const addItem = useCartStore((s) => s.addItem);
  const debouncedSearch = useDebouncedValue(search);
  useEffect(() => {
    if (debouncedSearch !== (urlSearch.search ?? "")) {
      setFilters({ search: debouncedSearch || undefined });
    }
  }, [debouncedSearch, urlSearch.search, setFilters]);

  const setSelectedCategory = (id: string) => setFilters({ categoryId: id || undefined });

  const { data, isLoading, error } = useCatalog({
    categoryId: urlSearch.categoryId,
    search: urlSearch.search,
    page,
    pageSize: PAGE_SIZE,
  });
  const products = data?.data ?? [];
  const total = data?.total ?? 0;

  // Chips come from a dedicated endpoint — deriving them from the current
  // page of results made chips vanish under filters/search (#58).
  const { data: categories = [], error: categoriesError } = useCatalogCategories();

  const handleSearchChange = (value: string) => setSearch(value);

  const getQty = (productId: string) => quantities[productId] ?? 1;

  const setQty = (productId: string, qty: number) => {
    setQuantities((prev) => ({
      ...prev,
      [productId]: Math.min(MAX_ORDER_QUANTITY, Math.max(1, qty)),
    }));
  };

  const hasActiveFilters = !!(urlSearch.search || urlSearch.categoryId);
  const clearFilters = () => {
    setSearch("");
    setFilters({ search: undefined, categoryId: undefined });
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

      <SearchInput
        placeholder="Αναζήτηση προϊόντων..."
        value={search}
        onValueChange={handleSearchChange}
      />

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] md:flex-wrap md:overflow-visible md:pb-0 [&::-webkit-scrollbar]:hidden">
        <Chip active={selectedCategory === ""} onClick={() => setSelectedCategory("")}>
          Όλα
        </Chip>
        {categories.map((cat) => (
          <Chip
            key={cat.id}
            active={selectedCategory === cat.id}
            onClick={() => setSelectedCategory(selectedCategory === cat.id ? "" : cat.id)}
          >
            {cat.name}
          </Chip>
        ))}
      </div>
      {categoriesError && <p className="text-sm text-destructive">Σφάλμα φόρτωσης κατηγοριών</p>}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : error ? (
        <ErrorBanner message={error.message} />
      ) : products.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState
            message="Δεν βρέθηκαν προϊόντα"
            description="Δοκιμάστε διαφορετική αναζήτηση ή κατηγορία."
            actionLabel="Καθαρισμός αναζήτησης και φίλτρων"
            onAction={clearFilters}
          />
        ) : (
          <EmptyState message="Δεν υπάρχουν προϊόντα στον κατάλογο" />
        )
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Όνομα</TableHead>
                    <TableHead>Μάρκα</TableHead>
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
                        {formatMoney(product.resolvedPrice)}
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
            <MobileList>
              {products.map((product) => (
                <MobileListItem key={product.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium">{product.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {[product.brand, product.categoryName].filter(Boolean).join(" · ") || "-"}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-medium">{formatMoney(product.resolvedPrice)}</div>
                      <div className="text-xs text-muted-foreground">
                        /{UNIT_LABELS[product.unit]}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
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
                </MobileListItem>
              ))}
            </MobileList>
          </Card>
          <PaginationControls
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={(p) => setFilters({ page: p })}
          />
        </>
      )}
    </div>
  );
}
