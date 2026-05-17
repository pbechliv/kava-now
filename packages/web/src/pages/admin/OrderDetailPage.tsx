import { useState } from "react";
import { useParams, Link } from "react-router";
import { ArrowLeft, ClipboardList, Copy, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Spinner } from "@/components/spinner";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { CopyField } from "@/components/copy-field";
import {
  useAdminOrder,
  useMarkOrderTransmitted,
  useUpdateOrderStatus,
  type AdminOrderDetail,
} from "@/lib/hooks/use-admin-orders";
import { copyToClipboard } from "@/lib/copy";
import { ERP_STATUS_LABELS, ORDER_STATUS_LABELS, type OrderStatus } from "@kava-now/shared";

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

function buildBillingBlock(order: AdminOrderDetail): string {
  const lines = [
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

function buildLinesTsv(order: AdminOrderDetail): string {
  return order.items
    .map((item) => {
      const code = item.erpRef ?? item.sku ?? "";
      return [code, item.quantity].join("\t");
    })
    .join("\n");
}

export function OrderDetailPage() {
  const { id, slug } = useParams<{ id: string; slug: string }>();
  const { data: order, isLoading } = useAdminOrder(id);
  const updateStatus = useUpdateOrderStatus();
  const markTransmitted = useMarkOrderTransmitted();
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | "">("");
  const [markInput, setMarkInput] = useState("");

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (!order) {
    return <div className="py-12 text-center text-muted-foreground">Η παραγγελία δεν βρέθηκε</div>;
  }

  const allowedNext = ALLOWED_TRANSITIONS[order.status] ?? [];

  const handleStatusChange = () => {
    if (!selectedStatus || !id) return;
    updateStatus.mutate({ id, status: selectedStatus }, { onSuccess: () => setSelectedStatus("") });
  };

  const handleMarkTransmitted = () => {
    if (!id || !markInput.trim()) return;
    markTransmitted.mutate({ id, mark: markInput.trim() }, { onSuccess: () => setMarkInput("") });
  };

  const isTransmitted = order.erpStatus === "transmitted";

  return (
    <div className="space-y-6">
      <Link
        to={`/k/${slug}/admin/orders`}
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Πίσω στις παραγγελίες
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Παραγγελία #{order.id.slice(0, 8)}</h1>
          <OrderStatusBadge status={order.status} />
          <Badge variant={isTransmitted ? "success" : "muted"}>
            ERP: {ERP_STATUS_LABELS[order.erpStatus]}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {new Date(order.createdAt).toLocaleString("el-GR")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Πελάτης
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-medium">{order.customerName ?? "-"}</p>
            {order.customerPhone && (
              <p className="mt-1 text-sm text-muted-foreground">{order.customerPhone}</p>
            )}
            {order.customerEmail && (
              <p className="text-sm text-muted-foreground">{order.customerEmail}</p>
            )}
          </CardContent>
        </Card>

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
                        {ORDER_STATUS_LABELS[s]}
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
      </div>

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

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Προϊόντα</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => copyToClipboard(buildLinesTsv(order), "Αντιγραφή γραμμών")}
          >
            <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
            Αντιγραφή γραμμών για ERP
          </Button>
        </div>
        <Card className="mt-3 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Προϊόν</TableHead>
                  <TableHead>Κωδικός ERP</TableHead>
                  <TableHead className="text-center">Ποσότητα</TableHead>
                  <TableHead className="text-right">Τιμή</TableHead>
                  <TableHead className="text-right">Υποσύνολο</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((item) => {
                  const code = item.erpRef ?? item.sku;
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.productName}</TableCell>
                      <TableCell className="text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs">{code ?? "—"}</span>
                          {code && (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => copyToClipboard(code, "Αντιγραφή κωδικού")}
                              aria-label="Αντιγραφή κωδικού"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground">
                        {item.quantity}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {Number(item.unitPrice).toFixed(2)}&nbsp;€
                      </TableCell>
                      <TableCell className="text-right">
                        {(Number(item.unitPrice) * item.quantity).toFixed(2)}&nbsp;€
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={4} className="text-right font-semibold">
                    Σύνολο
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {Number(order.total).toFixed(2)}&nbsp;€
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Διαβίβαση στο ERP
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isTransmitted ? (
            <div className="space-y-2 text-sm">
              <CopyField label="MARK" value={order.erpMark} />
              <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-muted-foreground sm:grid-cols-2">
                <div>
                  <span className="text-xs uppercase tracking-wide">Χρόνος διαβίβασης</span>
                  <p>
                    {order.erpTransmittedAt
                      ? new Date(order.erpTransmittedAt).toLocaleString("el-GR")
                      : "—"}
                  </p>
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
                  onClick={handleMarkTransmitted}
                  disabled={!markInput.trim() || markTransmitted.isPending}
                >
                  {markTransmitted.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Σήμανση ως διαβιβασμένη
                </Button>
              </div>
              {markTransmitted.error && (
                <p className="text-sm text-destructive">{markTransmitted.error.message}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {order.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Σημειώσεις
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{order.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
