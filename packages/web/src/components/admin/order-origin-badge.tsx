import { Store, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ORDER_ORIGIN_LABELS, type OrderOrigin } from "@kava-now/shared";

interface OrderOriginBadgeProps {
  origin: OrderOrigin;
  size?: "default" | "sm";
}

// Where the order came from (#159). `manual` (staff-entered: phone / walk-in) is
// the notable case worth flagging; `portal` is the implicit default. Both render
// for the detail view; lists typically only surface `manual`.
export function OrderOriginBadge({ origin, size = "default" }: OrderOriginBadgeProps) {
  const Icon = origin === "manual" ? Store : Globe;
  return (
    <Badge variant={origin === "manual" ? "info" : "muted"} size={size}>
      <Icon />
      {ORDER_ORIGIN_LABELS[origin]}
    </Badge>
  );
}
