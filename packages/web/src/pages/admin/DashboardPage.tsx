import { Link } from "react-router";
import { Card } from "../../components/ui/Card";
import { Spinner } from "../../components/ui/Spinner";
import { Badge, STATUS_BADGE_COLOR } from "../../components/ui/Badge";
import { useDashboardStats } from "../../lib/hooks/use-dashboard";
import { ORDER_STATUS_LABELS } from "@kava-now/shared";

export function DashboardPage() {
  const { data: stats, isLoading } = useDashboardStats();

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    { label: "Παραγγελίες Σήμερα", value: stats.ordersToday },
    { label: "Εκκρεμείς", value: stats.pendingOrders },
    { label: "Αυτή την Εβδομάδα", value: stats.ordersThisWeek },
    { label: "Πελάτες", value: stats.totalCustomers },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Πίνακας Ελέγχου</h1>

      {/* Stat cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <p className="text-sm font-medium text-gray-500">{stat.label}</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{stat.value}</p>
          </Card>
        ))}
      </div>

      {/* Recent orders */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Πρόσφατες Παραγγελίες</h2>
          <Link
            to="/admin/orders"
            className="text-sm font-medium text-amber-600 hover:text-amber-700"
          >
            Προβολή όλων
          </Link>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Ημερομηνία</th>
                <th className="px-4 py-3 font-medium">Πελάτης</th>
                <th className="px-4 py-3 font-medium text-center">Προϊόντα</th>
                <th className="px-4 py-3 font-medium text-right">Σύνολο</th>
                <th className="px-4 py-3 font-medium">Κατάσταση</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentOrders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    Δεν υπάρχουν παραγγελίες
                  </td>
                </tr>
              ) : (
                stats.recentOrders.map((order) => (
                  <tr key={order.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(order.createdAt).toLocaleDateString("el-GR")}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {order.customerName ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{order.itemCount}</td>
                    <td className="px-4 py-3 text-right text-gray-900">
                      {Number(order.total).toFixed(2)}&euro;
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={STATUS_BADGE_COLOR[order.status]}>
                        {ORDER_STATUS_LABELS[order.status]}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
