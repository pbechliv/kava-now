import { useState } from "react";
import { ClipboardList, Copy, Loader2, MoreHorizontal, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MobileList, MobileListItem } from "@/components/ui/mobile-list";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { OrderItemDialog } from "@/components/admin/order-item-dialog";
import {
  useCancelOrderItem,
  useUpdateOrderItem,
  type AdminOrderDetail,
  type AdminOrderItem,
} from "@/lib/hooks/use-admin-orders";
import { copyToClipboard } from "@/lib/copy";
import { formatMoney } from "@/lib/format";

function buildLinesTsv(order: AdminOrderDetail): string {
  return order.items
    .filter((item) => item.status === "active")
    .map((item) => {
      const code = item.erpRef ?? item.sku ?? "";
      return [code, item.quantity].join("\t");
    })
    .join("\n");
}

/** Cancelled / admin-added markers next to the product name. */
function ItemBadges({ item }: { item: AdminOrderItem }) {
  if (item.status === "cancelled") {
    return (
      <Badge variant="muted" size="sm">
        Ακυρωμένο
      </Badge>
    );
  }
  if (item.originalQuantity == null) {
    return (
      <Badge variant="secondary" size="sm">
        Προστέθηκε
      </Badge>
    );
  }
  return null;
}

/** Mono ERP code with a copy button (hidden for cancelled lines). */
function ErpCode({ item }: { item: AdminOrderItem }) {
  const code = item.erpRef ?? item.sku;
  const isCancelled = item.status === "cancelled";
  return (
    <div className="flex items-center gap-1">
      <span className={isCancelled ? "font-mono text-xs line-through" : "font-mono text-xs"}>
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
  );
}

function QtyEditor({
  value,
  pending,
  onChange,
  onSave,
  onCancel,
}: {
  value: number;
  pending: boolean;
  onChange: (qty: number) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(Math.max(1, Number(e.target.value)))}
        className="h-8 w-20 text-center"
      />
      <Button size="sm" variant="default" disabled={pending} onClick={onSave}>
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "OK"}
      </Button>
      <Button size="sm" variant="ghost" aria-label="Ακύρωση επεξεργασίας" onClick={onCancel}>
        ✕
      </Button>
    </div>
  );
}

