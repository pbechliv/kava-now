import { ClipboardList } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/copy-field";
import { copyToClipboard } from "@/lib/copy";
import type { AdminOrderDetail } from "@/lib/hooks/use-admin-orders";

function buildBillingBlock(order: AdminOrderDetail): string {
  const lines = [
    order.customerErpRef && `Κωδικός ERP: ${order.customerErpRef}`,
    order.customerName && `Επωνυμία: ${order.customerName}`,
    order.customerVatId && `ΑΦΜ: ${order.customerVatId}`,
    order.customerTaxOffice && `ΔΟΥ: ${order.customerTaxOffice}`,
    order.customerProfession && `Επάγγελμα: ${order.customerProfession}`,
    order.customerBillingAddress && `Διεύθυνση χρέωσης: ${order.customerBillingAddress}`,
    order.customerPhone && `Τηλέφωνο: ${order.customerPhone}`,
    order.customerEmail && `Email: ${order.customerEmail}`,
  ].filter(Boolean);
  return lines.join("\n");
}

export function OrderBillingCard({ order }: { order: AdminOrderDetail }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Στοιχεία τιμολόγησης
        </CardTitle>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => copyToClipboard(buildBillingBlock(order), "Αντιγραφή στοιχείων")}
        >
          <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
          Αντιγραφή όλων
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <CopyField label="Κωδικός ERP" value={order.customerErpRef} />
          <CopyField label="Επωνυμία" value={order.customerName} />
          <CopyField label="ΑΦΜ" value={order.customerVatId} />
          <CopyField label="ΔΟΥ" value={order.customerTaxOffice} />
          <CopyField label="Επάγγελμα" value={order.customerProfession} />
          <CopyField label="Διεύθυνση χρέωσης" value={order.customerBillingAddress} />
          <CopyField label="Τηλέφωνο" value={order.customerPhone} />
          <CopyField label="Email" value={order.customerEmail} />
        </div>
      </CardContent>
    </Card>
  );
}
