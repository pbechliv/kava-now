import { Badge } from "@/components/ui/badge";

/**
 * Shown next to a user whose invite is sent but not yet accepted — they have no
 * way to sign in yet (no password and no linked social account).
 */
export function InvitationStatusBadge({ className }: { className?: string }) {
  return (
    <Badge variant="warning" className={className}>
      Εκκρεμεί
    </Badge>
  );
}
