import { useParams, useNavigate } from "react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { useCustomerOrder, useReorder } from "@/lib/hooks/use-customer-orders";
import type { OrderStatus } from "@kava-now/shared";

export function OrderDetailPage() {
  const { id, slug } = useParams<{ id: string; slug: string }>();
  const navigate = useNavigate();
  const base = `/k/${slug}`;
  const { data: order, isLoading } = useCustomerOrder(id);
  const reorder = useReorder(id || "");

  const handleReorder = () => {
    reorder.mutate(undefined, {
      onSuccess: (data) => {
        void navigate(`${base}/orders/${data.order.id}`);
      },
    });
  };

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Φόρτωση...</div>;
  }

  if (!order) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Η παραγγελία δεν βρέθηκε.
      </div>
    );
  }

  const total = order.items.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0);

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => navigate(`${base}/orders`)}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Πίσω στο ιστορικό
      </button>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Παραγγελία #{order.id.slice(0, 8)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {new Date(order.createdAt).toLocaleDateString("el-GR", {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <OrderStatusBadge status={order.status as OrderStatus} />
          <Button onClick={handleReorder} disabled={reorder.isPending}>
            {reorder.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {reorder.isPending ? "Δημιουργία..." : "Επαναπαραγγελία"}
          </Button>
        </div>
      </div>

      {reorder.isError && (
        <p className="text-sm text-destructive">
          {reorder.error?.message || "Σφάλμα κατά την επαναπαραγγελία"}
        </p>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Προϊόν</TableHead>
                <TableHead className="text-center">Ποσότητα</TableHead>
                <TableHead className="text-right">Τιμή μονάδας</TableHead>
                <TableHead className="text-right">Σύνολο</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.productName}</TableCell>
                  <TableCell className="text-center">{item.quantity}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {Number(item.unitPrice).toFixed(2)}&nbsp;€
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {(Number(item.unitPrice) * item.quantity).toFixed(2)}&nbsp;€
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="text-right font-bold">
                  Σύνολο:
                </TableCell>
                <TableCell className="text-right font-bold">{total.toFixed(2)}&nbsp;€</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </Card>

      {order.notes && (
        <Card className="p-4">
          <h3 className="text-sm font-medium">Σημειώσεις</h3>
          <p className="mt-1 text-sm text-muted-foreground">{order.notes}</p>
        </Card>
      )}
    </div>
  );
}
