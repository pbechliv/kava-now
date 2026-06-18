import { useState } from "react";
import { Link, useParams, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  // Accumulate in integer cents — float drift across many lines otherwise.
  const total =
    order.items.reduce(
      (sum, item) => sum + Math.round(Number(item.unitPrice) * 100) * item.quantity,
      0,
    ) / 100;

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
          <h1 className="text-2xl font-bold tracking-tight">Παραγγελία #{order.id.slice(0, 8)}</h1>
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
              {order.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.productName}</TableCell>
                  <TableCell className="text-center">{item.quantity}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatMoney(item.unitPrice)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatMoney(Number(item.unitPrice) * item.quantity)}
                  </TableCell>
                </TableRow>
              ))}
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
            {order.items.map((item) => (
              <MobileListItem key={item.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{item.productName}</div>
                    <div className="text-sm text-muted-foreground">
                      {item.quantity} × {formatMoney(item.unitPrice)}
                    </div>
                  </div>
                  <div className="shrink-0 font-medium">
                    {formatMoney(Number(item.unitPrice) * item.quantity)}
                  </div>
                </div>
              </MobileListItem>
            ))}
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
