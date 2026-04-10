import { useParams, useNavigate } from "react-router";
import {
  useCustomerOrder,
  useReorder,
} from "../../lib/hooks/use-customer-orders";
import { ORDER_STATUS_LABELS } from "@kava-now/shared";
import type { OrderStatus } from "@kava-now/shared";

const statusColors: Record<OrderStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  shipped: "bg-purple-100 text-purple-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: order, isLoading } = useCustomerOrder(id);
  const reorder = useReorder(id || "");

  const handleReorder = () => {
    reorder.mutate(undefined, {
      onSuccess: (data) => {
        navigate(`/orders/${data.order.id}`);
      },
    });
  };

  if (isLoading) {
    return (
      <div className="text-center text-sm text-gray-500 py-8">Φόρτωση...</div>
    );
  }

  if (!order) {
    return (
      <div className="text-center text-sm text-gray-500 py-8">
        Η παραγγελία δεν βρέθηκε.
      </div>
    );
  }

  const total = order.items.reduce(
    (sum, item) => sum + Number(item.unitPrice) * item.quantity,
    0,
  );

  return (
    <div>
      <button
        type="button"
        onClick={() => navigate("/orders")}
        className="text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        &larr; Πίσω στο ιστορικό
      </button>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Παραγγελία #{order.id.slice(0, 8)}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {new Date(order.createdAt).toLocaleDateString("el-GR", {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${statusColors[order.status as OrderStatus] || "bg-gray-100 text-gray-800"}`}
          >
            {ORDER_STATUS_LABELS[order.status as OrderStatus] || order.status}
          </span>
          <button
            type="button"
            onClick={handleReorder}
            disabled={reorder.isPending}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {reorder.isPending ? "Δημιουργία..." : "Επαναπαραγγελία"}
          </button>
        </div>
      </div>

      {reorder.isError && (
        <p className="mt-2 text-sm text-red-600">
          {reorder.error?.message || "Σφάλμα κατά την επαναπαραγγελία"}
        </p>
      )}

      {/* Items table */}
      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="pb-2 pr-4 font-medium">Προϊόν</th>
              <th className="pb-2 pr-4 font-medium text-center">Ποσότητα</th>
              <th className="pb-2 pr-4 font-medium text-right">Τιμή μονάδας</th>
              <th className="pb-2 font-medium text-right">Σύνολο</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-b border-gray-100">
                <td className="py-3 pr-4 font-medium text-gray-900">
                  {item.productName}
                </td>
                <td className="py-3 pr-4 text-center text-gray-700">
                  {item.quantity}
                </td>
                <td className="py-3 pr-4 text-right text-gray-700">
                  {Number(item.unitPrice).toFixed(2)}&euro;
                </td>
                <td className="py-3 text-right font-medium text-gray-900">
                  {(Number(item.unitPrice) * item.quantity).toFixed(2)}&euro;
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td
                colSpan={3}
                className="py-3 pr-4 text-right font-bold text-gray-900"
              >
                Σύνολο:
              </td>
              <td className="py-3 text-right font-bold text-gray-900">
                {total.toFixed(2)}&euro;
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Notes */}
      {order.notes && (
        <div className="mt-6 rounded-lg bg-gray-50 p-4">
          <h3 className="text-sm font-medium text-gray-700">Σημειώσεις</h3>
          <p className="mt-1 text-sm text-gray-600">{order.notes}</p>
        </div>
      )}
    </div>
  );
}
