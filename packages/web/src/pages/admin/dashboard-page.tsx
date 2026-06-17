import { Link } from "react-router";
import { CalendarRange, ClipboardList, Clock, Send, Users } from "lucide-react";
import { useTenantSlug } from "@/lib/hooks/use-tenant-api";
import { Card, CardContent } from "@/components/ui/card";
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
import { formatMoney, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

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

  const statCards: {
    label: string;
    value: number;
    icon: typeof ClipboardList;
    tint: string;
    href?: string;
  }[] = [
    {
      label: "Παραγγελίες Σήμερα",
      value: stats.ordersToday,
      icon: ClipboardList,
      tint: "bg-primary/10 text-primary",
    },
    {
      label: "Εκκρεμείς",
      value: stats.pendingOrders,
      icon: Clock,
      tint: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    },
    {
      label: "Εκκρεμεί διαβίβαση ERP",
      value: stats.pendingErp,
      icon: Send,
      tint: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
      href: `/k/${slug}/admin/orders?erpStatus=pending`,
    },
    {
      label: "Αυτή την Εβδομάδα",
      value: stats.ordersThisWeek,
      icon: CalendarRange,
      tint: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    },
    {
      label: "Πελάτες",
      value: stats.totalCustomers,
      icon: Users,
      tint: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Πίνακας Ελέγχου</h1>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        {statCards.map((stat) => {
          const card = (
            <Card className={cn("h-full py-0", stat.href && "transition-colors hover:bg-muted/50")}>
              <CardContent className="flex items-center gap-3 p-3 sm:p-4">
                <div
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg sm:size-10",
                    stat.tint,
                  )}
                >
                  <stat.icon className="size-4 sm:size-5" />
                </div>
                <div className="min-w-0">
                  <p className="line-clamp-2 text-xs font-medium text-muted-foreground">
                    {stat.label}
                  </p>
                  <p className="text-2xl font-bold leading-tight sm:text-3xl">{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          );
          return stat.href ? (
            <Link key={stat.label} to={stat.href}>
              {card}
            </Link>
          ) : (
            <div key={stat.label}>{card}</div>
          );
        })}
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
                        {formatDate(order.createdAt)}
                      </TableCell>
                      <TableCell className="font-medium">{order.customerName ?? "-"}</TableCell>
                      <TableCell className="text-center text-muted-foreground">
                        {order.itemCount}
                      </TableCell>
                      <TableCell className="text-right">{formatMoney(order.total)}</TableCell>
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
                        {formatDate(order.createdAt)} · {order.itemCount} προϊόντα
                      </div>
                    </div>
                    <div className="shrink-0 font-medium">{formatMoney(order.total)}</div>
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
