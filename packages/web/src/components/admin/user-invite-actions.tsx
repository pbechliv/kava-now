import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ResendFeedback {
  id: string;
  kind: "success" | "error";
  message: string;
}

interface ResendMutation {
  mutate: (
    id: string,
    options?: { onSuccess?: () => void; onError?: (err: Error) => void },
  ) => void;
  isPending: boolean;
  variables?: string;
}

/**
 * Per-row resend state shared by the staff Users page and the customer Users
 * page: wraps the resend mutation with inline success/error feedback and the
 * id of the row whose resend is in flight.
 */
export function useResendInviteFeedback(resend: ResendMutation) {
  const [feedback, setFeedback] = useState<ResendFeedback | null>(null);

  const handleResend = (id: string) => {
    resend.mutate(id, {
      onSuccess: () => setFeedback({ id, kind: "success", message: "Η πρόσκληση στάλθηκε ξανά" }),
      onError: (err) =>
        setFeedback({
          id,
          kind: "error",
          message: err instanceof Error ? err.message : "Σφάλμα",
        }),
    });
  };

  return {
    feedback,
    handleResend,
    resendPendingId: resend.isPending ? (resend.variables ?? null) : null,
  };
}

/**
 * Resend-invite + delete action cluster for a user row. Rendered in both the
 * desktop table cell (align="end") and the mobile card (align="start");
 * extra page-specific actions (e.g. promote-to-owner) go in `children`.
 */
export function UserInviteActions({
  user,
  feedback,
  resendPendingId,
  onResend,
  onDelete,
  align = "end",
  children,
}: {
  user: { id: string; name: string; emailVerified: boolean };
  feedback: ResendFeedback | null;
  resendPendingId: string | null;
  onResend: (id: string) => void;
  onDelete: (target: { id: string; name: string }) => void;
  align?: "start" | "end";
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", align === "end" && "justify-end")}>
      {feedback?.id === user.id && (
        <span
          className={cn(
            "text-xs",
            feedback.kind === "success" ? "text-success" : "text-destructive",
          )}
        >
          {feedback.message}
        </span>
      )}
      {!user.emailVerified && (
        <Button
          variant="ghost"
          size="sm"
          disabled={resendPendingId === user.id}
          onClick={() => onResend(user.id)}
        >
          {resendPendingId === user.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Επανάληψη πρόσκλησης
        </Button>
      )}
      {children}
      <Button
        variant="ghost-destructive"
        size="sm"
        onClick={() => onDelete({ id: user.id, name: user.name })}
      >
        Διαγραφή
      </Button>
    </div>
  );
}
