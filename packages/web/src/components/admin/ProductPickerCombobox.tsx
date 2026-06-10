import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useProducts } from "@/lib/hooks/use-products";

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

export function ProductPickerCombobox({ selected, onSelect, excludeProductId }: Props) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 200);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isFetching } = useProducts({
    search: debounced || undefined,
    active: "true",
    pageSize: 20,
  });

  const results = useMemo(
    () => (data?.data ?? []).filter((p) => p.id !== excludeProductId),
    [data, excludeProductId],
  );

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2">
        <div className="text-sm">
          <div className="font-medium">{selected.name}</div>
          <div className="text-xs text-muted-foreground">
            {selected.brand} · {Number(selected.basePrice).toFixed(2)}&nbsp;€
          </div>
        </div>
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
          autoFocus
          placeholder="Αναζήτηση προϊόντος ή μάρκας..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>
      <div className="max-h-64 overflow-y-auto rounded-md border">
        {isFetching && results.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Φόρτωση...
          </div>
        ) : results.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {debounced ? "Δεν βρέθηκαν προϊόντα" : "Πληκτρολογήστε για αναζήτηση"}
          </div>
        ) : (
          <ul className="divide-y">
            {results.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() =>
                    onSelect({ id: p.id, name: p.name, brand: p.brand, basePrice: p.basePrice })
                  }
                >
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.brand}</div>
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {Number(p.basePrice).toFixed(2)}&nbsp;€
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
