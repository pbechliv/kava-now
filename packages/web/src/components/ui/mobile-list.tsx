import * as React from "react";

import { cn } from "@/lib/utils";

// Card-list rendering of tabular data for small screens. Pair with a table
// wrapped in `hidden md:block`: the list renders below `md`, the table above.
function MobileList({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul data-slot="mobile-list" className={cn("divide-y md:hidden", className)} {...props} />;
}

function MobileListItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li data-slot="mobile-list-item" className={cn("space-y-2 p-4", className)} {...props} />;
}

function MobileListField({
  label,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { label: string }) {
  return (
    <div
      data-slot="mobile-list-field"
      className={cn("flex items-center justify-between gap-3 text-sm", className)}
      {...props}
    >
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <div className="min-w-0 text-right">{children}</div>
    </div>
  );
}

export { MobileList, MobileListItem, MobileListField };
