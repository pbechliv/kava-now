import { Check, Loader2 } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useUsers } from "@/lib/hooks/use-users";
import { cn } from "@/lib/utils";

interface Props {
  value: string[];
  onChange: (ids: string[]) => void;
}

/**
 * Multi-select for the staff/owner users responsible for a customer. The admin
 * users endpoint already excludes customer-role users, so everything listed is
 * assignable. Optional — selecting none is allowed. Built on the shadcn Command
 * primitive for the search + keyboard nav; filtering is client-side over the
 * already-loaded list.
 */
export function AssignedUsersField({ value, onChange }: Props) {
  const { data, isLoading } = useUsers();
  const users = data?.users ?? [];

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
    <Command className="rounded-md border">
      <CommandInput placeholder="Αναζήτηση χρήστη..." />
      <CommandList className="max-h-48">
        <CommandEmpty>Δεν βρέθηκαν χρήστες</CommandEmpty>
        {users.map((u) => {
          const selected = value.includes(u.id);
          return (
            <CommandItem
              key={u.id}
              value={`${u.name} ${u.email}`}
              onSelect={() => toggle(u.id)}
              aria-pressed={selected}
              className={cn("justify-between", selected && "bg-muted/50")}
            >
              <span className="min-w-0 truncate">
                <span className="font-medium">{u.name}</span>{" "}
                <span className="text-muted-foreground">{u.email}</span>
              </span>
              {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </CommandItem>
          );
        })}
      </CommandList>
    </Command>
  );
}
