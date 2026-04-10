import { useState } from "react";
import { Link } from "react-router";
import { Spinner } from "../../components/ui/Spinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { Badge, STATUS_BADGE_COLOR } from "../../components/ui/Badge";
import { Input } from "../../components/ui/Input";
import { useAdminOrders } from "../../lib/hooks/use-admin-orders";
import { useCustomers } from "../../lib/hooks/use-customers";
import { ORDER_STATUS_LABELS } from "@kava-now/shared";
import type { OrderStatus } from "@kava-now/shared";

const STATUS_TABS: { label: string; value: OrderStatus | undefined }[] = [
  { label: "Όλες", value: undefined },
  { label: "Σε αναμονή", value: "pending" },
  { label: "Επιβεβαιωμένες", value: "confirmed" },
  { label: "Απεσταλμένες", value: "shipped" },
  { label: "Παραδοθείσες", value: "delivered" },
  { label: "Ακυρωμένες", value: "cancelled" },
];

export function OrdersPage() {
  const [statusFilter, setStatusFilter] = useState<OrderStatus | undefined>(
    undefined,
  );
  const [customerFilter, setCustomerFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: orders, isLoading } = useAdminOrders({
    status: statusFilter,
    customerId: customerFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const { data: customers } = useCustomers();

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Παραγγελίες</h1>

      {/* Status tabs */}
      <div className="mt-4 flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.label}
            onClick={() => setStatusFilter(tab.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              statusFilter === tab.value
                ? "bg-amber-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters row */}
      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div className="w-56">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Πελάτης
          </label>
          <select
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
          >
            <option value="">Όλοι</option>
            {customers?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="w-44">
          <Input
            label="Από"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="w-44">
          <Input
            label="Έως"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="mt-6">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : !orders || orders.length === 0 ? (
          <EmptyState message="Δεν βρέθηκαν παραγγελίες" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">Πελάτης</th>
                  <th className="px-4 py-3 font-medium">Ημερομηνία</th>
                  <th className="px-4 py-3 font-medium text-center">
                    Προϊόντα
                  </th>
                  <th className="px-4 py-3 font-medium text-right">Σύνολο</th>
                  <th className="px-4 py-3 font-medium">Κατάσταση</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b last:border-0 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {order.id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {order.customerName ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(order.createdAt).toLocaleDateString("el-GR")}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">
                      {order.itemCount}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900">
                      {Number(order.total).toFixed(2)}&euro;
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={STATUS_BADGE_COLOR[order.status]}>
                        {ORDER_STATUS_LABELS[order.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/admin/orders/${order.id}`}
                        className="text-sm font-medium text-amber-600 hover:text-amber-700"
                      >
                        Προβολή
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
