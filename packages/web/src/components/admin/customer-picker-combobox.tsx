import { useState } from "react";
import { Check, ChevronsUpDown, Loader2, SearchIcon } from "lucide-react";
import { Combobox } from "@base-ui/react/combobox";
import { Button } from "@/components/ui/button";
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
 * Built on the Base UI Combobox; server-side search means the built-in client
 * filtering is disabled (`filter={null}`).
 */
export function CustomerPickerCombobox({ selected, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search.trim(), 200);

  const { data, isFetching } = useCustomers({
    search: debounced || undefined,
    pageSize: 20,
  });
  const results = data?.data ?? [];

  return (
    <Combobox.Root<CustomerPickerValue>
      items={results}
      value={selected}
      onValueChange={(value) => onSelect(value)}
      inputValue={search}
      onInputValueChange={setSearch}
      filter={null}
      isItemEqualToValue={(a, b) => a?.id === b?.id}
      itemToStringLabel={(item) => item?.name ?? ""}
    >
      <Combobox.Trigger
        render={
          <Button
            variant="outline"
            role="combobox"
            className="w-full justify-between font-normal"
          />
        }
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? selected.name : "Αναζήτηση πελάτη..."}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner align="start" sideOffset={4} className="z-50">
          <Combobox.Popup className="w-(--anchor-width) overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
            <div className="flex h-9 items-center gap-2 border-b px-3">
              <SearchIcon className="size-4 shrink-0 opacity-50" />
              <Combobox.Input
                placeholder="Αναζήτηση πελάτη..."
                className="flex h-10 w-full bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground"
              />
            </div>
            <Combobox.Empty className="py-6 text-center text-sm text-muted-foreground">
              {isFetching && results.length === 0 ? (
                <span className="flex items-center justify-center">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Φόρτωση...
                </span>
              ) : (
                "Δεν βρέθηκαν πελάτες"
              )}
            </Combobox.Empty>
            <Combobox.List className="max-h-[300px] overflow-x-hidden overflow-y-auto p-1">
              {(customer: CustomerPickerValue) => (
                <Combobox.Item
                  key={customer.id}
                  value={customer}
                  className="relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                >
                  <Check
                    className={cn(
                      "h-4 w-4 shrink-0",
                      selected?.id === customer.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{customer.name}</span>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
