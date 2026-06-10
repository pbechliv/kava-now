import { useState } from "react";
import { useParams, Link } from "react-router";
import { ArrowLeft, ClipboardList, Copy, Loader2, MoreHorizontal, Plus } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/spinner";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { CopyField } from "@/components/copy-field";
import {
  useAdminOrder,
  useMarkOrderTransmitted,
  useUpdateOrderStatus,
  useCancelOrderItem,
  useUpdateOrderItem,
  type AdminOrderDetail,
  type AdminOrderItem,
} from "@/lib/hooks/use-admin-orders";
import { copyToClipboard } from "@/lib/copy";
import { ERP_STATUS_LABELS, ORDER_STATUS_LABELS, type OrderStatus } from "@kava-now/shared";
import { OrderItemDialog } from "@/components/admin/OrderItemDialog";

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

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

function buildLinesTsv(order: AdminOrderDetail): string {
  return order.items
    .filter((item) => item.status === "active")
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
  const updateItem = useUpdateOrderItem(id ?? "");
  const cancelItem = useCancelOrderItem(id ?? "");
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | "">("");
  const [markInput, setMarkInput] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingQty, setEditingQty] = useState<number>(1);
  const [replaceTarget, setReplaceTarget] = useState<AdminOrderItem | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AdminOrderItem | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

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
  const isMutableStatus = order.status === "pending" || order.status === "confirmed";
  const canEditItems = isMutableStatus && !isTransmitted && !showOriginal;
  const originalItems = order.items.filter((i) => i.originalQuantity != null);
  const originalTotal =
    originalItems.reduce(
      (sum, i) => sum + Math.round(Number(i.unitPrice) * 100) * (i.originalQuantity ?? 0),
      0,
    ) / 100;
  const hasModifications = order.items.some(
    (i) =>
      i.status === "cancelled" ||
      i.originalQuantity == null ||
      (i.originalQuantity != null && i.originalQuantity !== i.quantity),
  );
  const replacementMap = new Map<string, AdminOrderItem>();
  for (const item of order.items) {
    if (item.status === "cancelled" && item.replacedByItemId) {
      const next = order.items.find((i) => i.id === item.replacedByItemId);
      if (next) replacementMap.set(item.id, next);
    }
  }

  const beginEditQty = (item: AdminOrderItem) => {
    setEditingItemId(item.id);
    setEditingQty(item.quantity);
  };
  const cancelEditQty = () => {
    setEditingItemId(null);
  };
  const saveEditQty = (itemId: string) => {
    if (editingQty < 1) return;
    updateItem.mutate(
      { itemId, quantity: editingQty },
      { onSuccess: () => setEditingItemId(null) },
    );
  };

  const confirmCancel = () => {
    if (!cancelTarget) return;
    cancelItem.mutate({ itemId: cancelTarget.id }, { onSuccess: () => setCancelTarget(null) });
  };

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

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            {showOriginal ? "Αρχική παραγγελία" : "Προϊόντα"}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {hasModifications && (
              <Button
                type="button"
                variant={showOriginal ? "default" : "outline"}
                size="sm"
                onClick={() => setShowOriginal((v) => !v)}
              >
                {showOriginal ? "Τρέχουσα παραγγελία" : "Αρχική παραγγελία"}
              </Button>
            )}
            {canEditItems && (
              <Button type="button" size="sm" onClick={() => setShowAdd(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Προσθήκη προϊόντος
              </Button>
            )}
            {!showOriginal && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(buildLinesTsv(order), "Αντιγραφή γραμμών")}
              >
                <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
                Αντιγραφή γραμμών για ERP
              </Button>
            )}
          </div>
        </div>
        {showOriginal && (
          <p className="mt-2 text-sm text-muted-foreground">
            Όπως καταχωρήθηκε αρχικά από τον πελάτη — χωρίς τροποποιήσεις του διαχειριστή.
          </p>
        )}
        {!showOriginal && !canEditItems && isMutableStatus && (
          <p className="mt-2 text-sm text-muted-foreground">
            Η παραγγελία έχει διαβιβαστεί στο ERP — οι γραμμές δεν τροποποιούνται.
          </p>
        )}
        <Card className="mt-3 overflow-hidden">
          <div className="overflow-x-auto">
            {showOriginal ? (
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
                  {originalItems.map((item) => {
                    const code = item.erpRef ?? item.sku;
                    const qty = item.originalQuantity ?? 0;
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.productName}</TableCell>
                        <TableCell className="text-muted-foreground">
                          <span className="font-mono text-xs">{code ?? "—"}</span>
                        </TableCell>
                        <TableCell className="text-center">{qty}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {Number(item.unitPrice).toFixed(2)}&nbsp;€
                        </TableCell>
                        <TableCell className="text-right">
                          {(Number(item.unitPrice) * qty).toFixed(2)}&nbsp;€
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
                      {originalTotal.toFixed(2)}&nbsp;€
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Προϊόν</TableHead>
                    <TableHead>Κωδικός ERP</TableHead>
                    <TableHead className="text-center">Ποσότητα</TableHead>
                    <TableHead className="text-right">Τιμή</TableHead>
                    <TableHead className="text-right">Υποσύνολο</TableHead>
                    {canEditItems && <TableHead className="w-12" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item) => {
                    const code = item.erpRef ?? item.sku;
                    const isCancelled = item.status === "cancelled";
                    const isEditing = editingItemId === item.id;
                    const replacement = replacementMap.get(item.id);
                    const isAdminAdded = item.originalQuantity == null;
                    const qtyChanged =
                      item.originalQuantity != null && item.originalQuantity !== item.quantity;
                    const rowClass = isCancelled ? "text-muted-foreground" : "";
                    const nameClass = isCancelled ? "font-medium line-through" : "font-medium";
                    return (
                      <TableRow key={item.id} className={rowClass}>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className={nameClass}>{item.productName}</span>
                              {isCancelled && (
                                <Badge variant="muted" className="text-[10px]">
                                  Ακυρωμένο
                                </Badge>
                              )}
                              {!isCancelled && isAdminAdded && (
                                <Badge variant="secondary" className="text-[10px]">
                                  Προστέθηκε
                                </Badge>
                              )}
                            </div>
                            {replacement && (
                              <span className="text-xs text-muted-foreground">
                                → Αντικαταστάθηκε με{" "}
                                <span className="font-medium">{replacement.productName}</span>
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <span
                              className={
                                isCancelled ? "font-mono text-xs line-through" : "font-mono text-xs"
                              }
                            >
                              {code ?? "—"}
                            </span>
                            {code && !isCancelled && (
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
                        <TableCell className="text-center">
                          {isEditing ? (
                            <div className="flex items-center justify-center gap-1">
                              <Input
                                type="number"
                                min={1}
                                value={editingQty}
                                onChange={(e) => setEditingQty(Math.max(1, Number(e.target.value)))}
                                className="h-8 w-20 text-center"
                              />
                              <Button
                                size="sm"
                                variant="default"
                                disabled={updateItem.isPending}
                                onClick={() => saveEditQty(item.id)}
                              >
                                {updateItem.isPending ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  "OK"
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label="Ακύρωση επεξεργασίας"
                                onClick={cancelEditQty}
                              >
                                ✕
                              </Button>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className={isCancelled ? "line-through" : ""}>
                                {item.quantity}
                              </span>
                              {qtyChanged && !isCancelled && (
                                <span className="text-[10px] text-muted-foreground">
                                  Αρχικά: {item.originalQuantity}
                                </span>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell
                          className={
                            isCancelled
                              ? "text-right text-muted-foreground line-through"
                              : "text-right text-muted-foreground"
                          }
                        >
                          {Number(item.unitPrice).toFixed(2)}&nbsp;€
                        </TableCell>
                        <TableCell
                          className={isCancelled ? "text-right line-through" : "text-right"}
                        >
                          {(Number(item.unitPrice) * item.quantity).toFixed(2)}&nbsp;€
                        </TableCell>
                        {canEditItems && (
                          <TableCell className="text-right">
                            {!isCancelled && !isEditing && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    aria-label="Ενέργειες"
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => beginEditQty(item)}>
                                    Επεξεργασία ποσότητας
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setReplaceTarget(item)}>
                                    Αντικατάσταση...
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() => setCancelTarget(item)}
                                  >
                                    Ακύρωση γραμμής
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={canEditItems ? 5 : 4} className="text-right font-semibold">
                      Σύνολο
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {Number(order.total).toFixed(2)}&nbsp;€
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            )}
          </div>
        </Card>
      </div>

      {id && (
        <OrderItemDialog mode="add" open={showAdd} orderId={id} onClose={() => setShowAdd(false)} />
      )}
      {id && replaceTarget && (
        <OrderItemDialog
          mode="replace"
          open={!!replaceTarget}
          orderId={id}
          itemId={replaceTarget.id}
          originalProductName={replaceTarget.productName}
          originalProductId={replaceTarget.productId}
          originalQuantity={replaceTarget.quantity}
          onClose={() => setReplaceTarget(null)}
        />
      )}
      <Dialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ακύρωση γραμμής</DialogTitle>
            <DialogDescription>
              Είστε σίγουρος ότι θέλετε να ακυρώσετε{" "}
              <span className="font-medium text-foreground">{cancelTarget?.productName}</span>; Η
              γραμμή θα παραμείνει στο ιστορικό σημαδεμένη ως ακυρωμένη.
            </DialogDescription>
          </DialogHeader>
          {cancelItem.error && (
            <p className="text-sm text-destructive">{cancelItem.error.message}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>
              Άκυρο
            </Button>
            <Button variant="destructive" onClick={confirmCancel} disabled={cancelItem.isPending}>
              {cancelItem.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ακύρωση γραμμής
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
