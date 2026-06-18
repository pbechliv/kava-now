import { Link, useNavigate } from "@tanstack/react-router";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { ErpStatusBadge } from "@/components/admin/erp-status-badge";
import { ResponsiveTable, type ResponsiveTableColumn } from "@/components/ui/responsive-table";
import { useTenantSlug } from "@/lib/hooks/use-tenant-api";
import { formatMoney, formatDate } from "@/lib/format";
import type { ErpStatus, OrderStatus } from "@kava-now/shared";

export interface OrdersTableOrder {
  id: string;
  status: OrderStatus;
  createdAt: string;
  customerName: string | null;
  itemCount: number;
  total: number;
  // Only the full admin orders list surfaces ERP status.
  erpStatus?: ErpStatus;
}

interface OrdersTableProps {
  orders: OrdersTableOrder[];
  emptyMessage: string;
  // The compact dashboard variant hides these; the full orders list shows them.
  showId?: boolean;
  showErp?: boolean;
  showActions?: boolean;
}

// Both the admin orders list and the dashboard's recent-orders panel render
// from this so clicking a row (desktop) or card (mobile) opens the order.
export function OrdersTable({
  orders,
  emptyMessage,
  showId = false,
  showErp = false,
  showActions = false,
}: OrdersTableProps) {
  const navigate = useNavigate();
  const slug = useTenantSlug();

  const columns: ResponsiveTableColumn<OrdersTableOrder>[] = [
    ...(showId
      ? [
          {
            header: "#",
            cellClassName: "font-mono text-xs text-muted-foreground",
            cell: (order: OrdersTableOrder) => order.id.slice(0, 8),
          },
        ]
      : []),
    {
      header: "Πελάτης",
      cellClassName: "font-medium",
      cell: (order) => order.customerName ?? "-",
    },
    {
      header: "Ημερομηνία",
      cellClassName: "text-muted-foreground",
      cell: (order) => formatDate(order.createdAt),
    },
    {
      header: "Προϊόντα",
      headClassName: "text-center",
      cellClassName: "text-center text-muted-foreground",
      cell: (order) => order.itemCount,
    },
    {
      header: "Σύνολο",
      headClassName: "text-right",
      cellClassName: "text-right",
      cell: (order) => formatMoney(order.total),
    },
    {
      header: "Κατάσταση",
      cell: (order) => <OrderStatusBadge status={order.status} />,
    },
    ...(showErp
      ? [
          {
            header: "ERP",
            cell: (order: OrdersTableOrder) =>
              order.erpStatus ? <ErpStatusBadge status={order.erpStatus} /> : null,
          },
        ]
      : []),
    ...(showActions
      ? [
          {
            header: undefined,
            cellClassName: "text-right",
            cell: (order: OrdersTableOrder) => (
              <Link
                to="/k/$slug/admin/orders/$id"
                params={{ slug, id: order.id }}
                className="text-sm font-medium text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Προβολή
              </Link>
            ),
          },
        ]
      : []),
  ];

  return (
    <ResponsiveTable
      data={orders}
      columns={columns}
      getRowKey={(order) => order.id}
      emptyMessage={emptyMessage}
      onRowClick={(order) =>
        navigate({ to: "/k/$slug/admin/orders/$id", params: { slug, id: order.id } })
      }
      renderMobileItem={(order) => (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium">{order.customerName ?? "-"}</div>
              <div className="text-sm text-muted-foreground">
                {showId && (
                  <>
                    <span className="font-mono text-xs">#{order.id.slice(0, 8)}</span> ·{" "}
                  </>
                )}
                {formatDate(order.createdAt)} · {order.itemCount} προϊόντα
              </div>
            </div>
            <div className="shrink-0 font-medium">{formatMoney(order.total)}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} />
            {showErp && order.erpStatus && <ErpStatusBadge status={order.erpStatus} />}
          </div>
        </>
      )}
    />
  );
}