function ItemActionsMenu({
  className,
  onEditQty,
  onReplace,
  onCancelLine,
  disableCancel,
}: {
  className?: string;
  onEditQty: () => void;
  onReplace: () => void;
  onCancelLine: () => void;
  /** The last active line can't be cancelled — cancel the whole order instead. */
  disableCancel?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className={className} aria-label="Ενέργειες">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEditQty}>Επεξεργασία ποσότητας</DropdownMenuItem>
        <DropdownMenuItem onClick={onReplace}>Αντικατάσταση...</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={onCancelLine} disabled={disableCancel}>
          Ακύρωση γραμμής
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function OrderItemsSection({ order }: { order: AdminOrderDetail }) {
  const updateItem = useUpdateOrderItem(order.id);
  const cancelItem = useCancelOrderItem(order.id);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingQty, setEditingQty] = useState<number>(1);
  const [replaceTarget, setReplaceTarget] = useState<AdminOrderItem | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AdminOrderItem | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  const isTransmitted = order.erpStatus === "transmitted";
  const isMutableStatus = order.status === "pending" || order.status === "confirmed";
  const canEditItems = isMutableStatus && !isTransmitted && !showOriginal;
  // An order must keep ≥1 active line; the last one can't be cancelled here
  // (cancel the whole order via its status instead). Mirrors the API guard.
  const isLastActiveLine = order.items.filter((i) => i.status === "active").length <= 1;
  const originalItems = order.items.filter((i) => i.originalQuantity != null);
  // Accumulate in integer cents — float drift across many lines otherwise.
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
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{showOriginal ? "Αρχική παραγγελία" : "Προϊόντα"}</h2>
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
        <div className="hidden overflow-x-auto md:block">
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
                        {formatMoney(item.unitPrice)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(Number(item.unitPrice) * qty)}
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
                    {formatMoney(originalTotal)}
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
                  const isCancelled = item.status === "cancelled";
                  const isEditing = editingItemId === item.id;
                  const replacement = replacementMap.get(item.id);
                  const qtyChanged =
                    item.originalQuantity != null && item.originalQuantity !== item.quantity;
                  return (
                    <TableRow key={item.id} className={isCancelled ? "text-muted-foreground" : ""}>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span
                              className={isCancelled ? "font-medium line-through" : "font-medium"}
                            >
                              {item.productName}
                            </span>
                            <ItemBadges item={item} />
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
                        <ErpCode item={item} />
                      </TableCell>
                      <TableCell className="text-center">
                        {isEditing ? (
                          <div className="flex justify-center">
                            <QtyEditor
                              value={editingQty}
                              pending={updateItem.isPending}
                              onChange={setEditingQty}
                              onSave={() => saveEditQty(item.id)}
                              onCancel={() => setEditingItemId(null)}
                            />
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
                        {formatMoney(item.unitPrice)}
                      </TableCell>
                      <TableCell className={isCancelled ? "text-right line-through" : "text-right"}>
                        {formatMoney(Number(item.unitPrice) * item.quantity)}
                      </TableCell>
                      {canEditItems && (
                        <TableCell className="text-right">
                          {!isCancelled && !isEditing && (
                            <ItemActionsMenu
                              className="h-7 w-7"
                              onEditQty={() => beginEditQty(item)}
                              onReplace={() => setReplaceTarget(item)}
                              onCancelLine={() => setCancelTarget(item)}
                              disableCancel={isLastActiveLine}
                            />
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
                    {formatMoney(order.total)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </div>
        <div className="md:hidden">
          {showOriginal ? (
            <>
              <MobileList>
                {originalItems.map((item) => {
                  const code = item.erpRef ?? item.sku;
                  const qty = item.originalQuantity ?? 0;
                  return (
                    <MobileListItem key={item.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium">{item.productName}</div>
                          <div className="font-mono text-xs text-muted-foreground">
                            {code ?? "—"}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {qty} × {formatMoney(item.unitPrice)}
                          </div>
                        </div>
                        <div className="shrink-0 font-medium">
                          {formatMoney(Number(item.unitPrice) * qty)}
                        </div>
                      </div>
                    </MobileListItem>
                  );
                })}
              </MobileList>
              <div className="flex items-center justify-between border-t bg-muted/50 p-4 font-semibold">
                <span>Σύνολο</span>
                <span>{formatMoney(originalTotal)}</span>
              </div>
            </>
          ) : (
            <>
              <MobileList>
                {order.items.map((item) => {
                  const isCancelled = item.status === "cancelled";
                  const isEditing = editingItemId === item.id;
                  const replacement = replacementMap.get(item.id);
                  const qtyChanged =
                    item.originalQuantity != null && item.originalQuantity !== item.quantity;
                  return (
                    <MobileListItem
                      key={item.id}
                      className={isCancelled ? "text-muted-foreground" : undefined}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={isCancelled ? "font-medium line-through" : "font-medium"}
                            >
                              {item.productName}
                            </span>
                            <ItemBadges item={item} />
                          </div>
                          {replacement && (
                            <div className="text-xs text-muted-foreground">
                              → Αντικαταστάθηκε με{" "}
                              <span className="font-medium">{replacement.productName}</span>
                            </div>
                          )}
                          <div className="text-muted-foreground">
                            <ErpCode item={item} />
                          </div>
                        </div>
                        {canEditItems && !isCancelled && !isEditing && (
                          <ItemActionsMenu
                            className="h-7 w-7 shrink-0"
                            onEditQty={() => beginEditQty(item)}
                            onReplace={() => setReplaceTarget(item)}
                            onCancelLine={() => setCancelTarget(item)}
                            disableCancel={isLastActiveLine}
                          />
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        {isEditing ? (
                          <QtyEditor
                            value={editingQty}
                            pending={updateItem.isPending}
                            onChange={setEditingQty}
                            onSave={() => saveEditQty(item.id)}
                            onCancel={() => setEditingItemId(null)}
                          />
                        ) : (
                          <div className="text-sm">
                            <span className={isCancelled ? "line-through" : ""}>
                              {item.quantity} × {formatMoney(item.unitPrice)}
                            </span>
                            {qtyChanged && !isCancelled && (
                              <span className="ml-2 text-[10px] text-muted-foreground">
                                Αρχικά: {item.originalQuantity}
                              </span>
                            )}
                          </div>
                        )}
                        <div className={isCancelled ? "font-medium line-through" : "font-medium"}>
                          {formatMoney(Number(item.unitPrice) * item.quantity)}
                        </div>
                      </div>
                    </MobileListItem>
                  );
                })}
              </MobileList>
              <div className="flex items-center justify-between border-t bg-muted/50 p-4 font-semibold">
                <span>Σύνολο</span>
                <span>{formatMoney(order.total)}</span>
              </div>
            </>
          )}
        </div>
      </Card>

      <OrderItemDialog
        mode="add"
        open={showAdd}
        orderId={order.id}
        onClose={() => setShowAdd(false)}
      />
      {replaceTarget && (
        <OrderItemDialog
          mode="replace"
          open={!!replaceTarget}
          orderId={order.id}
          itemId={replaceTarget.id}
          originalProductName={replaceTarget.productName}
          originalProductId={replaceTarget.productId}
          originalQuantity={replaceTarget.quantity}
          onClose={() => setReplaceTarget(null)}
        />
      )}
      <ConfirmDialog
        open={!!cancelTarget}
        title="Ακύρωση γραμμής"
        description={
          <>
            Είστε σίγουρος ότι θέλετε να ακυρώσετε{" "}
            <span className="font-medium text-foreground">{cancelTarget?.productName}</span>; Η
            γραμμή θα παραμείνει στο ιστορικό σημαδεμένη ως ακυρωμένη.
          </>
        }
        confirmLabel="Ακύρωση γραμμής"
        pending={cancelItem.isPending}
        error={cancelItem.error?.message}
        onConfirm={confirmCancel}
        onClose={() => setCancelTarget(null)}
      />
    </div>
  );
}
