import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const chipVariants = cva(
  "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      active: {
        true: "bg-primary text-primary-foreground",
        false: "bg-muted text-muted-foreground hover:bg-muted/80",
      },
    },
    defaultVariants: {
      active: false,
    },
  },
);

interface ChipProps
  extends Omit<ComponentProps<"button">, "type">, VariantProps<typeof chipVariants> {}

/** Pill toggle used for single-select filter rows (e.g. catalog categories). */
function Chip({ active, className, ...props }: ChipProps) {
  const isActive = active ?? false;
  return (
    <button
      type="button"
      data-slot="chip"
      aria-pressed={isActive}
      className={cn(chipVariants({ active: isActive }), className)}
      {...props}
    />
  );
}

export { Chip, chipVariants };
