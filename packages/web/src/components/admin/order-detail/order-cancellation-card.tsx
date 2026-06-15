import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useResolveCancellationRequest, type AdminOrderDetail } from "@/lib/hooks/use-admin-orders";

// Shown only while an order sits in `cancellation_requested` — the customer asked
// to cancel a confirmed order and staff must approve (→ cancelled) or reject
// (→ back to confirmed).
export function OrderCancellationCard({ order }: { order: AdminOrderDetail }) {
  const resolve = useResolveCancellationRequest(order.id);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <Card className="border-warning/40 bg-warning/10 lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Αίτημα ακύρωσης
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">Ο πελάτης ζήτησε την ακύρωση αυτής της παραγγελίας.</p>
        {resolve.isError && (
          <p className="text-sm text-destructive">
            {resolve.error?.message || "Σφάλμα κατά την επεξεργασία του αιτήματος"}
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="destructive"
            size="sm"
            disabled={resolve.isPending}
            onClick={() => {
              resolve.reset();
              setConfirmOpen(true);
            }}
          >
            {resolve.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Έγκριση ακύρωσης
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={resolve.isPending}
            onClick={() => resolve.mutate({ decision: "reject" })}
          >
            Απόρριψη
          </Button>
        </div>
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        title="Έγκριση ακύρωσης"
        description="Η παραγγελία θα ακυρωθεί οριστικά. Η ενέργεια δεν αναιρείται."
        confirmLabel="Έγκριση ακύρωσης"
        pending={resolve.isPending}
        error={resolve.error?.message}
        onConfirm={() =>
          resolve.mutate({ decision: "approve" }, { onSuccess: () => setConfirmOpen(false) })
        }
        onClose={() => setConfirmOpen(false)}
      />
    </Card>
  );
}
