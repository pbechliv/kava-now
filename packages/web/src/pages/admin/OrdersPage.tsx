import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTenantSlug } from "@/lib/hooks/use-tenant-api";
import { Input } from "@/components/ui/input";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MobileList, MobileListItem } from "@/components/ui/mobile-list";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/spinner";
import { EmptyState } from "@/components/empty-state";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { PaginationControls } from "@/components/PaginationControls";
import { useAdminOrders } from "@/lib/hooks/use-admin-orders";
import {
  CustomerPickerCombobox,
  type CustomerPickerValue,
} from "@/components/admin/CustomerPickerCombobox";
import { ERP_STATUS_LABELS, type OrderStatus } from "@kava-now/shared";
import { PAGE_SIZE } from "@/lib/constants";
import { formatMoney, formatDate } from "@/lib/format";

const STATUS_TABS: { label: string; value: OrderStatus | "all" }[] = [
  { label: "Όλες", value: "all" },
  { label: "Σε αναμονή", value: "pending" },
  { label: "Επιβεβαιωμένες", value: "confirmed" },
  { label: "Αιτήματα ακύρωσης", value: "cancellation_requested" },
  { label: "Απεσταλμένες", value: "shipped" },
  { label: "Παραδοθείσες", value: "delivered" },
  { label: "Ακυρωμένες", value: "cancelled" },
  { label: "Ακυρ. από πελάτη", value: "cancelled_by_customer" },
];

export function OrdersPage() {
  const navigate = useNavigate();
  const slug = useTenantSlug();
  const adminBase = `/k/${slug}/admin`;
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [customerFilter, setCustomerFilter] = useState<CustomerPickerValue | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useAdminOrders({
    status: statusFilter === "all" ? undefined : statusFilter,
    customerId: customerFilter?.id,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const orders = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Παραγγελίες</h1>

      <Tabs
        value={statusFilter}
        onValueChange={(v) => {
          setStatusFilter(v as OrderStatus | "all");
          setPage(1);
        }}
      >
        <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {STATUS_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="flex-none">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <FilterBar
        activeCount={(customerFilter ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0)}
        onClear={() => {
          setCustomerFilter(null);
          setDateFrom("");
          setDateTo("");
          setPage(1);
        }}
      >
        <FilterField label="Πελάτης" className="md:w-64">
          <CustomerPickerCombobox
            selected={customerFilter}
            onSelect={(c) => {
              setCustomerFilter(c);
              setPage(1);
            }}
          />
        </FilterField>
        <FilterField label="Από" className="md:w-40">
          <Input
            type="date"
            aria-label="Από"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
          />
        </FilterField>
        <FilterField label="Έως" className="md:w-40">
          <Input
            type="date"
            aria-label="Έως"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
          />
        </FilterField>
      </FilterBar>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : orders.length === 0 ? (
        <EmptyState message="Δεν βρέθηκαν παραγγελίες" />
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Πελάτης</TableHead>
                    <TableHead>Ημερομηνία</TableHead>
                    <TableHead className="text-center">Προϊόντα</TableHead>
                    <TableHead className="text-right">Σύνολο</TableHead>
                    <TableHead>Κατάσταση</TableHead>
                    <TableHead>ERP</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow
                      key={order.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`${adminBase}/orders/${order.id}`)}
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {order.id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="font-medium">{order.customerName ?? "-"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(order.createdAt)}
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground">
                        {order.itemCount}
                      </TableCell>
                      <TableCell className="text-right">{formatMoney(order.total)}</TableCell>
                      <TableCell>
                        <OrderStatusBadge status={order.status} />
                      </TableCell>
                      <TableCell>
                        <Badge variant={order.erpStatus === "transmitted" ? "success" : "muted"}>
                          {ERP_STATUS_LABELS[order.erpStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          to={`${adminBase}/orders/${order.id}`}
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          Προβολή
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <MobileList>
              {orders.map((order) => (
                <MobileListItem
                  key={order.id}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                  onClick={() => navigate(`${adminBase}/orders/${order.id}`)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium">{order.customerName ?? "-"}</div>
                      <div className="text-sm text-muted-foreground">
                        <span className="font-mono text-xs">#{order.id.slice(0, 8)}</span> ·{" "}
                        {formatDate(order.createdAt)} · {order.itemCount} προϊόντα
                      </div>
                    </div>
                    <div className="shrink-0 font-medium">{formatMoney(order.total)}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <OrderStatusBadge status={order.status} />
                    <Badge variant={order.erpStatus === "transmitted" ? "success" : "muted"}>
                      {ERP_STATUS_LABELS[order.erpStatus]}
                    </Badge>
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
  );
}
