import { Link, useNavigate } from "@tanstack/react-router";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  type CustomerOrdersSearch,
  type OrderStatus,
} from "@kava-now/shared";
import { useTenantSlug } from "@/lib/hooks/use-tenant-api";
import { useFilterSearch } from "@/lib/hooks/use-filter-search";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { ErrorBanner } from "@/components/error-banner";
import { Spinner } from "@/components/spinner";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { PaginationControls } from "@/components/pagination-controls";
import { useCustomerOrders } from "@/lib/hooks/use-customer-orders";
import { PAGE_SIZE } from "@/lib/constants";
import { formatMoney, formatDateLong } from "@/lib/format";

// Base UI's <Select.Value> needs a value→label map to render the selected label
// in the trigger; without `items` it falls back to the raw value.
const STATUS_FILTER_ITEMS = [
  { value: "all", label: "Όλες οι καταστάσεις" },
  ...ORDER_STATUSES.map((status) => ({ value: status, label: ORDER_STATUS_LABELS[status] })),
];

export function OrderHistoryPage() {
  const navigate = useNavigate();
  const slug = useTenantSlug();
  const { search, setFilters } = useFilterSearch<CustomerOrdersSearch>();
  const statusFilter = search.status ?? "all";
  const dateFrom = search.dateFrom ?? "";
  const dateTo = search.dateTo ?? "";
  const page = search.page ?? 1;

  const { data, isLoading, error } = useCustomerOrders({
    status: search.status,
    dateFrom: search.dateFrom,
    dateTo: search.dateTo,
    page,
    pageSize: PAGE_SIZE,
  });
  const orders = data?.data ?? [];
  const total = data?.total ?? 0;

  const activeCount = (statusFilter !== "all" ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Ιστορικό Παραγγελιών</h1>

      <FilterBar
        activeCount={activeCount}
        onClear={() => setFilters({ status: undefined, dateFrom: undefined, dateTo: undefined })}
      >
        <FilterField label="Κατάσταση" className="md:w-56">
          <Select
            value={statusFilter}
            items={STATUS_FILTER_ITEMS}
            onValueChange={(v) =>
              setFilters({ status: v === "all" ? undefined : (v as OrderStatus) })
            }
          >
            <SelectTrigger className="w-full" aria-label="Κατάσταση">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTER_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Από" className="md:w-40">
          <Input
            type="date"
            aria-label="Από"
            value={dateFrom}
            onChange={(e) => setFilters({ dateFrom: e.target.value || undefined })}
          />
        </FilterField>
        <FilterField label="Έως" className="md:w-40">
          <Input
            type="date"
            aria-label="Έως"
            value={dateTo}
            onChange={(e) => setFilters({ dateTo: e.target.value || undefined })}
          />
        </FilterField>
      </FilterBar>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : error ? (
        <ErrorBanner message={error.message} />
      ) : orders.length === 0 ? (
        activeCount > 0 ? (
          <EmptyState message="Δεν βρέθηκαν παραγγελίες με αυτά τα φίλτρα" />
        ) : (
          <EmptyState
            message="Δεν υπάρχουν παραγγελίες"
            actionLabel="Πλοήγηση στον κατάλογο"
            onAction={() => navigate({ to: "/k/$slug/catalog", params: { slug } })}
          />
        )
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
