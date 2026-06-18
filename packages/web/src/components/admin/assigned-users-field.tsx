import { useMemo, useState } from "react";
import { Check, Loader2, SearchIcon } from "lucide-react";
import { useUsers } from "@/lib/hooks/use-users";
import { cn } from "@/lib/utils";

interface Props {
  value: string[];
  onChange: (ids: string[]) => void;
}

/**
 * Multi-select for the staff/owner users responsible for a customer. The admin
 * users endpoint already excludes customer-role users, so everything listed is
 * assignable. Optional — selecting none is allowed. A search box filters the
 * already-loaded list client-side; selecting toggles membership.
 */
export function AssignedUsersField({ value, onChange }: Props) {
  const { data, isLoading } = useUsers();
  const users = data?.users ?? [];
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return users;
    }
    return users.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q));
  }, [users, search]);

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Φόρτωση χρηστών...
      </div>
    );
  }

  if (users.length === 0) {
    return <p className="py-2 text-sm text-muted-foreground">Δεν υπάρχουν χρήστες προσωπικού</p>;
  }

  return (
    <div className="rounded-md border">
      <div className="flex h-9 items-center gap-2 border-b px-3">
        <SearchIcon className="size-4 shrink-0 opacity-50" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Αναζήτηση χρήστη..."
          className="flex h-10 w-full bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground"
        />
      </div>
      <div className="max-h-48 overflow-y-auto p-1" role="listbox" aria-multiselectable="true">
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Δεν βρέθηκαν χρήστες</p>
        ) : (
          filtered.map((u) => {
            const selected = value.includes(u.id);
            return (
              <button
                type="button"
                key={u.id}
                role="option"
                aria-selected={selected}
                onClick={() => toggle(u.id)}
                className={cn(
                  "relative flex w-full cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
                  selected && "bg-muted/50",
                )}
              >
                <span className="min-w-0 truncate text-left">
                  <span className="font-medium">{u.name}</span>{" "}
                  <span className="text-muted-foreground">{u.email}</span>
                </span>
                {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
