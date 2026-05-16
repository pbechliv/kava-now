import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { useCustomerOrders } from "@/lib/hooks/use-customer-orders";
import type { OrderStatus } from "@kava-now/shared";

export function OrderHistoryPage() {
  const navigate = useNavigate();
  const { data: orders, isLoading } = useCustomerOrders();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Ιστορικό Παραγγελιών</h1>

      {isLoading ? (
        <div className="text-center text-sm text-muted-foreground">Φόρτωση...</div>
      ) : !orders || orders.length === 0 ? (
        <EmptyState
          message="Δεν υπάρχουν παραγγελίες"
          actionLabel="Πλοήγηση στον κατάλογο"
          onAction={() => navigate("/catalog")}
        />
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <Card key={order.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">#{order.id.slice(0, 8)}</span>
                    <OrderStatusBadge status={order.status as OrderStatus} />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {new Date(order.createdAt).toLocaleDateString("el-GR", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  <div className="text-sm">
                    {order.itemCount} {order.itemCount === 1 ? "προϊόν" : "προϊόντα"} ·{" "}
                    <span className="font-medium">{order.totalAmount.toFixed(2)}&nbsp;€</span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/orders/${order.id}`)}
                  className="self-start sm:self-auto"
                >
                  Λεπτομέρειες
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
