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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MobileList, MobileListItem } from "@/components/ui/mobile-list";
import { Spinner } from "@/components/spinner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { InviteUserDialog } from "@/components/admin/invite-user-dialog";
import { UserInviteActions, useResendInviteFeedback } from "@/components/admin/user-invite-actions";

export function UsersPage() {
  const { user: me, currentMembership } = useAuth();
  const { data, isLoading } = useUsers();
  const invite = useInviteUser();
  const remove = useDeleteUser();
  const resend = useResendInvite();
  const promote = usePromoteToOwner();
  const demote = useDemoteToStaff();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const { feedback, handleResend, resendPendingId } = useResendInviteFeedback(resend);

  const handleDelete = (target: { id: string; name: string }) => {
    remove.reset();
    setDeleteTarget(target);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    remove.mutate(deleteTarget.id, {
      onSuccess: () => {
        setDeleteTarget(null);
        toast.success("Ο χρήστης αφαιρέθηκε");
      },
    });
  };

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Χρήστες</h1>
        <Button onClick={() => setInviteOpen(true)} className="self-start sm:self-auto">
          + Πρόσκληση
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="hidden overflow-x-auto md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Όνομα</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Ρόλος</TableHead>
                <TableHead>Προσκλήθηκε από</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {u.name}
                    {u.id === me?.id && (
                      <span className="ml-2 text-xs text-muted-foreground">(εσείς)</span>
                    )}
                    {!u.emailVerified && (
                      <Badge variant="warning" className="ml-2">
                        Εκκρεμεί
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>{ROLE_LABELS[u.role] ?? u.role}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {u.invitedByName ? (
                      <span title={u.invitedByEmail ?? ""}>{u.invitedByName}</span>
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {u.id !== me?.id && (
                      <UserInviteActions
                        user={u}
                        feedback={feedback}
                        resendPendingId={resendPendingId}
                        onResend={handleResend}
                        onDelete={handleDelete}
                      >
                        {promoteButton(u)}
                        {demoteButton(u)}
                      </UserInviteActions>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <MobileList>
          {users.map((u) => (
            <MobileListItem key={u.id}>
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
                  onDelete={handleDelete}
                  align="start"
                >
                  {promoteButton(u)}
                  {demoteButton(u)}
                </UserInviteActions>
              )}
            </MobileListItem>
          ))}
        </MobileList>
      </Card>

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
        open={!!deleteTarget}
        title="Αφαίρεση χρήστη"
        description={
          <>
            Είστε σίγουροι ότι θέλετε να αφαιρέσετε τον χρήστη{" "}
            <span className="font-medium text-foreground">{deleteTarget?.name}</span> από τον
            λογαριασμό;
          </>
        }
        confirmLabel="Αφαίρεση"
        pending={remove.isPending}
        error={remove.error?.message}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
