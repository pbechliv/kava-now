import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useUpdateOrderPayment, type AdminOrderDetail } from "@/lib/hooks/use-admin-orders";
import { formatMoney, formatDateTime } from "@/lib/format";
import { PAYMENT_EXEMPT_STATUSES } from "@kava-now/shared";

// Records that the customer settled the order (#218). Deliberately independent
// of the fulfillment status and the ERP MARK: an order can be paid before it
// ships or transmitted long before it's paid. Marking paid is a single click
// because it's reversible; retracting goes through a confirm, since that's the
// step that silently puts money back on the customer's balance.
export function OrderPaymentCard({ order }: { order: AdminOrderDetail }) {
  const updatePayment = useUpdateOrderPayment();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const paid = order.paymentStatus === "paid";
  // Nothing is owed on a cancelled order, and the API rejects marking one paid.
  const exempt = PAYMENT_EXEMPT_STATUSES.includes(order.status);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Πληρωμή
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {paid ? (
          <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2">
            <div>
              <span className="text-xs uppercase tracking-wide">Εξοφλήθηκε</span>
              <p>{order.paidAt ? formatDateTime(order.paidAt) : "—"}</p>
            </div>
            <div>
              <span className="text-xs uppercase tracking-wide">Από</span>
              <p>{order.paidByName ?? order.paidByEmail ?? "—"}</p>
            </div>
          </div>
        ) : exempt ? (
          <p className="text-sm text-muted-foreground">
            Ακυρωμένη παραγγελία — δεν οφείλεται πληρωμή.
          </p>
        ) : (
          <p className="text-sm">
            <span className="text-muted-foreground">Οφειλόμενο ποσό: </span>
            <span className="font-medium">{formatMoney(order.total)}</span>
          </p>
        )}

        {updatePayment.isError && !confirmOpen && (
          <p className="text-sm text-destructive">
            {updatePayment.error?.message || "Σφάλμα κατά την ενημέρωση της πληρωμής"}
          </p>
        )}

        {paid ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={updatePayment.isPending}
            onClick={() => {
              updatePayment.reset();
              setConfirmOpen(true);
            }}
          >
            Αναίρεση εξόφλησης
          </Button>
        ) : (
          !exempt && (
            <Button
              type="button"
              size="sm"
              disabled={updatePayment.isPending}
              onClick={() =>
                updatePayment.mutate(
                  { id: order.id, paymentStatus: "paid" },
                  { onSuccess: () => toast.success("Η παραγγελία σημάνθηκε ως εξοφλημένη") },
                )
              }
            >
              {updatePayment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Σήμανση ως εξοφλημένη
            </Button>
          )
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        title="Αναίρεση εξόφλησης"
        description="Η παραγγελία θα επιστρέψει σε ανεξόφλητη και θα προσμετρηθεί ξανά στο υπόλοιπο του πελάτη."
        confirmLabel="Αναίρεση εξόφλησης"
        pending={updatePayment.isPending}
        error={updatePayment.error?.message}
        onConfirm={() =>
          updatePayment.mutate(
            { id: order.id, paymentStatus: "unpaid" },
            {
              onSuccess: () => {
                setConfirmOpen(false);
                toast.success("Η εξόφληση αναιρέθηκε");
              },
            },
          )
        }
        onClose={() => setConfirmOpen(false)}
      />
    </Card>
  );
}
