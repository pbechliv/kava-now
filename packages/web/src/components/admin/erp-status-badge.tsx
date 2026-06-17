import { Badge } from "@/components/ui/badge";
import { ERP_STATUS_LABELS, type ErpStatus } from "@kava-now/shared";

interface ErpStatusBadgeProps {
  status: ErpStatus;
  // Optional leading text rendered inside the badge (e.g. "ERP: ").
  prefix?: string;
}

// `transmitted` reads as success, everything else as muted.
export function ErpStatusBadge({ status, prefix }: ErpStatusBadgeProps) {
  return (
    <Badge variant={status === "transmitted" ? "success" : "muted"}>
      {prefix}
      {ERP_STATUS_LABELS[status]}
    </Badge>
  );
}
