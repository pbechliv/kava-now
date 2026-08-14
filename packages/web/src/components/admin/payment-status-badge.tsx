import { Badge } from "@/components/ui/badge";
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from "@kava-now/shared";

interface PaymentStatusBadgeProps {
  status: PaymentStatus;
  // Optional leading text rendered inside the badge (e.g. "Πληρωμή: ").
  prefix?: string;
}

// `paid` reads as success, `unpaid` as muted — every new order starts unpaid, so
// it's the neutral default state, not a warning (mirrors the ERP badge).
export function PaymentStatusBadge({ status, prefix }: PaymentStatusBadgeProps) {
  return (
    <Badge variant={status === "paid" ? "success" : "muted"}>
      {prefix}
      {PAYMENT_STATUS_LABELS[status]}
    </Badge>
  );
}
