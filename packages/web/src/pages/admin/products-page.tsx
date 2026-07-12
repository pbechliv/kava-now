import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useTenantSlug } from "@/lib/hooks/use-tenant-api";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useFilterSearch } from "@/lib/hooks/use-filter-search";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { Alert } from "@/components/ui/alert";
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
import {
  CategoryPickerCombobox,
  type CategoryPickerValue,
} from "@/components/admin/category-picker-combobox";
import { useProducts, useUpdateProduct, useDeleteProduct } from "@/lib/hooks/use-products";
import { useCategory } from "@/lib/hooks/use-categories";
import { useDeleteConfirmation } from "@/lib/hooks/use-delete-confirmation";
import { ProductFormModal } from "@/components/admin/product-form-modal";
import {
  UNIT_LABELS,
  type AdminProductsSearch,
  type ImportProductsResult,
  type ProductActiveFilter,
} from "@kava-now/shared";
import { PAGE_SIZE } from "@/lib/constants";
import { formatMoney } from "@/lib/format";

type ProductRow = NonNullable<ReturnType<typeof useProducts>["data"]>["data"][number];

// Base UI's <Select.Value> needs this value→label map to render the selected
// label in the trigger; without `items` it falls back to the raw value.
const ACTIVE_FILTER_ITEMS: { value: ProductActiveFilter; label: string }[] = [
  { value: "active", label: "Ενεργά" },
  { value: "inactive", label: "Ανενεργά" },
  { value: "all", label: "Όλα" },
];

export function ProductsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const slug = useTenantSlug();
  const adminBase = `/k/${slug}/admin`;
  const importResult = location.state.importResult ?? null;
  const { search: urlSearch, setFilters } = useFilterSearch<AdminProductsSearch>();
  const categoryFilter = urlSearch.categoryId ?? "";
  // Absent = the default "active only" view (#170).
  const activeFilter: ProductActiveFilter = urlSearch.active ?? "active";
  const page = urlSearch.page ?? 1;
  // Local mirror of the search box for responsive typing; debounced into the URL.
  const [search, setSearch] = useState(urlSearch.search ?? "");
  // Only `categoryId` lives in the URL; the picker needs the name for its label.
  // Keep it locally, and after a reload fetch the category by id so the combobox
  // shows what the list is filtered by instead of the placeholder.
  const [categoryDisplay, setCategoryDisplay] = useState<CategoryPickerValue | null>(null);
  const { data: urlCategory } = useCategory(categoryDisplay ? undefined : urlSearch.categoryId);
  const selectedCategory =
    categoryDisplay ??
    (urlSearch.categoryId && urlCategory ? { id: urlCategory.id, name: urlCategory.name } : null);
  const [bannerResult, setBannerResult] = useState<ImportProductsResult | null>(importResult);
  const [modalOpen, setModalOpen] = useState(false);
  const [editProductId, setEditProductId] = useState<string | undefined>(undefined);

  const handleCreate = () => {
    setEditProductId(undefined);
    setModalOpen(true);
  };

  const handleEdit = (id: string) => {
    setEditProductId(id);
    setModalOpen(true);
  };

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
    active: urlSearch.active,
    page,
    pageSize: PAGE_SIZE,
  });
  const products = data?.data ?? [];
  const total = data?.total ?? 0;
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
      header: "ERP",
      cellClassName: "text-muted-foreground font-mono text-xs",
      cell: (p) => p.erpRef ?? "-",
    },
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
            onClick={() => handleEdit(p.id)}
            aria-label="Επεξεργασία"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost-destructive"
            size="icon"
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
          <Button onClick={handleCreate}>Νέο Προϊόν</Button>
        </div>
      </div>

      {bannerResult && (
        <Alert variant="success" onDismiss={() => setBannerResult(null)}>
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
            {bannerResult.duplicatesInFile > 0 && (
              <>
                {" "}
                · <span className="font-semibold">{bannerResult.duplicatesInFile}</span> διπλές
                γραμμές συγχωνεύθηκαν
              </>
            )}
            .
          </div>
        </Alert>
      )}

      <FilterBar
        search={
          <SearchInput
            placeholder="Αναζήτηση με όνομα, brand ή ERP..."
            value={search}
            onValueChange={setSearch}
          />
        }
        activeCount={(categoryFilter ? 1 : 0) + (activeFilter !== "active" ? 1 : 0)}
        onClear={() => setFilters({ categoryId: undefined, active: undefined })}
      >
        <FilterField label="Κατάσταση" className="md:w-44">
          <Select
            items={ACTIVE_FILTER_ITEMS}
            value={activeFilter}
            onValueChange={(v) =>
              setFilters({ active: v === "active" ? undefined : (v as ProductActiveFilter) })
            }
          >
            <SelectTrigger className="w-full" aria-label="Κατάσταση">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTIVE_FILTER_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Κατηγορία" className="md:w-56">
          <CategoryPickerCombobox
            aria-label="Κατηγορία"
            placeholder="Όλες οι κατηγορίες"
            selected={selectedCategory}
            onSelect={(cat) => {
              setCategoryDisplay(cat);
              setFilters({ categoryId: cat?.id });
            }}
          />
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
          onAction={handleCreate}
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
                    {product.erpRef && (
                      <div className="font-mono text-xs text-muted-foreground">
                        ERP: {product.erpRef}
                      </div>
                    )}
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
                      onClick={() => handleEdit(product.id)}
                      aria-label="Επεξεργασία"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost-destructive"
                      size="icon"
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

      <ProductFormModal
        open={modalOpen}
        productId={editProductId}
        onClose={() => {
          setModalOpen(false);
          setEditProductId(undefined);
        }}
      />
    </div>
  );
}
