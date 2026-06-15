import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyField } from "@/components/copy-field";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useMarkOrderTransmitted, type AdminOrderDetail } from "@/lib/hooks/use-admin-orders";
import { formatDateTime } from "@/lib/format";

export function OrderErpCard({ order }: { order: AdminOrderDetail }) {
  const markTransmitted = useMarkOrderTransmitted();
  const [markInput, setMarkInput] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleMarkTransmitted = () => {
    const mark = markInput.trim();
    if (!mark) return;
    markTransmitted.mutate(
      { id: order.id, mark },
      {
        onSuccess: () => {
          setConfirmOpen(false);
          setMarkInput("");
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Διαβίβαση στο ERP
        </CardTitle>
      </CardHeader>
      <CardContent>
        {order.erpStatus === "transmitted" ? (
          <div className="space-y-2 text-sm">
            <CopyField label="MARK" value={order.erpMark} />
            <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-muted-foreground sm:grid-cols-2">
              <div>
                <span className="text-xs uppercase tracking-wide">Χρόνος διαβίβασης</span>
                <p>{order.erpTransmittedAt ? formatDateTime(order.erpTransmittedAt) : "—"}</p>
              </div>
              <div>
                <span className="text-xs uppercase tracking-wide">Από</span>
                <p>{order.erpTransmittedByName ?? order.erpTransmittedByEmail ?? "—"}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Όταν καταχωρήσετε το παραστατικό στο Galaxy, καταγράψτε εδώ το MARK που επιστρέφει η
              ΑΑΔΕ.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                className="sm:w-72"
                placeholder="MARK"
                value={markInput}
                onChange={(e) => setMarkInput(e.target.value)}
              />
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  markTransmitted.reset();
                  setConfirmOpen(true);
                }}
                disabled={!markInput.trim()}
              >
                Σήμανση ως διαβιβασμένη
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        title="Διαβίβαση στο ERP"
        description={
          <>
            Η παραγγελία θα σημανθεί ως διαβιβασμένη με MARK{" "}
            <span className="font-medium text-foreground">{markInput.trim()}</span>. Η ενέργεια
            είναι μη αναστρέψιμη και κλειδώνει την παραγγελία — δεν θα μπορείτε πλέον να προσθέσετε
            ή να επεξεργαστείτε προϊόντα.
          </>
        }
        confirmLabel="Σήμανση ως διαβιβασμένη"
        pending={markTransmitted.isPending}
        error={markTransmitted.error?.message}
        onConfirm={handleMarkTransmitted}
        onClose={() => setConfirmOpen(false)}
      />
    </Card>
  );
}
