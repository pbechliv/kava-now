import { useState } from "react";
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
import { useCustomers } from "@/lib/hooks/use-customers";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";

export interface CustomerPickerValue {
  id: string;
  name: string;
}

interface Props {
  selected: CustomerPickerValue | null;
  onSelect: (customer: CustomerPickerValue | null) => void;
}

/**
 * Searchable customer picker — replaces the capped 100-entry <Select> on the
 * orders filter, where customers past the cap could never be selected (#61).
 * Built on the shadcn Combobox pattern (Popover + Command); server-side search
 * means cmdk's own filtering is disabled (`shouldFilter={false}`).
 */
export function CustomerPickerCombobox({ selected, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search.trim(), 200);

  const { data, isFetching } = useCustomers({
    search: debounced || undefined,
    pageSize: 20,
  });
  const results = data?.data ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.name : "Αναζήτηση πελάτη..."}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Αναζήτηση πελάτη..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {isFetching && results.length === 0 ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Φόρτωση...
              </div>
            ) : (
              <CommandEmpty>Δεν βρέθηκαν πελάτες</CommandEmpty>
            )}
            {results.map((c) => (
              <CommandItem
                key={c.id}
                value={c.id}
                onSelect={() => {
                  onSelect(selected?.id === c.id ? null : { id: c.id, name: c.name });
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    selected?.id === c.id ? "opacity-100" : "opacity-0",
                  )}
                />
                {c.name}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
