import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useTenantSlug } from "@/lib/hooks/use-tenant-api";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useFilterSearch } from "@/lib/hooks/use-filter-search";
import { Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ResponsiveTable, type ResponsiveTableColumn } from "@/components/ui/responsive-table";
import { Spinner } from "@/components/spinner";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PaginationControls } from "@/components/pagination-controls";
import { useProducts, useUpdateProduct, useDeleteProduct } from "@/lib/hooks/use-products";
import { useCategories } from "@/lib/hooks/use-categories";
import { useDeleteConfirmation } from "@/lib/hooks/use-delete-confirmation";
import { UNIT_LABELS, type AdminProductsSearch, type ImportProductsResult } from "@kava-now/shared";
import { PAGE_SIZE } from "@/lib/constants";
import { formatMoney } from "@/lib/format";

type ProductRow = NonNullable<ReturnType<typeof useProducts>["data"]>["data"][number];

export function ProductsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const slug = useTenantSlug();
  const adminBase = `/k/${slug}/admin`;
  const importResult = location.state.importResult ?? null;
  const { search: urlSearch, setFilters } = useFilterSearch<AdminProductsSearch>();
  const categoryFilter = urlSearch.categoryId ?? "";
  const page = urlSearch.page ?? 1;
  // Local mirror of the search box for responsive typing; debounced into the URL.
  const [search, setSearch] = useState(urlSearch.search ?? "");
  const [bannerResult, setBannerResult] = useState<ImportProductsResult | null>(importResult);

  useEffect(() => {
    if (importResult) {
      void navigate({ to: location.pathname, replace: true, state: {} });
    }
  }, [importResult, location.pathname, navigate]);

  const debouncedSearch = useDebouncedValue(search);
  useEffect(() => {
    if (debouncedSearch !== (urlSearch.search ?? "")) {
      setFilters({ search: debouncedSearch || undefined });
    }
  }, [debouncedSearch, urlSearch.search, setFilters]);

  const { data, isLoading } = useProducts({
    search: urlSearch.search,
    categoryId: urlSearch.categoryId,
    page,
    pageSize: PAGE_SIZE,
  });
  const products = data?.data ?? [];
  const total = data?.total ?? 0;
  const { data: categories } = useCategories();
  const updateMutation = useUpdateProduct();
  const deleteMutation = useDeleteProduct();
  const del = useDeleteConfirmation(deleteMutation);

  const handleToggleActive = (id: string, currentActive: boolean) => {
    updateMutation.mutate({ id, data: { active: !currentActive } });
  };

  const confirmDelete = () =>
    del.confirm((res) =>
      toast.success(
        res.product
          ? "Το προϊόν απενεργοποιήθηκε — υπάρχει σε παραγγελίες και δεν διαγράφεται"
          : "Το προϊόν διαγράφηκε",
      ),
    );

  const columns: ResponsiveTableColumn<ProductRow>[] = [
    { header: "Όνομα", cellClassName: "font-medium", cell: (p) => p.name },
    { header: "Brand", cellClassName: "text-muted-foreground", cell: (p) => p.brand ?? "-" },
    {
      header: "Κατηγορία",
      cellClassName: "text-muted-foreground",
      cell: (p) => p.categoryName ?? "-",
    },
    {
      header: "Τιμή",
      headClassName: "text-right",
      cellClassName: "text-right",
      cell: (p) => formatMoney(p.basePrice),
    },
    {
      header: "Μονάδα",
      cellClassName: "text-muted-foreground",
      cell: (p) => UNIT_LABELS[p.unit],
    },
    {
      header: "Ενεργό",
      headClassName: "text-center",
      cellClassName: "text-center",
      cell: (p) => (
        <button
          type="button"
          onClick={() => handleToggleActive(p.id, p.active)}
          className="inline-flex"
          aria-pressed={p.active}
          title={p.active ? "Απενεργοποίηση προϊόντος" : "Ενεργοποίηση προϊόντος"}
        >
          <Badge variant={p.active ? "success" : "muted"}>{p.active ? "Ναι" : "Όχι"}</Badge>
        </button>
      ),
    },
    {
      header: "Ενέργειες",
      headClassName: "text-right",
      cellClassName: "text-right",
      cell: (p) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate({ to: `${adminBase}/products/${p.id}` })}
            aria-label="Επεξεργασία"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => del.request({ id: p.id, name: p.name })}
            aria-label="Διαγραφή"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Προϊόντα</h1>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => navigate({ to: `${adminBase}/products/import` })}
          >
            Εισαγωγή από αρχείο
          </Button>
          <Button onClick={() => navigate({ to: `${adminBase}/products/new` })}>Νέο Προϊόν</Button>
        </div>
      </div>

      {bannerResult && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
          <div>
            Η εισαγωγή ολοκληρώθηκε: <span className="font-semibold">{bannerResult.inserted}</span>{" "}
            νέα προϊόντα, <span className="font-semibold">{bannerResult.updated}</span> ενημερώθηκαν
            {bannerResult.categoriesCreated > 0 && (
              <>
                {" "}
                · <span className="font-semibold">{bannerResult.categoriesCreated}</span> νέες
                κατηγορίες
              </>
            )}
            .
          </div>
          <button
            type="button"
            onClick={() => setBannerResult(null)}
            className="shrink-0 text-green-700 hover:text-green-900"
            aria-label="Κλείσιμο"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <FilterBar
        search={
          <SearchInput
            placeholder="Αναζήτηση με όνομα ή brand..."
            value={search}
            onValueChange={setSearch}
          />
        }
        activeCount={categoryFilter ? 1 : 0}
        onClear={() => setFilters({ categoryId: undefined })}
      >
        <FilterField label="Κατηγορία">
          <Select
            value={categoryFilter || "all"}
            onValueChange={(v) => setFilters({ categoryId: v === "all" ? undefined : v })}
          >
            <SelectTrigger className="w-full md:w-56" aria-label="Κατηγορία">
              <SelectValue placeholder="Όλες οι κατηγορίες" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Όλες οι κατηγορίες</SelectItem>
              {categories?.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
      </FilterBar>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          message="Δεν βρέθηκαν προϊόντα"
          actionLabel="Νέο Προϊόν"
          onAction={() => navigate({ to: `${adminBase}/products/new` })}
        />
      ) : (
        <>
          <ResponsiveTable
            data={products}
            columns={columns}
            getRowKey={(p) => p.id}
            renderMobileItem={(product) => (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{product.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {[product.brand, product.categoryName].filter(Boolean).join(" · ") || "-"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleActive(product.id, product.active)}
                    className="inline-flex shrink-0"
                    aria-pressed={product.active}
                    title={product.active ? "Απενεργοποίηση προϊόντος" : "Ενεργοποίηση προϊόντος"}
                  >
                    <Badge variant={product.active ? "success" : "muted"}>
                      {product.active ? "Ενεργό" : "Ανενεργό"}
                    </Badge>
                  </button>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm">
                    {formatMoney(product.basePrice)}{" "}
                    <span className="text-muted-foreground">/ {UNIT_LABELS[product.unit]}</span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => navigate({ to: `${adminBase}/products/${product.id}` })}
                      aria-label="Επεξεργασία"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => del.request({ id: product.id, name: product.name })}
                      aria-label="Διαγραφή"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          />
          <PaginationControls
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={(p) => setFilters({ page: p })}
          />
        </>
      )}

      <ConfirmDialog
        {...del.dialogProps}
        title="Διαγραφή προϊόντος"
        description={
          <>
            Είστε σίγουροι ότι θέλετε να διαγράψετε το{" "}
            <span className="font-medium text-foreground">{del.target?.name}</span>; Αν
            χρησιμοποιείται σε παραγγελίες θα απενεργοποιηθεί αντί να διαγραφεί.
          </>
        }
        confirmLabel="Διαγραφή"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
