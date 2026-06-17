import { useState } from "react";
import { AlertTriangle } from "lucide-react";
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

  // The erpRef on each product is the code carried into Galaxy/AADE. Transmitting
  // an order whose active lines (or the customer) lack one yields an incomplete
  // παραστατικό — and the order is hard-locked afterwards, so the mistake is
  // unrecoverable in-app. Surface it before they commit.
  const linesMissingErpRef = order.items.filter((item) => item.status === "active" && !item.erpRef);
  const customerMissingErpRef = !order.customerErpRef;
  const hasErpGaps = linesMissingErpRef.length > 0 || customerMissingErpRef;

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
          <div className="space-y-3">
            {hasErpGaps && (
              <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <div className="space-y-1">
                  <p className="font-medium">Λείπουν κωδικοί ERP</p>
                  <p>Η παραγγελία μπορεί να διαβιβαστεί, αλλά το παραστατικό ίσως είναι ελλιπές:</p>
                  <ul className="list-disc space-y-0.5 pl-4">
                    {customerMissingErpRef && <li>Ο πελάτης δεν έχει κωδικό ERP.</li>}
                    {linesMissingErpRef.map((item) => (
                      <li key={item.id}>{item.productName} — χωρίς κωδικό ERP</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Όταν καταχωρήσετε το παραστατικό στο Galaxy, καταγράψτε εδώ το MARK που επιστρέφει η
              ΑΑΔΕ (μόνο αριθμοί, χωρίς κενά).
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                className="sm:w-72"
                placeholder="MARK"
                inputMode="numeric"
                value={markInput}
                onChange={(e) => setMarkInput(e.target.value.replace(/\s+/g, ""))}
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
            {hasErpGaps && (
              <span className="mt-2 block font-medium text-amber-700 dark:text-amber-400">
                Προσοχή: {linesMissingErpRef.length > 0 && `${linesMissingErpRef.length} γραμμές `}
                {linesMissingErpRef.length > 0 && customerMissingErpRef && "και "}
                {customerMissingErpRef && "ο πελάτης "}
                χωρίς κωδικό ERP.
              </span>
            )}
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
