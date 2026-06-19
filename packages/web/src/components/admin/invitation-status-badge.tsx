import { Badge } from "@/components/ui/badge";

/** Shown next to a user whose invite is sent but not yet accepted (no password set). */
export function InvitationStatusBadge({ className }: { className?: string }) {
  return (
    <Badge variant="warning" className={className}>
      Εκκρεμεί
    </Badge>
  );
}
