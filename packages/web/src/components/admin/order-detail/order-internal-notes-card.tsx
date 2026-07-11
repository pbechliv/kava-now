import { useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { useUpdateOrderInternalNotes, type AdminOrderDetail } from "@/lib/hooks/use-admin-orders";

// Staff/owner-only note. Never reaches the customer-facing endpoints, so it is
// safe to surface (and edit) here regardless of the order's ERP/fulfillment lock.
export function OrderInternalNotesCard({ order }: { order: AdminOrderDetail }) {
  const updateNotes = useUpdateOrderInternalNotes();
  const [value, setValue] = useState(order.internalNotes ?? "");

  const dirty = value.trim() !== (order.internalNotes ?? "").trim();

  const handleSave = () => {
    updateNotes.mutate(
      { id: order.id, internalNotes: value.trim() || null },
      { onSuccess: () => toast.success("Η εσωτερική σημείωση αποθηκεύτηκε") },
    );
  };

  return (
    <Card>
      <UnsavedChangesGuard when={dirty} />
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Lock className="size-3.5" />
          Εσωτερική σημείωση
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Ορατή μόνο στο προσωπικό — όχι στον πελάτη.</p>
        <Textarea
          rows={3}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Προσθέστε εσωτερική σημείωση..."
        />
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={!dirty || updateNotes.isPending}
          >
            {updateNotes.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Αποθήκευση
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
