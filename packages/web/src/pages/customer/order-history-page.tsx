import { Link, useNavigate } from "@tanstack/react-router";
import type { PageOnlySearch } from "@kava-now/shared";
import { useTenantSlug } from "@/lib/hooks/use-tenant-api";
import { useFilterSearch } from "@/lib/hooks/use-filter-search";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { ErrorBanner } from "@/components/error-banner";
import { Spinner } from "@/components/spinner";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { PaginationControls } from "@/components/pagination-controls";
import { useCustomerOrders } from "@/lib/hooks/use-customer-orders";
import { PAGE_SIZE } from "@/lib/constants";
import { formatMoney, formatDateLong } from "@/lib/format";

export function OrderHistoryPage() {
  const navigate = useNavigate();
  const slug = useTenantSlug();
  const { search, setFilters } = useFilterSearch<PageOnlySearch>();
  const page = search.page ?? 1;
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
          onAction={() => navigate({ to: "/k/$slug/catalog", params: { slug } })}
        />
      ) : (
        <>
          <div className="space-y-3">
            {orders.map((order) => (
              <Card key={order.id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">#{order.orderNumber}</span>
                      <OrderStatusBadge status={order.status} />
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatDateLong(order.createdAt)}
                    </div>
                    <div className="text-sm">
                      {order.itemCount} {order.itemCount === 1 ? "προϊόν" : "προϊόντα"} ·{" "}
                      <span className="font-medium">{formatMoney(order.totalAmount)}</span>
                    </div>
                  </div>
                  <Link
                    to="/k/$slug/orders/$id"
                    params={{ slug, id: order.id }}
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "self-start sm:self-auto",
                    )}
                  >
                    Λεπτομέρειες
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
          <PaginationControls
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={(p) => setFilters({ page: p })}
          />
        </>
      )}
    </div>
  );
}
