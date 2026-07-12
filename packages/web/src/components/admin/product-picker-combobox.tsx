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

// Stable identities — Base UI Combobox reads these in effects, so inline
// arrows (new every render) would retrigger them and loop.
const itemsEqual = (a: ProductPickerValue | null, b: ProductPickerValue | null) => a?.id === b?.id;
const itemToLabel = (item: ProductPickerValue | null) => item?.name ?? "";

interface Props {
  selected: ProductPickerValue | null;
  onSelect: (product: ProductPickerValue | null) => void;
  excludeProductId?: string;
}

/**
 * Searchable product picker built on the Base UI Combobox. Search is server-side,
 * so the built-in client filtering is disabled (`filter={null}`) and results are
 * driven by the debounced query.
 */
export function ProductPickerCombobox({ selected, onSelect, excludeProductId }: Props) {
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search.trim(), 200);

  const { data, isFetching } = useProducts({
    search: debounced || undefined,
    active: "active",
    pageSize: 20,
  });

  const results = useMemo(
    () => (data?.data ?? []).filter((p) => p.id !== excludeProductId),
    [data, excludeProductId],
  );

  return (
    <Combobox<ProductPickerValue>
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
            className="h-auto min-h-9 w-full justify-between font-normal"
          />
        }
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
        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxInput placeholder="Αναζήτηση προϊόντος ή μάρκας..." />
        <ComboboxEmpty>
          {isFetching && results.length === 0 ? (
            <span className="flex items-center justify-center">
              <Loader2 className="mr-2 size-4 animate-spin" /> Φόρτωση...
            </span>
          ) : debounced ? (
            "Δεν βρέθηκαν προϊόντα"
          ) : (
            "Πληκτρολογήστε για αναζήτηση"
          )}
        </ComboboxEmpty>
        <ComboboxList>
          {(product: ProductPickerValue) => (
            <ComboboxItem key={product.id} value={product}>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{product.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {product.brand} · {formatMoney(product.basePrice)}
                </span>
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
