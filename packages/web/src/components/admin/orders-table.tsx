import { Link, useNavigate } from "react-router";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MobileList, MobileListItem } from "@/components/ui/mobile-list";
import { Badge } from "@/components/ui/badge";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { useTenantSlug } from "@/lib/hooks/use-tenant-api";
import { formatMoney, formatDate } from "@/lib/format";
import { ERP_STATUS_LABELS, type ErpStatus, type OrderStatus } from "@kava-now/shared";

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

// Shared row/card rendering for order lists. Both the admin orders list and the
// dashboard's recent-orders panel render from this so clicking a row (desktop)
// or card (mobile) navigates to the order detail page.
export function OrdersTable({
  orders,
  emptyMessage,
  showId = false,
  showErp = false,
  showActions = false,
}: OrdersTableProps) {
  const navigate = useNavigate();
  const slug = useTenantSlug();
  const adminBase = `/k/${slug}/admin`;
  const open = (id: string) => navigate(`${adminBase}/orders/${id}`);

  const colSpan = 5 + (showId ? 1 : 0) + (showErp ? 1 : 0) + (showActions ? 1 : 0);

  return (
    <Card className="overflow-hidden">
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {showId && <TableHead>#</TableHead>}
              <TableHead>Πελάτης</TableHead>
              <TableHead>Ημερομηνία</TableHead>
              <TableHead className="text-center">Προϊόντα</TableHead>
              <TableHead className="text-right">Σύνολο</TableHead>
              <TableHead>Κατάσταση</TableHead>
              {showErp && <TableHead>ERP</TableHead>}
              {showActions && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-8 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => (
                <TableRow key={order.id} className="cursor-pointer" onClick={() => open(order.id)}>
                  {showId && (
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {order.id.slice(0, 8)}
                    </TableCell>
                  )}
                  <TableCell className="font-medium">{order.customerName ?? "-"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(order.createdAt)}
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">
                    {order.itemCount}
                  </TableCell>
                  <TableCell className="text-right">{formatMoney(order.total)}</TableCell>
                  <TableCell>
                    <OrderStatusBadge status={order.status} />
                  </TableCell>
                  {showErp && (
                    <TableCell>
                      {order.erpStatus && (
                        <Badge variant={order.erpStatus === "transmitted" ? "success" : "muted"}>
                          {ERP_STATUS_LABELS[order.erpStatus]}
                        </Badge>
                      )}
                    </TableCell>
                  )}
                  {showActions && (
                    <TableCell className="text-right">
                      <Link
                        to={`${adminBase}/orders/${order.id}`}
                        className="text-sm font-medium text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Προβολή
                      </Link>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {orders.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground md:hidden">{emptyMessage}</p>
      ) : (
        <MobileList>
          {orders.map((order) => (
            <MobileListItem
              key={order.id}
              className="cursor-pointer transition-colors hover:bg-muted/50"
              onClick={() => open(order.id)}
            >
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
                {showErp && order.erpStatus && (
                  <Badge variant={order.erpStatus === "transmitted" ? "success" : "muted"}>
                    {ERP_STATUS_LABELS[order.erpStatus]}
                  </Badge>
                )}
              </div>
            </MobileListItem>
          ))}
        </MobileList>
      )}
    </Card>
  );
}
