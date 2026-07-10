import { useState } from "react";
import { Link, useParams, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MobileList, MobileListItem } from "@/components/ui/mobile-list";
import { ErrorBanner } from "@/components/error-banner";
import { Spinner } from "@/components/spinner";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { useCustomerOrder, useReorder, useCancelOrder } from "@/lib/hooks/use-customer-orders";
import { useTenantSlug } from "@/lib/hooks/use-tenant-api";
import { formatMoney, formatDateLong } from "@/lib/format";
import type { CustomerOrderDetailResponse } from "@kava-now/shared";

type CustomerOrderItem = CustomerOrderDetailResponse["items"][number];

/** Cancelled / admin-added markers next to the product name. */
function ItemBadges({ item }: { item: CustomerOrderItem }) {
  if (item.status === "cancelled") {
    return (
      <Badge variant="muted" size="sm">
        Ακυρωμένο
      </Badge>
    );
  }
  if (item.originalQuantity == null) {
    return (
      <Badge variant="secondary" size="sm">
        Προστέθηκε
      </Badge>
    );
  }
  return null;
}

export function OrderDetailPage() {
  const { id } = useParams({ strict: false });
  const slug = useTenantSlug();
  const navigate = useNavigate();
  const { data: order, isLoading, error } = useCustomerOrder(id);
  const reorder = useReorder(id || "");
  const cancel = useCancelOrder(id || "");
  const [showCancel, setShowCancel] = useState(false);

  const handleReorder = () => {
    reorder.mutate(undefined, {
      onSuccess: (data) => {
        void navigate({ to: "/k/$slug/orders/$id", params: { slug, id: data.order.id } });
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return <ErrorBanner message={error.message} />;
  }

  if (!order) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Η παραγγελία δεν βρέθηκε.
      </div>
    );
  }

  // Active lines only — cancelled/replaced lines stay visible (with a badge)
  // but must not be counted, or the total double-counts replacements and
  // disagrees with the order-history list (which also filters status='active').
  // Accumulate in integer cents — float drift across many lines otherwise.
  const total =
    order.items.reduce(
      (sum, item) =>
        item.status === "active"
          ? sum + Math.round(Number(item.unitPrice) * 100) * item.quantity
          : sum,
      0,
    ) / 100;

  // Cancelled line → the active line that replaced it (if any), so we can show
  // "Αντικαταστάθηκε με X" instead of an unexplained cancelled row.
  const replacementMap = new Map<string, CustomerOrderItem>();
  for (const item of order.items) {
    if (item.status === "cancelled" && item.replacedByItemId) {
      const next = order.items.find((i) => i.id === item.replacedByItemId);
      if (next) replacementMap.set(item.id, next);
    }
  }

  // pending → cancel outright; confirmed → request cancellation (staff approve).
  const canCancel = order.status === "pending";
  const canRequest = order.status === "confirmed";
  const isRequested = order.status === "cancellation_requested";

  return (
    <div className="space-y-6">
      <Link
        to="/k/$slug/orders"
        params={{ slug }}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Πίσω στο ιστορικό
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Παραγγελία #{order.orderNumber}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{formatDateLong(order.createdAt)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <OrderStatusBadge status={order.status} />
          {(canCancel || canRequest) && (
            <Button
              variant={canCancel ? "destructive" : "outline"}
              onClick={() => setShowCancel(true)}
              disabled={cancel.isPending}
            >
              {cancel.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {canCancel ? "Ακύρωση παραγγελίας" : "Αίτημα ακύρωσης"}
            </Button>
          )}
          <Button onClick={handleReorder} disabled={reorder.isPending}>
            {reorder.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {reorder.isPending ? "Δημιουργία..." : "Επαναπαραγγελία"}
          </Button>
        </div>
      </div>

      {isRequested && (
        <Card className="border-warning/40 bg-warning/10 p-4">
          <p className="text-sm">
            Το αίτημα ακύρωσης εκκρεμεί — αναμένεται έγκριση από το κατάστημα.
          </p>
        </Card>
      )}

      {reorder.isError && (
        <p className="text-sm text-destructive">
          {reorder.error?.message || "Σφάλμα κατά την επαναπαραγγελία"}
        </p>
      )}

      <Card className="overflow-hidden">
        <div className="hidden overflow-x-auto md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Προϊόν</TableHead>
                <TableHead className="text-center">Ποσότητα</TableHead>
                <TableHead className="text-right">Τιμή μονάδας</TableHead>
                <TableHead className="text-right">Σύνολο</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((item) => {
                const isCancelled = item.status === "cancelled";
                const replacement = replacementMap.get(item.id);
                const qtyChanged =
                  item.originalQuantity != null && item.originalQuantity !== item.quantity;
                return (
                  <TableRow key={item.id} className={isCancelled ? "text-muted-foreground" : ""}>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={isCancelled ? "font-medium line-through" : "font-medium"}
                          >
                            {item.productName}
                          </span>
                          <ItemBadges item={item} />
                        </div>
                        {replacement && (
                          <span className="text-xs text-muted-foreground">
                            → Αντικαταστάθηκε με{" "}
                            <span className="font-medium">{replacement.productName}</span>
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className={isCancelled ? "line-through" : ""}>{item.quantity}</span>
                        {qtyChanged && !isCancelled && (
                          <span className="text-[10px] text-muted-foreground">
                            Αρχικά: {item.originalQuantity}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell
                      className={
                        isCancelled
                          ? "text-right text-muted-foreground line-through"
                          : "text-right text-muted-foreground"
                      }
                    >
                      {formatMoney(item.unitPrice)}
                    </TableCell>
                    <TableCell
                      className={
                        isCancelled
                          ? "text-right font-medium line-through"
                          : "text-right font-medium"
                      }
                    >
                      {formatMoney(Number(item.unitPrice) * item.quantity)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="text-right font-bold">
                  Σύνολο:
                </TableCell>
                <TableCell className="text-right font-bold">{formatMoney(total)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
        <div className="md:hidden">
          <MobileList>
            {order.items.map((item) => {
              const isCancelled = item.status === "cancelled";
              const replacement = replacementMap.get(item.id);
              const qtyChanged =
                item.originalQuantity != null && item.originalQuantity !== item.quantity;
              return (
                <MobileListItem
                  key={item.id}
                  className={isCancelled ? "text-muted-foreground" : undefined}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={isCancelled ? "font-medium line-through" : "font-medium"}>
                          {item.productName}
                        </span>
                        <ItemBadges item={item} />
                      </div>
                      {replacement && (
                        <div className="text-xs text-muted-foreground">
                          → Αντικαταστάθηκε με{" "}
                          <span className="font-medium">{replacement.productName}</span>
                        </div>
                      )}
                      <div className="text-sm text-muted-foreground">
                        <span className={isCancelled ? "line-through" : ""}>
                          {item.quantity} × {formatMoney(item.unitPrice)}
                        </span>
                        {qtyChanged && !isCancelled && (
                          <span className="ml-2 text-[10px]">Αρχικά: {item.originalQuantity}</span>
                        )}
                      </div>
                    </div>
                    <div
                      className={
                        isCancelled ? "shrink-0 font-medium line-through" : "shrink-0 font-medium"
                      }
                    >
                      {formatMoney(Number(item.unitPrice) * item.quantity)}
                    </div>
                  </div>
                </MobileListItem>
              );
            })}
          </MobileList>
          <div className="flex items-center justify-between border-t bg-muted/50 p-4 font-bold">
            <span>Σύνολο:</span>
            <span>{formatMoney(total)}</span>
          </div>
        </div>
      </Card>

      {order.notes && (
        <Card className="p-4">
          <h3 className="text-sm font-medium">Σημειώσεις</h3>
          <p className="mt-1 text-sm text-muted-foreground">{order.notes}</p>
        </Card>
      )}

      <ConfirmDialog
        open={showCancel}
        title={canCancel ? "Ακύρωση παραγγελίας" : "Αίτημα ακύρωσης"}
        description={
          canCancel
            ? "Είστε σίγουρος ότι θέλετε να ακυρώσετε αυτή την παραγγελία;"
            : "Η παραγγελία έχει επιβεβαιωθεί. Θα σταλεί αίτημα ακύρωσης για έγκριση από το κατάστημα."
        }
        confirmLabel={canCancel ? "Ακύρωση παραγγελίας" : "Αποστολή αιτήματος"}
        pending={cancel.isPending}
        error={cancel.error?.message}
        onConfirm={() => cancel.mutate(undefined, { onSuccess: () => setShowCancel(false) })}
        onClose={() => setShowCancel(false)}
      />
    </div>
  );
}
