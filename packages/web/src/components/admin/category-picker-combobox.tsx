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
import { useCategoriesList } from "@/lib/hooks/use-categories";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";

export interface CategoryPickerValue {
  id: string;
  name: string;
}

// The empty-id sentinel represents "no category / all" as a selectable list
// item. onSelect maps it back to null so callers never see a blank id.
const NONE_ID = "";

// Stable identities — Base UI Combobox reads these in effects, so inline
// arrows (new every render) would retrigger them and loop.
const itemsEqual = (a: CategoryPickerValue | null, b: CategoryPickerValue | null) =>
  a?.id === b?.id;
const itemToLabel = (item: CategoryPickerValue | null) => item?.name ?? "";

interface Props {
  selected: CategoryPickerValue | null;
  onSelect: (category: CategoryPickerValue | null) => void;
  /** Trigger text when nothing is selected, and the label of the clear item. */
  placeholder: string;
  /** Exclude a category from results (a category can't be its own parent). */
  excludeId?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

/**
 * Searchable category picker — server-side search (`filter={null}`) so it
 * scales past any page size and there's no fetch-all list to maintain. Mirrors
 * {@link CustomerPickerCombobox}. A leading "none" item clears the selection.
 */
export function CategoryPickerCombobox({
  selected,
  onSelect,
  placeholder,
  excludeId,
  disabled,
  className,
  "aria-label": ariaLabel,
}: Props) {
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search.trim(), 200);

  const { data, isFetching } = useCategoriesList({
    search: debounced || undefined,
    pageSize: 20,
  });

  const items = useMemo(() => {
    const results = (data?.data ?? [])
      .filter((c) => c.id !== excludeId)
      .map((c) => ({ id: c.id, name: c.name }));
    return [{ id: NONE_ID, name: placeholder }, ...results];
  }, [data, excludeId, placeholder]);

  return (
    <Combobox<CategoryPickerValue>
      items={items}
      onValueChange={(value) => onSelect(value && value.id !== NONE_ID ? value : null)}
      onInputValueChange={setSearch}
      filter={null}
      isItemEqualToValue={itemsEqual}
      itemToStringLabel={itemToLabel}
      disabled={disabled}
    >
      <ComboboxTrigger
        render={
          <Button
            variant="outline"
            role="combobox"
            disabled={disabled}
            aria-label={ariaLabel}
            className={cn("w-full justify-between font-normal", className)}
          />
        }
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? selected.name : placeholder}
        </span>
        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxInput placeholder="Αναζήτηση κατηγορίας..." />
        <ComboboxEmpty>
          {isFetching ? (
            <span className="flex items-center justify-center">
              <Loader2 className="mr-2 size-4 animate-spin" /> Φόρτωση...
            </span>
          ) : (
            "Δεν βρέθηκαν κατηγορίες"
          )}
        </ComboboxEmpty>
        <ComboboxList>
          {(category: CategoryPickerValue) => (
            <ComboboxItem key={category.id || "__none__"} value={category}>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  category.id === NONE_ID && "text-muted-foreground",
                )}
              >
                {category.name}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
