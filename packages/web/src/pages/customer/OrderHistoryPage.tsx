import { useNavigate } from "react-router";
import { useCustomerOrders } from "../../lib/hooks/use-customer-orders";
import { ORDER_STATUS_LABELS } from "@kava-now/shared";
import type { OrderStatus } from "@kava-now/shared";

const statusColors: Record<OrderStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  shipped: "bg-purple-100 text-purple-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

export function OrderHistoryPage() {
  const navigate = useNavigate();
  const { data: orders, isLoading } = useCustomerOrders();

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">
        Ιστορικό Παραγγελιών
      </h1>

      {isLoading ? (
        <div className="mt-8 text-center text-sm text-gray-500">
          Φόρτωση...
        </div>
      ) : !orders || orders.length === 0 ? (
        <div className="mt-8 text-center text-sm text-gray-500">
          Δεν υπάρχουν παραγγελίες.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {orders.map((order) => (
            <div
              key={order.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-900">
                    #{order.id.slice(0, 8)}
                  </span>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[order.status as OrderStatus] || "bg-gray-100 text-gray-800"}`}
                  >
                    {ORDER_STATUS_LABELS[order.status as OrderStatus] ||
                      order.status}
                  </span>
                </div>
                <div className="mt-1 text-sm text-gray-500">
                  {new Date(order.createdAt).toLocaleDateString("el-GR", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
                <div className="mt-1 text-sm text-gray-600">
                  {order.itemCount} {order.itemCount === 1 ? "προϊόν" : "προϊόντα"}{" "}
                  &middot;{" "}
                  <span className="font-medium">
                    {order.totalAmount.toFixed(2)}&euro;
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => navigate(`/orders/${order.id}`)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Λεπτομέρειες
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
