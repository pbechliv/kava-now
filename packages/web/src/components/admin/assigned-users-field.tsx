import { Check, Loader2 } from "lucide-react";
import { useUsers } from "@/lib/hooks/use-users";
import { cn } from "@/lib/utils";

interface Props {
  value: string[];
  onChange: (ids: string[]) => void;
}

/**
 * Multi-select for the staff/owner users responsible for a customer. The admin
 * users endpoint already excludes customer-role users, so everything listed is
 * assignable. Optional — selecting none is allowed.
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
    <div className="max-h-48 divide-y overflow-y-auto rounded-md border">
      {users.map((u) => {
        const selected = value.includes(u.id);
        return (
          <button
            key={u.id}
            type="button"
            onClick={() => toggle(u.id)}
            aria-pressed={selected}
            className={cn(
              "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
              selected && "bg-muted/50",
            )}
          >
            <span className="min-w-0 truncate">
              <span className="font-medium">{u.name}</span>{" "}
              <span className="text-muted-foreground">{u.email}</span>
            </span>
            {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
          </button>
        );
      })}
    </div>
  );
}
