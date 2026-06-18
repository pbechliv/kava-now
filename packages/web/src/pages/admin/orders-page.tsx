import { useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/spinner";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { useAdminOrders } from "@/lib/hooks/use-admin-orders";
import { OrdersTable } from "@/components/admin/orders-table";
import {
  CustomerPickerCombobox,
  type CustomerPickerValue,
} from "@/components/admin/customer-picker-combobox";
import { ERP_STATUS_LABELS, type ErpStatus, type OrderStatus } from "@kava-now/shared";
import { PAGE_SIZE } from "@/lib/constants";

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
  const {
    erpStatus: initialErp,
    status: initialStatus,
    dateFrom: initialDateFrom,
    dateTo: initialDateTo,
  } = useSearch({ strict: false });
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">(
    STATUS_TABS.some((tab) => tab.value === initialStatus) ? (initialStatus as OrderStatus) : "all",
  );
  const [erpFilter, setErpFilter] = useState<ErpStatus | "all">(initialErp ?? "all");
  const [customerFilter, setCustomerFilter] = useState<CustomerPickerValue | null>(null);
  const [dateFrom, setDateFrom] = useState(initialDateFrom ?? "");
  const [dateTo, setDateTo] = useState(initialDateTo ?? "");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useAdminOrders({
    status: statusFilter === "all" ? undefined : statusFilter,
    erpStatus: erpFilter === "all" ? undefined : erpFilter,
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
        activeCount={
          (customerFilter ? 1 : 0) +
          (dateFrom ? 1 : 0) +
          (dateTo ? 1 : 0) +
          (erpFilter !== "all" ? 1 : 0)
        }
        onClear={() => {
          setCustomerFilter(null);
          setDateFrom("");
          setDateTo("");
          setErpFilter("all");
          setPage(1);
        }}
      >
        <FilterField label="ERP" className="md:w-48">
          <Select
            value={erpFilter}
            onValueChange={(v) => {
              setErpFilter(v as ErpStatus | "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full" aria-label="ERP">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Όλες</SelectItem>
              <SelectItem value="pending">{ERP_STATUS_LABELS.pending}</SelectItem>
              <SelectItem value="transmitted">{ERP_STATUS_LABELS.transmitted}</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
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
          <OrdersTable
            orders={orders}
            emptyMessage="Δεν βρέθηκαν παραγγελίες"
            showId
            showErp
            showActions
          />
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
