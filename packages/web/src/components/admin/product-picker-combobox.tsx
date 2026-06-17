import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useProducts } from "@/lib/hooks/use-products";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { formatMoney } from "@/lib/format";

export interface ProductPickerValue {
  id: string;
  name: string;
  brand: string;
  // numeric column — serialized as a string by the API
  basePrice: string;
}

interface Props {
  selected: ProductPickerValue | null;
  onSelect: (product: ProductPickerValue | null) => void;
  excludeProductId?: string;
}

/**
 * Searchable product picker built on the shadcn Combobox pattern (Popover +
 * Command). Search is server-side, so cmdk's own filtering is disabled.
 */
export function ProductPickerCombobox({ selected, onSelect, excludeProductId }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search.trim(), 200);

  const { data, isFetching } = useProducts({
    search: debounced || undefined,
    active: "true",
    pageSize: 20,
  });

  const results = useMemo(
    () => (data?.data ?? []).filter((p) => p.id !== excludeProductId),
    [data, excludeProductId],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-auto min-h-9 w-full justify-between font-normal"
        >
          {selected ? (
            <span className="flex min-w-0 flex-col items-start">
              <span className="truncate font-medium">{selected.name}</span>
              <span className="text-xs text-muted-foreground">
                {selected.brand} · {formatMoney(selected.basePrice)}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">Αναζήτηση προϊόντος ή μάρκας...</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Αναζήτηση προϊόντος ή μάρκας..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {isFetching && results.length === 0 ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Φόρτωση...
              </div>
            ) : (
              <CommandEmpty>
                {debounced ? "Δεν βρέθηκαν προϊόντα" : "Πληκτρολογήστε για αναζήτηση"}
              </CommandEmpty>
            )}
            {results.map((p) => (
              <CommandItem
                key={p.id}
                value={p.id}
                onSelect={() => {
                  onSelect(
                    selected?.id === p.id
                      ? null
                      : { id: p.id, name: p.name, brand: p.brand, basePrice: p.basePrice },
                  );
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4 shrink-0",
                    selected?.id === p.id ? "opacity-100" : "opacity-0",
                  )}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">{p.brand}</span>
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {formatMoney(p.basePrice)}
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
