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
import { useAddOrderItem, useReplaceOrderItem } from "@/lib/hooks/use-admin-orders";
import { MAX_ORDER_QUANTITY } from "@kava-now/shared";
import { ProductPickerCombobox, type ProductPickerValue } from "./product-picker-combobox";

type Props = {
  open: boolean;
  orderId: string;
  onClose: () => void;
} & (
  | { mode: "add" }
  | {
      mode: "replace";
      itemId: string;
      originalProductName: string;
      originalProductId: string;
      originalQuantity: number;
    }
);

// One dialog for both line-item flows: "add" inserts a new line, "replace"
// soft-cancels the original and links it to the inserted replacement.
export function OrderItemDialog(props: Props) {
  const { open, orderId, onClose } = props;
  const isReplace = props.mode === "replace";
  const [product, setProduct] = useState<ProductPickerValue | null>(null);
  const [quantity, setQuantity] = useState(isReplace ? props.originalQuantity : 1);
  const add = useAddOrderItem(orderId);
  const replace = useReplaceOrderItem(orderId);
  const mutation = isReplace ? replace : add;

  const initialQuantity = isReplace ? props.originalQuantity : 1;
  useEffect(() => {
    if (open) {
      setProduct(null);
      setQuantity(initialQuantity);
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialQuantity]);

  const canSubmit = !!product && quantity >= 1 && !mutation.isPending;

  const handleSubmit = () => {
    if (!product || quantity < 1) return;
    if (props.mode === "replace") {
      replace.mutate(
        { itemId: props.itemId, productId: product.id, quantity },
        { onSuccess: () => onClose() },
      );
    } else {
      add.mutate({ productId: product.id, quantity }, { onSuccess: () => onClose() });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isReplace ? "Αντικατάσταση προϊόντος" : "Προσθήκη προϊόντος"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {props.mode === "replace" && (
            <p className="text-sm text-muted-foreground">
              Αντικατάσταση του{" "}
              <span className="font-medium text-foreground">{props.originalProductName}</span> (
              {props.originalQuantity} τμχ) με:
            </p>
          )}
          <ProductPickerCombobox
            selected={product}
            onSelect={setProduct}
            excludeProductId={props.mode === "replace" ? props.originalProductId : undefined}
          />
          {product && (
            <div>
              <Label htmlFor="item-qty" className="mb-1.5 block">
                Ποσότητα
              </Label>
              <Input
                id="item-qty"
                type="number"
                min={1}
                max={MAX_ORDER_QUANTITY}
                value={quantity}
                onChange={(e) =>
                  setQuantity(Math.min(MAX_ORDER_QUANTITY, Math.max(1, Number(e.target.value))))
                }
                className="w-32"
              />
            </div>
          )}
          {mutation.error && <p className="text-sm text-destructive">{mutation.error.message}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Άκυρο
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isReplace ? "Αντικατάσταση" : "Προσθήκη"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
