import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
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
 */
export function CustomerPickerCombobox({ selected, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search.trim(), 200);

  const { data, isFetching } = useCustomers({
    search: debounced || undefined,
    pageSize: 20,
  });
  const results = data?.data ?? [];

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2">
        <div className="text-sm font-medium">{selected.name}</div>
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          onClick={() => onSelect(null)}
        >
          Αλλαγή
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Αναζήτηση πελάτη..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>
      {debounced.length > 0 && (
        <div className="max-h-64 overflow-y-auto rounded-md border">
          {isFetching && results.length === 0 ? (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Φόρτωση...
            </div>
          ) : results.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Δεν βρέθηκαν πελάτες
            </div>
          ) : (
            <ul>
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => onSelect({ id: c.id, name: c.name })}
                  >
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
