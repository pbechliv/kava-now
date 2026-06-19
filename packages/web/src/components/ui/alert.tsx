import type { ReactNode } from "react";
import { XIcon } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm [&_a]:underline [&_a]:underline-offset-4",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-foreground",
        success: "border-success/30 bg-success/10 text-success",
        warning: "border-warning/30 bg-warning/10 text-warning",
        info: "border-info/30 bg-info/10 text-info",
        destructive: "border-destructive/30 bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

interface AlertProps extends VariantProps<typeof alertVariants> {
  /** Optional leading icon, rendered before the content. */
  icon?: ReactNode;
  /** When provided, renders a dismiss button that calls this on click. */
  onDismiss?: () => void;
  className?: string;
  children: ReactNode;
}

function Alert({ variant = "default", icon, onDismiss, className, children }: AlertProps) {
  return (
    <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)}>
      {icon && <span className="mt-0.5 shrink-0 [&_svg]:size-4">{icon}</span>}
      <div className="min-w-0 flex-1 space-y-1">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Κλείσιμο"
          className="shrink-0 opacity-70 transition-opacity hover:opacity-100"
        >
          <XIcon className="size-4" />
        </button>
      )}
    </div>
  );
}

export { Alert, alertVariants };
