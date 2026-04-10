import { useState } from "react";
import { useParams, Link } from "react-router";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Spinner } from "../../components/ui/Spinner";
import { Badge, STATUS_BADGE_COLOR } from "../../components/ui/Badge";
import {
  useAdminOrder,
  useUpdateOrderStatus,
} from "../../lib/hooks/use-admin-orders";
import { ORDER_STATUS_LABELS } from "@kava-now/shared";
import type { OrderStatus } from "@kava-now/shared";

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export function OrderDetailPage() {
  const { id } = useParams();
  const { data: order, isLoading } = useAdminOrder(id);
  const updateStatus = useUpdateOrderStatus();
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | "">("");

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-12 text-gray-500">
        Η παραγγελία δεν βρέθηκε
      </div>
    );
  }

  const allowedNext = ALLOWED_TRANSITIONS[order.status] ?? [];

  const handleStatusChange = () => {
    if (!selectedStatus || !id) return;
    updateStatus.mutate(
      { id, status: selectedStatus },
      { onSuccess: () => setSelectedStatus("") },
    );
  };

  return (
    <div>
      {/* Back link */}
      <Link
        to="/admin/orders"
        className="text-sm text-amber-600 hover:text-amber-700"
      >
        &larr; Πίσω στις παραγγελίες
      </Link>

      {/* Order header */}
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-900">
          Παραγγελία #{order.id.slice(0, 8)}
        </h1>
        <Badge color={STATUS_BADGE_COLOR[order.status]}>
          {ORDER_STATUS_LABELS[order.status]}
        </Badge>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        {new Date(order.createdAt).toLocaleString("el-GR")}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Customer info */}
        <Card>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Πελάτης
          </h2>
          <p className="mt-2 text-lg font-medium text-gray-900">
            {order.customerName ?? "-"}
          </p>
          {order.customerPhone && (
            <p className="mt-1 text-sm text-gray-600">
              {order.customerPhone}
            </p>
          )}
          {order.customerEmail && (
            <p className="text-sm text-gray-600">{order.customerEmail}</p>
          )}
        </Card>

        {/* Status change */}
        <Card className="lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Αλλαγή Κατάστασης
          </h2>
          {allowedNext.length === 0 ? (
            <p className="mt-2 text-sm text-gray-400">
              Δεν επιτρέπονται περαιτέρω αλλαγές κατάστασης
            </p>
          ) : (
            <div className="mt-2 flex items-center gap-3">
              <select
                value={selectedStatus}
                onChange={(e) =>
                  setSelectedStatus(e.target.value as OrderStatus)
                }
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              >
                <option value="">Επιλέξτε...</option>
                {allowedNext.map((s) => (
                  <option key={s} value={s}>
                    {ORDER_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <Button
                onClick={handleStatusChange}
                disabled={!selectedStatus}
                loading={updateStatus.isPending}
                size="sm"
              >
                Αλλαγή Κατάστασης
              </Button>
            </div>
          )}
        </Card>
      </div>

      {/* Items table */}
      <div className="mt-6">
        <h2 className="text-lg font-semibold text-gray-900">Προϊόντα</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Προϊόν</th>
                <th className="px-4 py-3 font-medium text-center">Ποσότητα</th>
                <th className="px-4 py-3 font-medium text-right">Τιμή</th>
                <th className="px-4 py-3 font-medium text-right">
                  Υποσύνολο
                </th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {item.productName}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">
                    {item.quantity}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {Number(item.unitPrice).toFixed(2)}&euro;
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900">
                    {(Number(item.unitPrice) * item.quantity).toFixed(2)}&euro;
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50">
                <td
                  colSpan={3}
                  className="px-4 py-3 text-right font-semibold text-gray-900"
                >
                  Σύνολο
                </td>
                <td className="px-4 py-3 text-right font-semibold text-gray-900">
                  {Number(order.total).toFixed(2)}&euro;
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Notes */}
      {order.notes && (
        <Card className="mt-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Σημειώσεις
          </h2>
          <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">
            {order.notes}
          </p>
        </Card>
      )}
    </div>
  );
}
