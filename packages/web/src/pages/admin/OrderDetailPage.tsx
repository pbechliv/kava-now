import { useState } from "react";
import { useParams, Link } from "react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Spinner } from "@/components/spinner";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { useAdminOrder, useUpdateOrderStatus } from "@/lib/hooks/use-admin-orders";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@kava-now/shared";

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export function OrderDetailPage() {
  const { id, slug } = useParams<{ id: string; slug: string }>();
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
    return <div className="py-12 text-center text-muted-foreground">Η παραγγελία δεν βρέθηκε</div>;
  }

  const allowedNext = ALLOWED_TRANSITIONS[order.status] ?? [];

  const handleStatusChange = () => {
    if (!selectedStatus || !id) return;
    updateStatus.mutate({ id, status: selectedStatus }, { onSuccess: () => setSelectedStatus("") });
  };

  return (
    <div className="space-y-6">
      <Link
        to={`/k/${slug}/admin/orders`}
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Πίσω στις παραγγελίες
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Παραγγελία #{order.id.slice(0, 8)}</h1>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {new Date(order.createdAt).toLocaleString("el-GR")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Πελάτης
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-medium">{order.customerName ?? "-"}</p>
            {order.customerPhone && (
              <p className="mt-1 text-sm text-muted-foreground">{order.customerPhone}</p>
            )}
            {order.customerEmail && (
              <p className="text-sm text-muted-foreground">{order.customerEmail}</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Αλλαγή Κατάστασης
            </CardTitle>
          </CardHeader>
          <CardContent>
            {allowedNext.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Δεν επιτρέπονται περαιτέρω αλλαγές κατάστασης
              </p>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Select
                  value={selectedStatus || undefined}
                  onValueChange={(v) => setSelectedStatus(v as OrderStatus)}
                >
                  <SelectTrigger className="w-full sm:w-56">
                    <SelectValue placeholder="Επιλέξτε..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedNext.map((s) => (
                      <SelectItem key={s} value={s}>
                        {ORDER_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleStatusChange}
                  disabled={!selectedStatus || updateStatus.isPending}
                  size="sm"
                >
                  {updateStatus.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Αλλαγή Κατάστασης
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold">Προϊόντα</h2>
        <Card className="mt-3 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Προϊόν</TableHead>
                  <TableHead className="text-center">Ποσότητα</TableHead>
                  <TableHead className="text-right">Τιμή</TableHead>
                  <TableHead className="text-right">Υποσύνολο</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.productName}</TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {item.quantity}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {Number(item.unitPrice).toFixed(2)}&nbsp;€
                    </TableCell>
                    <TableCell className="text-right">
                      {(Number(item.unitPrice) * item.quantity).toFixed(2)}&nbsp;€
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-semibold">
                    Σύνολο
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {Number(order.total).toFixed(2)}&nbsp;€
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </Card>
      </div>

      {order.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Σημειώσεις
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{order.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
