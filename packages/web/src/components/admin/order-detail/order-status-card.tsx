import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { useUpdateOrderStatus, type AdminOrderDetail } from "@/lib/hooks/use-admin-orders";
import { ORDER_STATUS_TRANSITIONS, type OrderStatus } from "@kava-now/shared";

export function OrderStatusCard({ order }: { order: AdminOrderDetail }) {
  const updateStatus = useUpdateOrderStatus();
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | "">("");

  const allowedNext = ORDER_STATUS_TRANSITIONS[order.status] ?? [];

  const handleStatusChange = () => {
    if (!selectedStatus) return;
    updateStatus.mutate(
      { id: order.id, status: selectedStatus },
      { onSuccess: () => setSelectedStatus("") },
    );
  };

  return (
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
                    <OrderStatusBadge status={s} />
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
  );
}
