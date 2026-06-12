import { Link } from "react-router";
import { useTenantSlug } from "@/lib/hooks/use-tenant-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MobileList, MobileListItem } from "@/components/ui/mobile-list";
import { Spinner } from "@/components/spinner";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { useDashboardStats } from "@/lib/hooks/use-dashboard";

export function DashboardPage() {
  const slug = useTenantSlug();
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
    <div className="space-y-8">
      <h1 className="text-2xl font-bold tracking-tight">Πίνακας Ελέγχου</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Πρόσφατες Παραγγελίες</h2>
          <Link
            to={`/k/${slug}/admin/orders`}
            className="text-sm font-medium text-primary hover:underline"
          >
            Προβολή όλων
          </Link>
        </div>

        <Card className="mt-4 overflow-hidden">
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ημερομηνία</TableHead>
                  <TableHead>Πελάτης</TableHead>
                  <TableHead className="text-center">Προϊόντα</TableHead>
                  <TableHead className="text-right">Σύνολο</TableHead>
                  <TableHead>Κατάσταση</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.recentOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Δεν υπάρχουν παραγγελίες
                    </TableCell>
                  </TableRow>
                ) : (
                  stats.recentOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="text-muted-foreground">
                        {new Date(order.createdAt).toLocaleDateString("el-GR")}
                      </TableCell>
                      <TableCell className="font-medium">{order.customerName ?? "-"}</TableCell>
                      <TableCell className="text-center text-muted-foreground">
                        {order.itemCount}
                      </TableCell>
                      <TableCell className="text-right">
                        {Number(order.total).toFixed(2)}&euro;
                      </TableCell>
                      <TableCell>
                        <OrderStatusBadge status={order.status} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {stats.recentOrders.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground md:hidden">
              Δεν υπάρχουν παραγγελίες
            </p>
          ) : (
            <MobileList>
              {stats.recentOrders.map((order) => (
                <MobileListItem key={order.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium">{order.customerName ?? "-"}</div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(order.createdAt).toLocaleDateString("el-GR")} · {order.itemCount}{" "}
                        προϊόντα
                      </div>
                    </div>
                    <div className="shrink-0 font-medium">
                      {Number(order.total).toFixed(2)}&euro;
                    </div>
                  </div>
                  <OrderStatusBadge status={order.status} />
                </MobileListItem>
              ))}
            </MobileList>
          )}
        </Card>
      </div>
    </div>
  );
}
