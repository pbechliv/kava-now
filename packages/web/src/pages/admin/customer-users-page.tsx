import { useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import {
  useCustomerUsers,
  useInviteCustomerUser,
  useResendCustomerUserInvite,
} from "@/lib/hooks/use-customer-users";
import { useCustomer } from "@/lib/hooks/use-customers";
import { useDeleteUser } from "@/lib/hooks/use-users";
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

export function CustomerUsersPage() {
  const { id = "", slug } = useParams<{ id: string; slug: string }>();
  const { data: customer } = useCustomer(id);
  const { data, isLoading } = useCustomerUsers(id);
  const invite = useInviteCustomerUser(id);
  const resend = useResendCustomerUserInvite(id);
  const remove = useDeleteUser();
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            to={`/k/${slug}/admin/customers`}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> Πίσω στους πελάτες
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">
            Χρήστες — {customer?.name ?? "…"}
          </h1>
        </div>
        <Button onClick={() => setInviteOpen(true)} className="self-start sm:self-auto">
          + Προσθήκη χρήστη
        </Button>
      </div>

      <Card className="overflow-hidden">
        {users.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Δεν έχουν προσκληθεί χρήστες ακόμα.</p>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Όνομα</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Προσκλήθηκε από</TableHead>
                    <TableHead className="text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        {u.name}
                        {!u.emailVerified && (
                          <Badge variant="warning" className="ml-2">
                            Εκκρεμεί
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{u.email}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {u.invitedByName ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <UserInviteActions
                          user={u}
                          feedback={feedback}
                          resendPendingId={resendPendingId}
                          onResend={handleResend}
                          onDelete={handleDelete}
                        />
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
                      {!u.emailVerified && (
                        <Badge variant="warning" className="ml-2">
                          Εκκρεμεί
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">{u.email}</div>
                    {u.invitedByName && (
                      <div className="text-sm text-muted-foreground">
                        Προσκλήθηκε από {u.invitedByName}
                      </div>
                    )}
                  </div>
                  <UserInviteActions
                    user={u}
                    feedback={feedback}
                    resendPendingId={resendPendingId}
                    onResend={handleResend}
                    onDelete={handleDelete}
                    align="start"
                  />
                </MobileListItem>
              ))}
            </MobileList>
          </>
        )}
      </Card>

      <InviteUserDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title="Προσθήκη χρήστη"
        description="Θα σταλεί email με σύνδεσμο για να ορίσει τον κωδικό του στον χρήστη."
        pending={invite.isPending}
        error={invite.error}
        onSubmit={(values) =>
          invite.mutate(values, {
            onSuccess: () => {
              setInviteOpen(false);
              toast.success("Η πρόσκληση στάλθηκε");
            },
          })
        }
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Αφαίρεση χρήστη"
        description={
          <>
            Είστε σίγουροι ότι θέλετε να αφαιρέσετε τον χρήστη{" "}
            <span className="font-medium text-foreground">{deleteTarget?.name}</span> από τον
            πελάτη;
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
