import { useMemo, useState } from "react";
import { ChevronsUpDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { useCustomers } from "@/lib/hooks/use-customers";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";

export interface CustomerPickerValue {
  id: string;
  name: string;
}

// Stable identities — Base UI Combobox reads these in effects, so inline
// arrows (new every render) would retrigger them and loop.
const itemsEqual = (a: CustomerPickerValue | null, b: CustomerPickerValue | null) =>
  a?.id === b?.id;
const itemToLabel = (item: CustomerPickerValue | null) => item?.name ?? "";

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
  const results = useMemo(() => data?.data ?? [], [data]);

  return (
    <Combobox<CustomerPickerValue>
      items={results}
      onValueChange={(value) => onSelect(value)}
      onInputValueChange={setSearch}
      filter={null}
      isItemEqualToValue={itemsEqual}
      itemToStringLabel={itemToLabel}
    >
      <ComboboxTrigger
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
        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxInput placeholder="Αναζήτηση πελάτη..." />
        <ComboboxEmpty>
          {isFetching && results.length === 0 ? (
            <span className="flex items-center justify-center">
              <Loader2 className="mr-2 size-4 animate-spin" /> Φόρτωση...
            </span>
          ) : (
            "Δεν βρέθηκαν πελάτες"
          )}
        </ComboboxEmpty>
        <ComboboxList>
          {(customer: CustomerPickerValue) => (
            <ComboboxItem key={customer.id} value={customer}>
              <span className="min-w-0 flex-1 truncate">{customer.name}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
