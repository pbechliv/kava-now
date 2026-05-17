import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/copy";

interface Props {
  label: string;
  value: string | null;
  successMessage?: string;
}

export function CopyField({ label, value, successMessage }: Props) {
  const isEmpty = !value;
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-0.5 break-words text-sm">{value ?? "—"}</p>
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0"
        disabled={isEmpty}
        onClick={() => value && copyToClipboard(value, successMessage ?? `Αντιγράφηκε: ${label}`)}
        aria-label={`Αντιγραφή ${label}`}
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
