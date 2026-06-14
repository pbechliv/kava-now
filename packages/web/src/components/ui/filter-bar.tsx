import * as React from "react";
import { SlidersHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

// Responsive filter toolbar. The optional `search` slot is always visible.
// Filter `children` render inline on desktop and collapse behind a "Φίλτρα (n)"
// button — opening a sheet — on mobile, so a wall of selects/date pickers never
// pushes the table off-screen on a phone. Filters apply live, so the sheet just
// holds the same controls; closing reveals the already-filtered results.
//
// Pass children as `<FilterField>` blocks. Avoid `id`/`htmlFor` on the controls:
// children mount in both the desktop row and the mobile sheet, so an `id` would
// be duplicated. `FilterField` uses a plain label and controls take `aria-label`.
interface FilterBarProps {
  search?: React.ReactNode;
  activeCount?: number;
  onClear?: () => void;
  children: React.ReactNode;
  className?: string;
}

function FilterBar({ search, activeCount = 0, onClear, children, className }: FilterBarProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className={cn("flex items-end gap-2", className)}>
      {search && <div className="min-w-0 flex-1">{search}</div>}

      {/* Desktop: filters inline */}
      <div className="hidden flex-wrap items-end gap-3 md:flex">{children}</div>

      {/* Mobile: filters in a bottom sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" className={cn("gap-2 md:hidden", !search && "flex-1")}>
            <SlidersHorizontal className="size-4" />
            Φίλτρα
            {activeCount > 0 && (
              <Badge variant="secondary" className="ml-0.5 px-1.5">
                {activeCount}
              </Badge>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent
          side="bottom"
          className="gap-0"
          // Don't let Radix focus the first field (the customer search input)
          // on open — on iOS that pops the keyboard immediately, and that first
          // focus (mid-open) is the one WebKit fails to scroll above the
          // keyboard. Focus stays on the trigger; tapping a field still works.
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <SheetHeader>
            <SheetTitle>Φίλτρα</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 p-4">{children}</div>
          <SheetFooter className="flex-row gap-2">
            {onClear && (
              <Button
                variant="outline"
                className="flex-1"
                disabled={activeCount === 0}
                onClick={onClear}
              >
                Καθαρισμός
              </Button>
            )}
            <Button className="flex-1" onClick={() => setOpen(false)}>
              Εμφάνιση αποτελεσμάτων
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// A labelled filter control. Inline on desktop (label above the control) and
// stacked full-width inside the mobile sheet.
function FilterField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export { FilterBar, FilterField };
