import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2, SearchIcon } from "lucide-react";
import { Combobox } from "@base-ui/react/combobox";
import { Button } from "@/components/ui/button";
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
 * Searchable product picker built on the Base UI Combobox. Search is server-side,
 * so the built-in client filtering is disabled (`filter={null}`) and results are
 * driven by the debounced query.
 */
export function ProductPickerCombobox({ selected, onSelect, excludeProductId }: Props) {
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
    <Combobox.Root<ProductPickerValue>
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
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner align="start" sideOffset={4} className="z-50">
          <Combobox.Popup className="w-(--anchor-width) overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
            <div className="flex h-9 items-center gap-2 border-b px-3">
              <SearchIcon className="size-4 shrink-0 opacity-50" />
              <Combobox.Input
                placeholder="Αναζήτηση προϊόντος ή μάρκας..."
                className="flex h-10 w-full bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground"
              />
            </div>
            <Combobox.Empty className="py-6 text-center text-sm text-muted-foreground">
              {isFetching && results.length === 0 ? (
                <span className="flex items-center justify-center">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Φόρτωση...
                </span>
              ) : debounced ? (
                "Δεν βρέθηκαν προϊόντα"
              ) : (
                "Πληκτρολογήστε για αναζήτηση"
              )}
            </Combobox.Empty>
            <Combobox.List className="max-h-[300px] overflow-x-hidden overflow-y-auto p-1">
              {(product: ProductPickerValue) => (
                <Combobox.Item
                  key={product.id}
                  value={product}
                  className="relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                >
                  <Check
                    className={cn(
                      "h-4 w-4 shrink-0",
                      selected?.id === product.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{product.name}</span>
                    <span className="text-xs text-muted-foreground">{product.brand}</span>
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatMoney(product.basePrice)}
                  </span>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
