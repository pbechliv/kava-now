import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useTenantSlug } from "@/lib/hooks/use-tenant-api";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MobileList, MobileListItem } from "@/components/ui/mobile-list";
import { EmptyState } from "@/components/empty-state";
import { useCartStore } from "@/lib/store/cart";
import { useCreateOrder } from "@/lib/hooks/use-customer-orders";
import { UNIT_LABELS } from "@kava-now/shared";
import { formatMoney } from "@/lib/format";

export function CartPage() {
  const navigate = useNavigate();
  const slug = useTenantSlug();
  const base = `/k/${slug}`;
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);

  const items = useCartStore((s) => s.items);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const totalPrice = useCartStore((s) => s.totalPrice);

  const createOrder = useCreateOrder();

  const cartItems = Object.values(items);

  const handleSubmit = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }

    createOrder.mutate(
      {
        items: cartItems.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
        })),
        notes: notes || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Η παραγγελία καταχωρήθηκε");
          void navigate({ to: `${base}/orders` });
        },
      },
    );
  };

  if (cartItems.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Καλάθι</h1>
        <EmptyState
          message="Το καλάθι σας είναι άδειο"
          actionLabel="Πλοήγηση στον κατάλογο"
          onAction={() => navigate({ to: `${base}/catalog` })}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Καλάθι</h1>

      <Card className="overflow-hidden">
        <div className="hidden overflow-x-auto md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Προϊόν</TableHead>
                <TableHead className="text-center">Τιμή</TableHead>
                <TableHead className="text-center">Ποσότητα</TableHead>
                <TableHead className="text-right">Σύνολο</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {cartItems.map((item) => (
                <TableRow key={item.product.id}>
                  <TableCell>
                    <div className="font-medium">{item.product.name}</div>
                    {item.product.brand && (
                      <div className="text-xs text-muted-foreground">{item.product.brand}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">
                    {formatMoney(item.product.resolvedPrice)}
                    <span className="text-xs text-muted-foreground/70">
                      /{UNIT_LABELS[item.product.unit]}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                      >
                        -
                      </Button>
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) =>
                          updateQuantity(item.product.id, parseInt(e.target.value) || 1)
                        }
                        className="h-8 w-14 text-center"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                      >
                        +
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatMoney(item.product.resolvedPrice * item.quantity)}
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost-destructive"
                      size="icon"
                      onClick={() => removeItem(item.product.id)}
                      aria-label="Αφαίρεση"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <MobileList>
          {cartItems.map((item) => (
            <MobileListItem key={item.product.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">{item.product.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {item.product.brand ? `${item.product.brand} · ` : ""}
                    {formatMoney(item.product.resolvedPrice)}
                    <span className="text-xs text-muted-foreground/70">
                      /{UNIT_LABELS[item.product.unit]}
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost-destructive"
                  size="icon"
                  className="shrink-0"
                  onClick={() => removeItem(item.product.id)}
                  aria-label="Αφαίρεση"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                  >
                    -
                  </Button>
                  <Input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => updateQuantity(item.product.id, parseInt(e.target.value) || 1)}
                    className="h-8 w-14 text-center"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                  >
                    +
                  </Button>
                </div>
                <div className="font-medium">
                  {formatMoney(item.product.resolvedPrice * item.quantity)}
                </div>
              </div>
            </MobileListItem>
          ))}
        </MobileList>
      </Card>

      <div className="space-y-2">
        <Label htmlFor="order-notes">Σχόλιο παραγγελίας</Label>
        <Textarea
          id="order-notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Προαιρετικό σχόλιο προς το κατάστημα..."
        />
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-sm text-muted-foreground">Σύνολο: </span>
            <span className="text-xl font-bold">{formatMoney(totalPrice())}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {confirming && (
              <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
                Ακύρωση
              </Button>
            )}
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={createOrder.isPending}
              className="flex-1 sm:flex-initial"
            >
              {createOrder.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {createOrder.isPending
                ? "Υποβολή..."
                : confirming
                  ? "Επιβεβαίωση Παραγγελίας"
                  : "Υποβολή Παραγγελίας"}
            </Button>
          </div>
        </div>
      </Card>

      {createOrder.isError && (
        <p className="text-sm text-destructive">
          {createOrder.error?.message || "Σφάλμα κατά την υποβολή"}
        </p>
      )}
    </div>
  );
}
