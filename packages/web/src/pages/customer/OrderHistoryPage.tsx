import { useState } from "react";
import { useNavigate } from "react-router";
import { useTenantSlug } from "@/lib/hooks/use-tenant-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { ErrorBanner } from "@/components/error-banner";
import { Spinner } from "@/components/spinner";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { PaginationControls } from "@/components/PaginationControls";
import { useCustomerOrders } from "@/lib/hooks/use-customer-orders";

const PAGE_SIZE = 50;

export function OrderHistoryPage() {
  const navigate = useNavigate();
  const slug = useTenantSlug();
  const base = `/k/${slug}`;
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useCustomerOrders({ page, pageSize: PAGE_SIZE });
  const orders = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Ιστορικό Παραγγελιών</h1>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : error ? (
        <ErrorBanner message={error.message} />
      ) : orders.length === 0 ? (
        <EmptyState
          message="Δεν υπάρχουν παραγγελίες"
          actionLabel="Πλοήγηση στον κατάλογο"
          onAction={() => navigate(`${base}/catalog`)}
        />
      ) : (
        <>
          <div className="space-y-3">
            {orders.map((order) => (
              <Card key={order.id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">#{order.id.slice(0, 8)}</span>
                      <OrderStatusBadge status={order.status} />
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
                    onClick={() => navigate(`${base}/orders/${order.id}`)}
                    className="self-start sm:self-auto"
                  >
                    Λεπτομέρειες
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          <PaginationControls
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
