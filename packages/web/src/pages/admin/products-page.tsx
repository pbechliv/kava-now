import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { useTenantSlug } from "@/lib/hooks/use-tenant-api";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MobileList, MobileListItem } from "@/components/ui/mobile-list";
import { Spinner } from "@/components/spinner";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PaginationControls } from "@/components/pagination-controls";
import { useProducts, useUpdateProduct, useDeleteProduct } from "@/lib/hooks/use-products";
import { useCategories } from "@/lib/hooks/use-categories";
import { UNIT_LABELS, type ImportProductsResult } from "@kava-now/shared";
import { PAGE_SIZE } from "@/lib/constants";
import { formatMoney } from "@/lib/format";

interface ProductsPageLocationState {
  importResult?: ImportProductsResult;
}

export function ProductsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const slug = useTenantSlug();
  const adminBase = `/k/${slug}/admin`;
  const importResult = (location.state as ProductsPageLocationState | null)?.importResult ?? null;
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [bannerResult, setBannerResult] = useState<ImportProductsResult | null>(importResult);
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (importResult) {
      void navigate(location.pathname, { replace: true, state: null });
    }
  }, [importResult, location.pathname, navigate]);

  const debouncedSearch = useDebouncedValue(search);

  const { data, isLoading } = useProducts({
    search: debouncedSearch || undefined,
    categoryId: categoryFilter || undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  const products = data?.data ?? [];
  const total = data?.total ?? 0;
  const { data: categories } = useCategories();
  const updateMutation = useUpdateProduct();
  const deleteMutation = useDeleteProduct();

  const handleToggleActive = (id: string, currentActive: boolean) => {
    updateMutation.mutate({ id, data: { active: !currentActive } });
  };

  const handleDelete = (id: string, name: string) => {
    deleteMutation.reset();
    setDeleteTarget({ id, name });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: (res) => {
        setDeleteTarget(null);
        toast.success(
          res.product
            ? "Το προϊόν απενεργοποιήθηκε — υπάρχει σε παραγγελίες και δεν διαγράφεται"
            : "Το προϊόν διαγράφηκε",
        );
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Προϊόντα</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate(`${adminBase}/products/import`)}>
            Εισαγωγή από αρχείο
          </Button>
          <Button onClick={() => navigate(`${adminBase}/products/new`)}>Νέο Προϊόν</Button>
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
            onValueChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
          />
        }
        activeCount={categoryFilter ? 1 : 0}
        onClear={() => {
          setCategoryFilter("");
          setPage(1);
        }}
      >
        <FilterField label="Κατηγορία">
          <Select
            value={categoryFilter || "all"}
            onValueChange={(v) => {
              setCategoryFilter(v === "all" ? "" : v);
              setPage(1);
            }}
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
          onAction={() => navigate(`${adminBase}/products/new`)}
        />
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Όνομα</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Κατηγορία</TableHead>
                    <TableHead className="text-right">Τιμή</TableHead>
                    <TableHead>Μονάδα</TableHead>
                    <TableHead className="text-center">Ενεργό</TableHead>
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
                      <TableCell className="text-right">{formatMoney(product.basePrice)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {UNIT_LABELS[product.unit]}
                      </TableCell>
                      <TableCell className="text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(product.id, product.active)}
                          className="inline-flex"
                          aria-pressed={product.active}
                          title={
                            product.active ? "Απενεργοποίηση προϊόντος" : "Ενεργοποίηση προϊόντος"
                          }
                        >
                          <Badge variant={product.active ? "success" : "muted"}>
                            {product.active ? "Ναι" : "Όχι"}
                          </Badge>
                        </button>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate(`${adminBase}/products/${product.id}`)}
                            aria-label="Επεξεργασία"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => handleDelete(product.id, product.name)}
                            aria-label="Διαγραφή"
                          >
                            <Trash2 className="h-4 w-4" />
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
                        onClick={() => navigate(`${adminBase}/products/${product.id}`)}
                        aria-label="Επεξεργασία"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleDelete(product.id, product.name)}
                        aria-label="Διαγραφή"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </MobileListItem>
              ))}
            </MobileList>
          </Card>
          <PaginationControls
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        </>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Διαγραφή προϊόντος"
        description={
          <>
            Είστε σίγουροι ότι θέλετε να διαγράψετε το{" "}
            <span className="font-medium text-foreground">{deleteTarget?.name}</span>; Αν
            χρησιμοποιείται σε παραγγελίες θα απενεργοποιηθεί αντί να διαγραφεί.
          </>
        }
        confirmLabel="Διαγραφή"
        pending={deleteMutation.isPending}
        error={deleteMutation.error?.message}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
