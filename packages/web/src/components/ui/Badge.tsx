import type { ReactNode } from "react";
import type { OrderStatus } from "@kava-now/shared";

type BadgeColor = "amber" | "green" | "blue" | "red" | "gray";

interface BadgeProps {
  color?: BadgeColor;
  children: ReactNode;
}

const colorClasses: Record<BadgeColor, string> = {
  amber: "bg-amber-100 text-amber-800",
  green: "bg-green-100 text-green-800",
  blue: "bg-blue-100 text-blue-800",
  red: "bg-red-100 text-red-800",
  gray: "bg-gray-100 text-gray-800",
};

export const STATUS_BADGE_COLOR: Record<OrderStatus, BadgeColor> = {
  pending: "amber",
  confirmed: "blue",
  shipped: "blue",
  delivered: "green",
  cancelled: "red",
};

export function Badge({ color = "gray", children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClasses[color]}`}
    >
      {children}
    </span>
  );
}
