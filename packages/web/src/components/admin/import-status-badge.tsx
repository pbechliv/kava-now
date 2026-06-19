import { Badge, badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";

type Variant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

type ImportRowStatus = "new" | "update" | "error";

const STATUS: Record<ImportRowStatus, { variant: Variant; label: string }> = {
  new: { variant: "success", label: "Νέο" },
  update: { variant: "info", label: "Ενημέρωση" },
  error: { variant: "destructive", label: "Σφάλμα" },
};

export function ImportStatusBadge({ status }: { status: ImportRowStatus }) {
  const { variant, label } = STATUS[status];
  return <Badge variant={variant}>{label}</Badge>;
}
