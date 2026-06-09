import { useState } from "react";
import { Link } from "react-router";
import { useTenantSlug } from "@/lib/hooks/use-tenant-api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/spinner";
import { EmptyState } from "@/components/empty-state";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { PaginationControls } from "@/components/PaginationControls";
import { useAdminOrders } from "@/lib/hooks/use-admin-orders";
import { useCustomers } from "@/lib/hooks/use-customers";
import { ERP_STATUS_LABELS, type OrderStatus } from "@kava-now/shared";

const PAGE_SIZE = 50;
const CUSTOMER_FILTER_LIMIT = 100;

const STATUS_TABS: { label: string; value: OrderStatus | "all" }[] = [
  { label: "Όλες", value: "all" },
  { label: "Σε αναμονή", value: "pending" },
  { label: "Επιβεβαιωμένες", value: "confirmed" },
  { label: "Απεσταλμένες", value: "shipped" },
  { label: "Παραδοθείσες", value: "delivered" },
  { label: "Ακυρωμένες", value: "cancelled" },
];

export function OrdersPage() {
  const slug = useTenantSlug();
  const adminBase = `/k/${slug}/admin`;
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [customerFilter, setCustomerFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useAdminOrders({
    status: statusFilter === "all" ? undefined : statusFilter,
    customerId: customerFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const orders = data?.data ?? [];
  const total = data?.total ?? 0;

  const { data: customersData } = useCustomers({ pageSize: CUSTOMER_FILTER_LIMIT });
  const customers = customersData?.data ?? [];

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
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 p-1">
          {STATUS_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="flex-none">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="customer-filter">Πελάτης</Label>
          <Select
            value={customerFilter || "all"}
            onValueChange={(v) => {
              setCustomerFilter(v === "all" ? "" : v);
              setPage(1);
            }}
          >
            <SelectTrigger id="customer-filter" className="w-full">
              <SelectValue placeholder="Όλοι" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Όλοι</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="date-from">Από</Label>
          <Input
            id="date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="date-to">Έως</Label>
          <Input
            id="date-to"
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : orders.length === 0 ? (
        <EmptyState message="Δεν βρέθηκαν παραγγελίες" />
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
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
                    <TableRow key={order.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {order.id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="font-medium">{order.customerName ?? "-"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(order.createdAt).toLocaleDateString("el-GR")}
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground">
                        {order.itemCount}
                      </TableCell>
                      <TableCell className="text-right">
                        {Number(order.total).toFixed(2)}&nbsp;€
                      </TableCell>
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
