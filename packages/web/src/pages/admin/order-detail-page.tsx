import { useParams, Link } from "@tanstack/react-router";
import { ArrowLeft, Copy, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/copy";
import { Spinner } from "@/components/spinner";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { ErpStatusBadge } from "@/components/admin/erp-status-badge";
import { OrderStatusCard } from "@/components/admin/order-detail/order-status-card";
import { OrderBillingCard } from "@/components/admin/order-detail/order-billing-card";
import { OrderItemsSection } from "@/components/admin/order-detail/order-items-section";
import { OrderErpCard } from "@/components/admin/order-detail/order-erp-card";
import { OrderCancellationCard } from "@/components/admin/order-detail/order-cancellation-card";
import { OrderInternalNotesCard } from "@/components/admin/order-detail/order-internal-notes-card";
import { useAdminOrder } from "@/lib/hooks/use-admin-orders";
import { useTenantSlug } from "@/lib/hooks/use-tenant-api";
import { formatDateTime } from "@/lib/format";

export function OrderDetailPage() {
  const { id } = useParams({ strict: false });
  const slug = useTenantSlug();
  const { data: order, isLoading } = useAdminOrder(id);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (!order) {
    return <div className="py-12 text-center text-muted-foreground">Η παραγγελία δεν βρέθηκε</div>;
  }

  return (
    <div className="space-y-6">
      <Link
        to="/k/$slug/admin/orders"
        params={{ slug }}
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Πίσω στις παραγγελίες
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Παραγγελία #{order.orderNumber}</h1>
          <OrderStatusBadge status={order.status} />
          <ErpStatusBadge status={order.erpStatus} prefix="ERP: " />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{formatDateTime(order.createdAt)}</p>
      </div>

      {order.status === "cancellation_requested" && <OrderCancellationCard order={order} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Πελάτης
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-medium">{order.customerName ?? "-"}</p>
            {order.customerPhone && (
              <p className="mt-1 text-sm text-muted-foreground">{order.customerPhone}</p>
            )}
            {order.customerEmail && (
              <p className="text-sm text-muted-foreground">{order.customerEmail}</p>
            )}
            {/* Delivery address — where to ship. Highlighted and kept distinct
                from the billing address in OrderBillingCard below. */}
            <div className="mt-3 flex items-start justify-between gap-2 rounded-md border bg-muted/40 p-2.5">
              <div className="flex min-w-0 items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Διεύθυνση παράδοσης
                  </p>
                  <p className="mt-0.5 break-words text-sm">{order.customerAddress ?? "—"}</p>
                </div>
              </div>
              {order.customerAddress && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0"
                  onClick={() =>
                    order.customerAddress &&
                    copyToClipboard(order.customerAddress, "Αντιγραφή διεύθυνσης παράδοσης")
                  }
                  aria-label="Αντιγραφή διεύθυνσης παράδοσης"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <OrderStatusCard order={order} />
      </div>

      <OrderBillingCard order={order} />

      <OrderItemsSection order={order} />

      <OrderErpCard order={order} />

      {order.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Σχόλιο πελάτη
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{order.notes}</p>
          </CardContent>
        </Card>
      )}

      <OrderInternalNotesCard order={order} />
    </div>
  );
}
