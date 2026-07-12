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
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useUpdateOrderStatus, type AdminOrderDetail } from "@/lib/hooks/use-admin-orders";
import { ORDER_STATUS_LABELS, ORDER_STATUS_TRANSITIONS, type OrderStatus } from "@kava-now/shared";

/**
 * A transition is irreversible when the target status allows no further
 * transitions (`cancelled`, `delivered`) — a fat-fingered pick there is
 * unrecoverable, so it goes through a confirm dialog like line-cancel and
 * ERP-transmit do.
 */
function isTerminalStatus(status: OrderStatus): boolean {
  return (ORDER_STATUS_TRANSITIONS[status] ?? []).length === 0;
}

export function OrderStatusCard({ order }: { order: AdminOrderDetail }) {
  const updateStatus = useUpdateOrderStatus();
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | "">("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const allowedNext = ORDER_STATUS_TRANSITIONS[order.status] ?? [];

  const applyStatusChange = () => {
    if (!selectedStatus) return;
    updateStatus.mutate(
      { id: order.id, status: selectedStatus },
      {
        onSuccess: () => {
          setConfirmOpen(false);
          setSelectedStatus("");
        },
      },
    );
  };

  const handleStatusChange = () => {
    if (!selectedStatus) return;
    if (isTerminalStatus(selectedStatus)) {
      updateStatus.reset();
      setConfirmOpen(true);
      return;
    }
    applyStatusChange();
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
              items={allowedNext.map((s) => ({ value: s, label: <OrderStatusBadge status={s} /> }))}
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

      <ConfirmDialog
        open={confirmOpen}
        title="Αλλαγή κατάστασης"
        description={
          selectedStatus ? (
            <>
              Η κατάσταση της παραγγελίας θα αλλάξει σε{" "}
              <span className="font-medium text-foreground">
                {ORDER_STATUS_LABELS[selectedStatus]}
              </span>
              . Η ενέργεια είναι μη αναστρέψιμη — δεν θα επιτρέπονται περαιτέρω αλλαγές κατάστασης.
            </>
          ) : null
        }
        confirmLabel="Αλλαγή Κατάστασης"
        pending={updateStatus.isPending}
        error={updateStatus.error?.message}
        onConfirm={applyStatusChange}
        onClose={() => setConfirmOpen(false)}
      />
    </Card>
  );
}
