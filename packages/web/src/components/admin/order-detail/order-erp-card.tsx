import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CopyField } from "@/components/copy-field";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  useCorrectOrderMark,
  useMarkOrderTransmitted,
  type AdminOrderDetail,
} from "@/lib/hooks/use-admin-orders";
import { useAuth } from "@/lib/hooks/use-auth";
import { formatDateTime } from "@/lib/format";

// The AADE MARK is numeric — strip everything else as it's typed/pasted so the
// input can never hold what the server will reject ("μόνο αριθμοί").
const digitsOnly = (v: string) => v.replace(/\D/g, "");

export function OrderErpCard({ order }: { order: AdminOrderDetail }) {
  const { currentMembership, user } = useAuth();
  // Correcting a locked fiscal MARK is owner/superadmin-only (mirrors the API,
  // where superadmins carry a synthetic owner membership).
  const canCorrect = currentMembership?.role === "owner" || !!user?.isSuperAdmin;

  const markTransmitted = useMarkOrderTransmitted();
  const [markInput, setMarkInput] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const correctMark = useCorrectOrderMark();
  const [correcting, setCorrecting] = useState(false);
  const [correctMarkInput, setCorrectMarkInput] = useState("");
  const [correctReason, setCorrectReason] = useState("");
  const [correctConfirmOpen, setCorrectConfirmOpen] = useState(false);

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

  const handleCorrectMark = () => {
    const mark = correctMarkInput.trim();
    const reason = correctReason.trim();
    if (!mark || !reason) return;
    correctMark.mutate(
      { id: order.id, mark, reason },
      {
        onSuccess: () => {
          setCorrectConfirmOpen(false);
          setCorrecting(false);
          setCorrectMarkInput("");
          setCorrectReason("");
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
          <div className="space-y-3 text-sm">
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

            {order.erpMarkCorrectedAt && (
              <Alert variant="warning" icon={<AlertTriangle />}>
                <p className="font-medium">Το MARK διορθώθηκε</p>
                <p>
                  {formatDateTime(order.erpMarkCorrectedAt)} ·{" "}
                  {order.erpMarkCorrectedByName ?? order.erpMarkCorrectedByEmail ?? "—"}
                </p>
                {order.erpMarkCorrectionReason && (
                  <p className="italic">«{order.erpMarkCorrectionReason}»</p>
                )}
              </Alert>
            )}

            {canCorrect &&
              (correcting ? (
                <div className="space-y-3 rounded-md border border-border p-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="correct-mark">Νέο MARK</Label>
                    <Input
                      id="correct-mark"
                      placeholder="MARK"
                      inputMode="numeric"
                      value={correctMarkInput}
                      onChange={(e) => setCorrectMarkInput(digitsOnly(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="correct-reason">Λόγος διόρθωσης</Label>
                    <Textarea
                      id="correct-reason"
                      placeholder="Γιατί διορθώνεται το MARK;"
                      maxLength={500}
                      value={correctReason}
                      onChange={(e) => setCorrectReason(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        correctMark.reset();
                        setCorrectConfirmOpen(true);
                      }}
                      disabled={!correctMarkInput.trim() || !correctReason.trim()}
                    >
                      Καταχώρηση διόρθωσης
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setCorrecting(false);
                        setCorrectMarkInput("");
                        setCorrectReason("");
                      }}
                    >
                      Άκυρο
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setCorrecting(true)}
                >
                  Διόρθωση MARK
                </Button>
              ))}
          </div>
        ) : (
          <div className="space-y-3">
            {hasErpGaps && (
              <Alert variant="warning" icon={<AlertTriangle />}>
                <p className="font-medium">Λείπουν κωδικοί ERP</p>
                <p>Η παραγγελία μπορεί να διαβιβαστεί, αλλά το παραστατικό ίσως είναι ελλιπές:</p>
                <ul className="list-disc space-y-0.5 pl-4">
                  {customerMissingErpRef && <li>Ο πελάτης δεν έχει κωδικό ERP.</li>}
                  {linesMissingErpRef.map((item) => (
                    <li key={item.id}>{item.productName} — χωρίς κωδικό ERP</li>
                  ))}
                </ul>
              </Alert>
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
                onChange={(e) => setMarkInput(digitsOnly(e.target.value))}
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
              <span className="mt-2 block font-medium text-warning">
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

      <ConfirmDialog
        open={correctConfirmOpen}
        title="Διόρθωση MARK"
        description={
          <>
            Το MARK της παραγγελίας θα αλλάξει σε{" "}
            <span className="font-medium text-foreground">{correctMarkInput.trim()}</span>. Η
            διόρθωση καταγράφεται με τον λόγο που δώσατε και το ποιος την έκανε.
          </>
        }
        confirmLabel="Καταχώρηση διόρθωσης"
        pending={correctMark.isPending}
        error={correctMark.error?.message}
        onConfirm={handleCorrectMark}
        onClose={() => setCorrectConfirmOpen(false)}
      />
    </Card>
  );
}
