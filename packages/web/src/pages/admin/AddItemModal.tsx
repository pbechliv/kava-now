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
import { useAddOrderItem } from "@/lib/hooks/use-admin-orders";
import { ProductPickerCombobox, type ProductPickerValue } from "./ProductPickerCombobox";

interface Props {
  open: boolean;
  orderId: string;
  onClose: () => void;
}

export function AddItemModal({ open, orderId, onClose }: Props) {
  const [product, setProduct] = useState<ProductPickerValue | null>(null);
  const [quantity, setQuantity] = useState(1);
  const add = useAddOrderItem(orderId);

  useEffect(() => {
    if (open) {
      setProduct(null);
      setQuantity(1);
      add.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const canSubmit = !!product && quantity >= 1 && !add.isPending;

  const handleSubmit = () => {
    if (!product || quantity < 1) return;
    add.mutate(
      { productId: product.id, quantity },
      {
        onSuccess: () => onClose(),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Προσθήκη προϊόντος</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <ProductPickerCombobox selected={product} onSelect={setProduct} />
          {product && (
            <div>
              <Label htmlFor="add-qty" className="mb-1.5 block">
                Ποσότητα
              </Label>
              <Input
                id="add-qty"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                className="w-32"
              />
            </div>
          )}
          {add.error && <p className="text-sm text-destructive">{add.error.message}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Άκυρο
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {add.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Προσθήκη
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
