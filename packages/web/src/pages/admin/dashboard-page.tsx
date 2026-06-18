import { Link } from "@tanstack/react-router";
import { CalendarRange, ClipboardList, Clock, Send, Users } from "lucide-react";
import { useTenantSlug } from "@/lib/hooks/use-tenant-api";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/spinner";
import { OrdersTable } from "@/components/admin/orders-table";
import { useDashboardStats } from "@/lib/hooks/use-dashboard";
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

  // Match the dashboard API's date windows: today = local midnight, this week =
  // the last 7 days. Format as local YYYY-MM-DD for the orders date filters.
  const toDateInput = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

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
      href: `/k/${slug}/admin/orders?dateFrom=${toDateInput(today)}`,
    },
    {
      label: "Εκκρεμείς",
      value: stats.pendingOrders,
      icon: Clock,
      tint: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
      href: `/k/${slug}/admin/orders?status=pending`,
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
      href: `/k/${slug}/admin/orders?dateFrom=${toDateInput(weekAgo)}`,
    },
    {
      label: "Πελάτες",
      value: stats.totalCustomers,
      icon: Users,
      tint: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
      href: `/k/${slug}/admin/customers`,
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
            to="/k/$slug/admin/orders"
            params={{ slug }}
            className="text-sm font-medium text-primary hover:underline"
          >
            Προβολή όλων
          </Link>
        </div>

        <div className="mt-4">
          <OrdersTable orders={stats.recentOrders} emptyMessage="Δεν υπάρχουν παραγγελίες" />
        </div>
      </div>
    </div>
  );
}
