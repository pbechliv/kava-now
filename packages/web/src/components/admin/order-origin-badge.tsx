import { Phone, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ORDER_ORIGIN_LABELS, type OrderOrigin } from "@kava-now/shared";

interface OrderOriginBadgeProps {
  origin: OrderOrigin;
  size?: "default" | "sm";
}

// Where the order came from (#159). `phone` (staff-entered) is the notable case
// worth flagging; `portal` is the implicit default. Both render for the detail
// view; lists typically only surface `phone`.
export function OrderOriginBadge({ origin, size = "default" }: OrderOriginBadgeProps) {
  const Icon = origin === "phone" ? Phone : Globe;
  return (
    <Badge variant={origin === "phone" ? "info" : "muted"} size={size}>
      <Icon />
      {ORDER_ORIGIN_LABELS[origin]}
    </Badge>
  );
}
