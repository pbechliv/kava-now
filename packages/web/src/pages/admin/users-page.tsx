import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ROLE_LABELS } from "@kava-now/shared";
import {
  useUsers,
  useInviteUser,
  useDeleteUser,
  useResendInvite,
  usePromoteToOwner,
  useDemoteToStaff,
} from "@/lib/hooks/use-users";
import { useAuth } from "@/lib/hooks/use-auth";
import { useDeleteConfirmation } from "@/lib/hooks/use-delete-confirmation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ResponsiveTable, type ResponsiveTableColumn } from "@/components/ui/responsive-table";
import { Spinner } from "@/components/spinner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { InviteUserDialog } from "@/components/admin/invite-user-dialog";
import { UserInviteActions, useResendInviteFeedback } from "@/components/admin/user-invite-actions";

type UserRow = NonNullable<ReturnType<typeof useUsers>["data"]>["users"][number];

export function UsersPage() {
  const { user: me, currentMembership } = useAuth();
  const { data, isLoading } = useUsers();
  const invite = useInviteUser();
  const remove = useDeleteUser();
  const resend = useResendInvite();
  const promote = usePromoteToOwner();
  const demote = useDemoteToStaff();
  const [inviteOpen, setInviteOpen] = useState(false);
  const { feedback, handleResend, resendPendingId } = useResendInviteFeedback(resend);
  const del = useDeleteConfirmation(remove);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  const users = data?.users ?? [];
  const canPromote = currentMembership?.role === "owner";

  const promoteButton = (u: { id: string; role: string }) =>
    canPromote &&
    u.role === "staff" && (
      <Button
        variant="outline"
        size="sm"
        disabled={promote.isPending && promote.variables === u.id}
        onClick={() =>
          promote.mutate(u.id, {
            onSuccess: () => toast.success("Ο χρήστης έγινε ιδιοκτήτης"),
          })
        }
      >
        {promote.isPending && promote.variables === u.id && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        )}
        Μετατροπή σε ιδιοκτήτη
      </Button>
    );

  const demoteButton = (u: { id: string; role: string }) =>
    canPromote &&
    u.role === "owner" && (
      <Button
        variant="outline"
        size="sm"
        disabled={demote.isPending && demote.variables === u.id}
        onClick={() =>
          demote.mutate(u.id, {
            onSuccess: () => toast.success("Ο χρήστης έγινε προσωπικό"),
          })
        }
      >
        {demote.isPending && demote.variables === u.id && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        )}
        Υποβάθμιση σε προσωπικό
      </Button>
    );

  const columns: ResponsiveTableColumn<UserRow>[] = [
    {
      header: "Όνομα",
      cellClassName: "font-medium",
      cell: (u) => (
        <>
          {u.name}
          {u.id === me?.id && <span className="ml-2 text-xs text-muted-foreground">(εσείς)</span>}
          {!u.emailVerified && (
            <Badge variant="warning" className="ml-2">
              Εκκρεμεί
            </Badge>
          )}
        </>
      ),
    },
    { header: "Email", cellClassName: "text-muted-foreground", cell: (u) => u.email },
    { header: "Ρόλος", cell: (u) => ROLE_LABELS[u.role] ?? u.role },
    {
      header: "Προσκλήθηκε από",
      cellClassName: "text-muted-foreground",
      cell: (u) =>
        u.invitedByName ? (
          <span title={u.invitedByEmail ?? ""}>{u.invitedByName}</span>
        ) : (
          <span className="text-muted-foreground/60">—</span>
        ),
    },
    {
      header: undefined,
      headClassName: "text-right",
      cellClassName: "text-right",
      cell: (u) =>
        u.id !== me?.id && (
          <UserInviteActions
            user={u}
            feedback={feedback}
            resendPendingId={resendPendingId}
            onResend={handleResend}
            onDelete={del.request}
          >
            {promoteButton(u)}
            {demoteButton(u)}
          </UserInviteActions>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Χρήστες</h1>
        <Button onClick={() => setInviteOpen(true)} className="self-start sm:self-auto">
          + Πρόσκληση
        </Button>
      </div>

      <ResponsiveTable
        data={users}
        columns={columns}
        getRowKey={(u) => u.id}
        renderMobileItem={(u) => (
          <>
            <div className="min-w-0">
              <div className="font-medium">
                {u.name}
                {u.id === me?.id && (
                  <span className="ml-2 text-xs text-muted-foreground">(εσείς)</span>
                )}
                {!u.emailVerified && (
                  <Badge variant="warning" className="ml-2">
                    Εκκρεμεί
                  </Badge>
                )}
              </div>
              <div className="text-sm text-muted-foreground">{u.email}</div>
              <div className="text-sm text-muted-foreground">
                {ROLE_LABELS[u.role] ?? u.role}
                {u.invitedByName && <> · Προσκλήθηκε από {u.invitedByName}</>}
              </div>
            </div>
            {u.id !== me?.id && (
              <UserInviteActions
                user={u}
                feedback={feedback}
                resendPendingId={resendPendingId}
                onResend={handleResend}
                onDelete={del.request}
                align="start"
              >
                {promoteButton(u)}
                {demoteButton(u)}
              </UserInviteActions>
            )}
          </>
        )}
      />

      <InviteUserDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title="Πρόσκληση χρήστη"
        description="Θα σταλεί email στον χρήστη με σύνδεσμο για να ορίσει τον κωδικό του."
        footnote={
          <p className="text-xs text-muted-foreground">
            Οι χρήστες πελατών δημιουργούνται από τη σελίδα{" "}
            <span className="font-medium">Πελάτες</span>.
          </p>
        }
        pending={invite.isPending}
        error={invite.error}
        onSubmit={(values) =>
          invite.mutate(
            { ...values, role: "staff" },
            {
              onSuccess: () => {
                setInviteOpen(false);
                toast.success("Η πρόσκληση στάλθηκε");
              },
            },
          )
        }
      />

      <ConfirmDialog
        {...del.dialogProps}
        title="Αφαίρεση χρήστη"
        description={
          <>
            Είστε σίγουροι ότι θέλετε να αφαιρέσετε τον χρήστη{" "}
            <span className="font-medium text-foreground">{del.target?.name}</span> από τον
            λογαριασμό;
          </>
        }
        confirmLabel="Αφαίρεση"
        onConfirm={() => del.confirm(() => toast.success("Ο χρήστης αφαιρέθηκε"))}
      />
    </div>
  );
}
