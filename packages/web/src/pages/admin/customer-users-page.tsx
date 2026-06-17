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
import { ResponsiveTable, type ResponsiveTableColumn } from "@/components/ui/responsive-table";
import { Spinner } from "@/components/spinner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { InviteUserDialog } from "@/components/admin/invite-user-dialog";
import { UserInviteActions, useResendInviteFeedback } from "@/components/admin/user-invite-actions";
import { useDeleteConfirmation } from "@/lib/hooks/use-delete-confirmation";

type CustomerUserRow = NonNullable<ReturnType<typeof useCustomerUsers>["data"]>["users"][number];

export function CustomerUsersPage() {
  const { id = "", slug } = useParams<{ id: string; slug: string }>();
  const { data: customer } = useCustomer(id);
  const { data, isLoading } = useCustomerUsers(id);
  const invite = useInviteCustomerUser(id);
  const resend = useResendCustomerUserInvite(id);
  const remove = useDeleteUser();
  const [inviteOpen, setInviteOpen] = useState(false);
  const del = useDeleteConfirmation(remove);
  const { feedback, handleResend, resendPendingId } = useResendInviteFeedback(resend);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  const users = data?.users ?? [];

  const columns: ResponsiveTableColumn<CustomerUserRow>[] = [
    {
      header: "Όνομα",
      cellClassName: "font-medium",
      cell: (u) => (
        <>
          {u.name}
          {!u.emailVerified && (
            <Badge variant="warning" className="ml-2">
              Εκκρεμεί
            </Badge>
          )}
        </>
      ),
    },
    { header: "Email", cellClassName: "text-muted-foreground", cell: (u) => u.email },
    {
      header: "Προσκλήθηκε από",
      cellClassName: "text-muted-foreground",
      cell: (u) => u.invitedByName ?? "—",
    },
    {
      header: undefined,
      headClassName: "text-right",
      cellClassName: "text-right",
      cell: (u) => (
        <UserInviteActions
          user={u}
          feedback={feedback}
          resendPendingId={resendPendingId}
          onResend={handleResend}
          onDelete={del.request}
        />
      ),
    },
  ];

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

      {users.length === 0 ? (
        <Card className="overflow-hidden">
          <p className="p-6 text-sm text-muted-foreground">Δεν έχουν προσκληθεί χρήστες ακόμα.</p>
        </Card>
      ) : (
        <ResponsiveTable
          data={users}
          columns={columns}
          getRowKey={(u) => u.id}
          renderMobileItem={(u) => (
            <>
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
                onDelete={del.request}
                align="start"
              />
            </>
          )}
        />
      )}

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
        {...del.dialogProps}
        title="Αφαίρεση χρήστη"
        description={
          <>
            Είστε σίγουροι ότι θέλετε να αφαιρέσετε τον χρήστη{" "}
            <span className="font-medium text-foreground">{del.target?.name}</span> από τον πελάτη;
          </>
        }
        confirmLabel="Αφαίρεση"
        onConfirm={() => del.confirm(() => toast.success("Ο χρήστης αφαιρέθηκε"))}
      />
    </div>
  );
}
