import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useTenantSlug } from "@/lib/hooks/use-tenant-api";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MobileList, MobileListItem } from "@/components/ui/mobile-list";
import { EmptyState } from "@/components/empty-state";
import { useCartStore, type CartItem } from "@/lib/store/cart";
import { useResolveCartPrices } from "@/lib/hooks/use-catalog";
import { useCreateOrder } from "@/lib/hooks/use-customer-orders";
import { ApiError } from "@/lib/api";
import { API_ERROR_CODES, UNIT_LABELS } from "@kava-now/shared";
import { formatMoney } from "@/lib/format";

export function CartPage() {
  const navigate = useNavigate();
  const slug = useTenantSlug();
  const base = `/k/${slug}`;
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);

  const items = useCartStore((s) => s.items);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);

  const createOrder = useCreateOrder();

  const cartItems = Object.values(items);

  // Reconcile the cart's persisted (possibly stale) prices against server truth
  // before checkout: prices change and products get deactivated after items are
  // added. Keyed by product ids, so quantity edits don't refetch.
  const productIds = cartItems.map((i) => i.product.id);
  const {
    data: resolutions,
    isFetching: resolving,
    refetch: refetchPrices,
  } = useResolveCartPrices(productIds);
  const resMap = useMemo(() => new Map((resolutions ?? []).map((r) => [r.id, r])), [resolutions]);

  const lineInfo = (item: CartItem) => {
    const res = resMap.get(item.product.id);
    const unavailable = res?.available === false;
    const currentPrice =
      res?.available && res.resolvedPrice != null ? res.resolvedPrice : item.product.resolvedPrice;
    const priceChanged =
      !!res &&
      res.available &&
      res.resolvedPrice != null &&
      res.resolvedPrice !== item.product.resolvedPrice;
    return { unavailable, currentPrice, priceChanged };
  };

  const hasUnavailable = cartItems.some((i) => resMap.get(i.product.id)?.available === false);
  const hasPriceChange = cartItems.some((i) => lineInfo(i).priceChanged);
  // Total from server-resolved prices, skipping unavailable lines — what the
  // server will actually charge, not the stale snapshot.
  const reconciledTotal = cartItems.reduce((sum, item) => {
    const { unavailable, currentPrice } = lineInfo(item);
    return unavailable ? sum : sum + currentPrice * item.quantity;
  }, 0);

  const handleSubmit = () => {
    if (hasUnavailable) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }

    createOrder.mutate(
      {
        items: cartItems.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
        })),
        notes: notes || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Η παραγγελία καταχωρήθηκε");
          void navigate({ to: `${base}/orders` });
        },
        onError: (err) => {
          setConfirming(false);
          // A product went unavailable between price-resolve and submit — re-resolve
          // so the offending line gets flagged and checkout is blocked.
          if (err instanceof ApiError && err.code === API_ERROR_CODES.PRODUCT_NOT_AVAILABLE) {
            void refetchPrices();
          }
        },
      },
    );
  };

  if (cartItems.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Καλάθι</h1>
        <EmptyState
          message="Το καλάθι σας είναι άδειο"
          actionLabel="Πλοήγηση στον κατάλογο"
          onAction={() => navigate({ to: `${base}/catalog` })}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Καλάθι</h1>

      {hasUnavailable && (
        <Alert variant="destructive">
          Κάποια προϊόντα δεν είναι πλέον διαθέσιμα και δεν προσμετρώνται στο σύνολο. Αφαιρέστε τα
          για να ολοκληρώσετε την παραγγελία.
        </Alert>
      )}
      {!hasUnavailable && hasPriceChange && (
        <Alert>
          Οι τιμές ορισμένων προϊόντων ενημερώθηκαν από το κατάστημα. Ελέγξτε το νέο σύνολο πριν την
          υποβολή.
        </Alert>
      )}

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
              {cartItems.map((item) => {
                const { unavailable, currentPrice, priceChanged } = lineInfo(item);
                return (
                  <TableRow
                    key={item.product.id}
                    className={unavailable ? "opacity-60" : undefined}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2 font-medium">
                        {item.product.name}
                        {unavailable && (
                          <Badge variant="muted" size="sm">
                            Μη διαθέσιμο
                          </Badge>
                        )}
                      </div>
                      {item.product.brand && (
                        <div className="text-xs text-muted-foreground">{item.product.brand}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {priceChanged && (
                        <span className="mr-1 text-xs text-muted-foreground/70 line-through">
                          {formatMoney(item.product.resolvedPrice)}
                        </span>
                      )}
                      {formatMoney(currentPrice)}
                      <span className="text-xs text-muted-foreground/70">
                        /{UNIT_LABELS[item.product.unit]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                          aria-label="Μείωση"
                        >
                          -
                        </Button>
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) =>
                            updateQuantity(item.product.id, Math.round(Number(e.target.value)) || 1)
                          }
                          className="h-8 w-14 text-center"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                          aria-label="Αύξηση"
                        >
                          +
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {unavailable ? "—" : formatMoney(currentPrice * item.quantity)}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost-destructive"
                        size="icon"
                        onClick={() => removeItem(item.product.id)}
                        aria-label="Αφαίρεση"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <MobileList>
          {cartItems.map((item) => {
            const { unavailable, currentPrice, priceChanged } = lineInfo(item);
            return (
              <MobileListItem
                key={item.product.id}
                className={unavailable ? "opacity-60" : undefined}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      {item.product.name}
                      {unavailable && (
                        <Badge variant="muted" size="sm">
                          Μη διαθέσιμο
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {item.product.brand ? `${item.product.brand} · ` : ""}
                      {priceChanged && (
                        <span className="mr-1 line-through">
                          {formatMoney(item.product.resolvedPrice)}
                        </span>
                      )}
                      {formatMoney(currentPrice)}
                      <span className="text-xs text-muted-foreground/70">
                        /{UNIT_LABELS[item.product.unit]}
                      </span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost-destructive"
                    size="icon"
                    className="shrink-0"
                    onClick={() => removeItem(item.product.id)}
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
                      onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                      aria-label="Μείωση"
                    >
                      -
                    </Button>
                    <Input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) =>
                        updateQuantity(item.product.id, Math.round(Number(e.target.value)) || 1)
                      }
                      className="h-8 w-14 text-center"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                      aria-label="Αύξηση"
                    >
                      +
                    </Button>
                  </div>
                  <div className="font-medium">
                    {unavailable ? "—" : formatMoney(currentPrice * item.quantity)}
                  </div>
                </div>
              </MobileListItem>
            );
          })}
        </MobileList>
      </Card>

      <div className="space-y-2">
        <Label htmlFor="order-notes">Σχόλιο παραγγελίας</Label>
        <Textarea
          id="order-notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Προαιρετικό σχόλιο προς το κατάστημα..."
        />
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-sm text-muted-foreground">Σύνολο: </span>
            <span className="text-xl font-bold">{formatMoney(reconciledTotal)}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {confirming && (
              <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
                Ακύρωση
              </Button>
            )}
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={createOrder.isPending || resolving || hasUnavailable}
              className="flex-1 sm:flex-initial"
            >
              {createOrder.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {createOrder.isPending
                ? "Υποβολή..."
                : confirming
                  ? "Επιβεβαίωση Παραγγελίας"
                  : "Υποβολή Παραγγελίας"}
            </Button>
          </div>
        </div>
      </Card>

      {createOrder.isError && (
        <p className="text-sm text-destructive">
          {createOrder.error?.message || "Σφάλμα κατά την υποβολή"}
        </p>
      )}
    </div>
  );
}
