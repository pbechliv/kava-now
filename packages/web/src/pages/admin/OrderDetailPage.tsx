import { useParams, Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/spinner";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { OrderStatusCard } from "@/components/admin/order-detail/OrderStatusCard";
import { OrderBillingCard } from "@/components/admin/order-detail/OrderBillingCard";
import { OrderItemsSection } from "@/components/admin/order-detail/OrderItemsSection";
import { OrderErpCard } from "@/components/admin/order-detail/OrderErpCard";
import { OrderCancellationCard } from "@/components/admin/order-detail/OrderCancellationCard";
import { useAdminOrder } from "@/lib/hooks/use-admin-orders";
import { ERP_STATUS_LABELS } from "@kava-now/shared";
import { formatDateTime } from "@/lib/format";

export function OrderDetailPage() {
  const { id, slug } = useParams<{ id: string; slug: string }>();
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
        to={`/k/${slug}/admin/orders`}
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Πίσω στις παραγγελίες
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Παραγγελία #{order.id.slice(0, 8)}</h1>
          <OrderStatusBadge status={order.status} />
          <Badge variant={order.erpStatus === "transmitted" ? "success" : "muted"}>
            ERP: {ERP_STATUS_LABELS[order.erpStatus]}
          </Badge>
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
              Σημειώσεις
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{order.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
