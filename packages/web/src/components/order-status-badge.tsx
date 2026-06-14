import { Badge, badgeVariants } from "@/components/ui/badge";
import { ORDER_STATUS_LABELS } from "@kava-now/shared";
import type { VariantProps } from "class-variance-authority";

type Variant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

const STATUS_VARIANT: Record<keyof typeof ORDER_STATUS_LABELS, Variant> = {
  pending: "warning",
  confirmed: "info",
  shipped: "info",
  delivered: "success",
  cancelled: "destructive",
  cancellation_requested: "warning",
  cancelled_by_customer: "destructive",
};

interface OrderStatusBadgeProps {
  status: keyof typeof ORDER_STATUS_LABELS;
}

export function OrderStatusBadge({ status }: OrderStatusBadgeProps) {
  return <Badge variant={STATUS_VARIANT[status]}>{ORDER_STATUS_LABELS[status]}</Badge>;
}
