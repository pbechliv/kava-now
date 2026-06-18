import { useState } from "react";
import { useFilterSearch } from "@/lib/hooks/use-filter-search";
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
import {
  ERP_STATUS_LABELS,
  type AdminOrdersSearch,
  type ErpStatus,
  type OrderStatus,
} from "@kava-now/shared";
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
  const { search, setFilters } = useFilterSearch<AdminOrdersSearch>();

  // Only `customerId` lives in the URL; the picker needs the name to render its
  // label, so we keep that display value locally (the URL stays the source of
  // truth for filtering — after a reload the list is still filtered even if the
  // label resets to its placeholder).
  const [customerDisplay, setCustomerDisplay] = useState<CustomerPickerValue | null>(null);

  const statusFilter = search.status ?? "all";
  const erpFilter = search.erpStatus ?? "all";
  const dateFrom = search.dateFrom ?? "";
  const dateTo = search.dateTo ?? "";
  const page = search.page ?? 1;

  const { data, isLoading } = useAdminOrders({
    status: search.status,
    erpStatus: search.erpStatus,
    customerId: search.customerId,
    dateFrom: search.dateFrom,
    dateTo: search.dateTo,
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
        onValueChange={(v) => setFilters({ status: v === "all" ? undefined : (v as OrderStatus) })}
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
          (search.customerId ? 1 : 0) +
          (dateFrom ? 1 : 0) +
          (dateTo ? 1 : 0) +
          (erpFilter !== "all" ? 1 : 0)
        }
        onClear={() => {
          setCustomerDisplay(null);
          setFilters({
            customerId: undefined,
            dateFrom: undefined,
            dateTo: undefined,
            erpStatus: undefined,
          });
        }}
      >
        <FilterField label="ERP" className="md:w-48">
          <Select
            value={erpFilter}
            onValueChange={(v) =>
              setFilters({ erpStatus: v === "all" ? undefined : (v as ErpStatus) })
            }
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
            selected={customerDisplay}
            onSelect={(c) => {
              setCustomerDisplay(c);
              setFilters({ customerId: c?.id });
            }}
          />
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
            onPageChange={(p) => setFilters({ page: p })}
          />
        </>
      )}
    </div>
  );
}
