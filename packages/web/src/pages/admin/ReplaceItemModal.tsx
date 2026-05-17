import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useReplaceOrderItem } from "@/lib/hooks/use-admin-orders";
import { ProductPickerCombobox, type ProductPickerValue } from "./ProductPickerCombobox";

interface Props {
  open: boolean;
  orderId: string;
  itemId: string;
  originalProductName: string;
  originalProductId: string;
  originalQuantity: number;
  onClose: () => void;
}

export function ReplaceItemModal({
  open,
  orderId,
  itemId,
  originalProductName,
  originalProductId,
  originalQuantity,
  onClose,
}: Props) {
  const [product, setProduct] = useState<ProductPickerValue | null>(null);
  const [quantity, setQuantity] = useState(originalQuantity);
  const replace = useReplaceOrderItem(orderId);

  useEffect(() => {
    if (open) {
      setProduct(null);
      setQuantity(originalQuantity);
      replace.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, originalQuantity]);

  const canSubmit = !!product && quantity >= 1 && !replace.isPending;

  const handleSubmit = () => {
    if (!product || quantity < 1) return;
    replace.mutate(
      { itemId, productId: product.id, quantity },
      {
        onSuccess: () => onClose(),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Αντικατάσταση προϊόντος</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Αντικατάσταση του{" "}
            <span className="font-medium text-foreground">{originalProductName}</span> (
            {originalQuantity} τμχ) με:
          </p>
          <ProductPickerCombobox
            selected={product}
            onSelect={setProduct}
            excludeProductId={originalProductId}
          />
          {product && (
            <div>
              <Label htmlFor="replace-qty" className="mb-1.5 block">
                Ποσότητα
              </Label>
              <Input
                id="replace-qty"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                className="w-32"
              />
            </div>
          )}
          {replace.error && <p className="text-sm text-destructive">{replace.error.message}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Άκυρο
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {replace.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Αντικατάσταση
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
