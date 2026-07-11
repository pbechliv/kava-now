import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/search-input";
import { Chip } from "@/components/ui/chip";
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
import { ErrorBanner } from "@/components/error-banner";
import { PaginationControls } from "@/components/pagination-controls";
import {
  CustomerPickerCombobox,
  type CustomerPickerValue,
} from "@/components/admin/customer-picker-combobox";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useAdminCatalog, useAdminCatalogCategories } from "@/lib/hooks/use-admin-catalog";
import { useAdminCreateOrder } from "@/lib/hooks/use-admin-orders";
import { useTenantSlug } from "@/lib/hooks/use-tenant-api";
import { ApiError } from "@/lib/api";
import {
  API_ERROR_CODES,
  MAX_ORDER_QUANTITY,
  UNIT_LABELS,
  type CatalogProduct,
} from "@kava-now/shared";
import { PAGE_SIZE } from "@/lib/constants";
import { formatMoney } from "@/lib/format";

interface OrderLine {
  product: CatalogProduct;
  quantity: number;
}

export function NewOrderPage() {
  const navigate = useNavigate();
  const slug = useTenantSlug();

  const [customer, setCustomer] = useState<CustomerPickerValue | null>(null);
  const [lines, setLines] = useState<Record<string, OrderLine>>({});
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [poReference, setPoReference] = useState("");

  const debouncedSearch = useDebouncedValue(search);
  const createOrder = useAdminCreateOrder();

  const todayIso = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const { data, isLoading, error } = useAdminCatalog(customer?.id, {
    search: debouncedSearch || undefined,
    categoryId: category || undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  const products = data?.data ?? [];
  const total = data?.total ?? 0;

  const { data: categories = [] } = useAdminCatalogCategories();

  const lineList = Object.values(lines);
  const orderTotal = lineList.reduce((sum, l) => sum + l.product.resolvedPrice * l.quantity, 0);

  // Switching customer invalidates the per-customer prices already in the
  // builder, so clear the lines rather than carry stale prices into a new order.
  const handleCustomerChange = (next: CustomerPickerValue | null) => {
    setCustomer(next);
    if (next?.id !== customer?.id) {
      setLines({});
      setPage(1);
    }
  };

  const getQty = (id: string) => quantities[id] ?? 1;
  const setQty = (id: string, qty: number) =>
    setQuantities((prev) => ({ ...prev, [id]: Math.min(MAX_ORDER_QUANTITY, Math.max(1, qty)) }));

  const addLine = (product: CatalogProduct) => {
    const qty = getQty(product.id);
    setLines((prev) => {
      const existing = prev[product.id];
      const nextQty = Math.min(MAX_ORDER_QUANTITY, (existing?.quantity ?? 0) + qty);
      return { ...prev, [product.id]: { product, quantity: nextQty } };
    });
    setQuantities((prev) => ({ ...prev, [product.id]: 1 }));
    toast.success(`${qty} × ${product.name} προστέθηκε`);
  };

  const setLineQty = (id: string, qty: number) =>
    setLines((prev) => {
      const line = prev[id];
      if (!line) return prev;
      return {
        ...prev,
        [id]: { ...line, quantity: Math.min(MAX_ORDER_QUANTITY, Math.max(1, qty)) },
      };
    });

  const removeLine = (id: string) =>
    setLines((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

  const handleSubmit = () => {
    if (!customer || lineList.length === 0) return;
    createOrder.mutate(
      {
        customerId: customer.id,
        items: lineList.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        notes: notes.trim() || undefined,
        requestedDeliveryDate: deliveryDate || undefined,
        poReference: poReference.trim() || undefined,
      },
      {
        onSuccess: (res) => {
          toast.success(`Η παραγγελία #${res.order.orderNumber} καταχωρήθηκε`);
          void navigate({
            to: "/k/$slug/admin/orders/$id",
            params: { slug, id: res.order.id },
          });
        },
        onError: (err) => {
          if (err instanceof ApiError && err.code === API_ERROR_CODES.PRODUCT_NOT_AVAILABLE) {
            toast.error(
              "Κάποια προϊόντα δεν είναι πλέον διαθέσιμα. Αφαιρέστε τα και δοκιμάστε ξανά.",
            );
          }
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <Link
        to="/k/$slug/admin/orders"
        params={{ slug }}
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Πίσω στις παραγγελίες
      </Link>

      <h1 className="text-2xl font-bold tracking-tight">Νέα παραγγελία</h1>

      <Card className="space-y-2 p-4">
        <Label>Πελάτης</Label>
        <div className="max-w-md">
          <CustomerPickerCombobox selected={customer} onSelect={handleCustomerChange} />
        </div>
        <p className="text-sm text-muted-foreground">
          Επιλέξτε πελάτη για να δείτε τις τιμές του και να προσθέσετε προϊόντα.
        </p>
      </Card>

      {!customer ? (
        <EmptyState message="Επιλέξτε πελάτη για να ξεκινήσετε" />
      ) : (
        <>
          <div className="space-y-4">
            <SearchInput
              placeholder="Αναζήτηση προϊόντων..."
              value={search}
              onValueChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
            />
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] md:flex-wrap md:overflow-visible md:pb-0 [&::-webkit-scrollbar]:hidden">
              <Chip
                active={category === ""}
                onClick={() => {
                  setCategory("");
                  setPage(1);
                }}
              >
                Όλα
              </Chip>
              {categories.map((cat) => (
                <Chip
                  key={cat.id}
                  active={category === cat.id}
                  onClick={() => {
                    setCategory(category === cat.id ? "" : cat.id);
                    setPage(1);
                  }}
                >
                  {cat.name}
                </Chip>
              ))}
            </div>

            {isLoading ? (
              <div className="flex justify-center py-12">
                <Spinner />
              </div>
            ) : error ? (
              <ErrorBanner message={error.message} />
            ) : products.length === 0 ? (
              <EmptyState message="Δεν βρέθηκαν προϊόντα" />
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
                                  <span className="w-10 text-center text-sm">
                                    {getQty(product.id)}
                                  </span>
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
                                <Button type="button" onClick={() => addLine(product)}>
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
                              {[product.brand, product.categoryName].filter(Boolean).join(" · ") ||
                                "-"}
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
                          <Button type="button" className="flex-1" onClick={() => addLine(product)}>
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
                  onPageChange={setPage}
                />
              </>
            )}
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Προϊόντα παραγγελίας</h2>
            {lineList.length === 0 ? (
              <EmptyState message="Δεν έχουν προστεθεί προϊόντα" />
            ) : (
              <Card className="overflow-hidden">
                <div className="hidden overflow-x-auto md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Προϊόν</TableHead>
                        <TableHead className="text-center">Τιμή</TableHead>
                        <TableHead className="text-center">Ποσότητα</TableHead>
                        <TableHead className="text-right">Σύνολο</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lineList.map(({ product, quantity }) => (
                        <TableRow key={product.id}>
                          <TableCell>
                            <div className="font-medium">{product.name}</div>
                            {product.brand && (
                              <div className="text-xs text-muted-foreground">{product.brand}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground">
                            {formatMoney(product.resolvedPrice)}
                            <span className="text-xs text-muted-foreground/70">
                              /{UNIT_LABELS[product.unit]}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setLineQty(product.id, quantity - 1)}
                                aria-label="Μείωση"
                              >
                                -
                              </Button>
                              <Input
                                type="number"
                                min={1}
                                max={MAX_ORDER_QUANTITY}
                                value={quantity}
                                onChange={(e) =>
                                  setLineQty(product.id, Math.round(Number(e.target.value)) || 1)
                                }
                                className="h-8 w-14 text-center"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setLineQty(product.id, quantity + 1)}
                                aria-label="Αύξηση"
                              >
                                +
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatMoney(product.resolvedPrice * quantity)}
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost-destructive"
                              size="icon"
                              onClick={() => removeLine(product.id)}
                              aria-label="Αφαίρεση"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <MobileList>
                  {lineList.map(({ product, quantity }) => (
                    <MobileListItem key={product.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium">{product.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {product.brand ? `${product.brand} · ` : ""}
                            {formatMoney(product.resolvedPrice)}
                            <span className="text-xs text-muted-foreground/70">
                              /{UNIT_LABELS[product.unit]}
                            </span>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost-destructive"
                          size="icon"
                          className="shrink-0"
                          onClick={() => removeLine(product.id)}
                          aria-label="Αφαίρεση"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setLineQty(product.id, quantity - 1)}
                            aria-label="Μείωση"
                          >
                            -
                          </Button>
                          <Input
                            type="number"
                            min={1}
                            max={MAX_ORDER_QUANTITY}
                            value={quantity}
                            onChange={(e) =>
                              setLineQty(product.id, Math.round(Number(e.target.value)) || 1)
                            }
                            className="h-8 w-14 text-center"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setLineQty(product.id, quantity + 1)}
                            aria-label="Αύξηση"
                          >
                            +
                          </Button>
                        </div>
                        <div className="font-medium">
                          {formatMoney(product.resolvedPrice * quantity)}
                        </div>
                      </div>
                    </MobileListItem>
                  ))}
                </MobileList>
              </Card>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="delivery-date">Επιθυμητή ημ. παράδοσης</Label>
              <Input
                id="delivery-date"
                type="date"
                value={deliveryDate}
                min={todayIso}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="po-reference">Αρ. παραγγελίας (PO)</Label>
              <Input
                id="po-reference"
                type="text"
                maxLength={100}
                value={poReference}
                onChange={(e) => setPoReference(e.target.value)}
                placeholder="Προαιρετικός κωδικός παραγγελίας πελάτη"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="order-notes">Σχόλιο παραγγελίας</Label>
            <Textarea
              id="order-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Προαιρετικό σχόλιο..."
            />
          </div>

          <Card className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="text-sm text-muted-foreground">Σύνολο: </span>
                <span className="text-xl font-bold">{formatMoney(orderTotal)}</span>
              </div>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={createOrder.isPending || lineList.length === 0}
                className="sm:min-w-48"
              >
                {createOrder.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {createOrder.isPending ? "Καταχώρηση..." : "Καταχώρηση παραγγελίας"}
              </Button>
            </div>
            {createOrder.isError && (
              <p className="mt-3 text-sm text-destructive">
                {createOrder.error?.message || "Σφάλμα κατά την καταχώρηση"}
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
