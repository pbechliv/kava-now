import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ROLE_LABELS, inviteStaffUserSchema } from "@kava-now/shared";
import {
  useUsers,
  useInviteUser,
  useDeleteUser,
  useResendInvite,
  usePromoteToOwner,
  type InviteUserInput,
} from "@/lib/hooks/use-users";
import { useAuth } from "@/lib/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Spinner } from "@/components/spinner";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function UsersPage() {
  const { user: me, currentMembership } = useAuth();
  const { data, isLoading } = useUsers();
  const invite = useInviteUser();
  const remove = useDeleteUser();
  const resend = useResendInvite();
  const promote = usePromoteToOwner();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [resendFeedback, setResendFeedback] = useState<{
    id: string;
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const form = useForm<InviteUserInput>({
    resolver: zodResolver(inviteStaffUserSchema),
    defaultValues: { role: "staff", name: "", email: "" },
  });

  const onInvite = (input: InviteUserInput) => {
    invite.mutate(input, {
      onSuccess: () => {
        form.reset();
        setInviteOpen(false);
        toast.success("Η πρόσκληση στάλθηκε");
      },
    });
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

  const handleResend = (id: string) => {
    resend.mutate(id, {
      onSuccess: () =>
        setResendFeedback({
          id,
          kind: "success",
          message: "Η πρόσκληση στάλθηκε ξανά",
        }),
      onError: (err) =>
        setResendFeedback({
          id,
          kind: "error",
          message: err instanceof Error ? err.message : "Σφάλμα",
        }),
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Χρήστες</h1>
        <Button onClick={() => setInviteOpen(true)} className="self-start sm:self-auto">
          + Πρόσκληση
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
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
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {resendFeedback?.id === u.id && (
                          <span
                            className={`text-xs ${
                              resendFeedback.kind === "success"
                                ? "text-green-600"
                                : "text-destructive"
                            }`}
                          >
                            {resendFeedback.message}
                          </span>
                        )}
                        {!u.emailVerified && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={resend.isPending && resend.variables === u.id}
                            onClick={() => handleResend(u.id)}
                          >
                            {resend.isPending && resend.variables === u.id && (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Επανάληψη πρόσκλησης
                          </Button>
                        )}
                        {canPromote && u.role === "staff" && (
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
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => {
                            remove.reset();
                            setDeleteTarget({ id: u.id, name: u.name });
                          }}
                        >
                          Διαγραφή
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog
        open={inviteOpen}
        onOpenChange={(open) => {
          if (!open) form.reset();
          setInviteOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Πρόσκληση χρήστη</DialogTitle>
            <DialogDescription>
              Θα σταλεί email στον χρήστη με σύνδεσμο για να ορίσει τον κωδικό του.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onInvite)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Όνομα</FormLabel>
                    <FormControl>
                      <Input placeholder="Γιάννης Παπαδόπουλος" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="user@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <input type="hidden" {...form.register("role")} value="staff" />
              <p className="text-xs text-muted-foreground">
                Οι χρήστες πελατών δημιουργούνται από τη σελίδα{" "}
                <span className="font-medium">Πελάτες</span>.
              </p>

              {invite.error && (
                <p className="text-sm text-destructive">
                  {invite.error instanceof Error ? invite.error.message : "Σφάλμα"}
                </p>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    form.reset();
                    setInviteOpen(false);
                  }}
                >
                  Άκυρο
                </Button>
                <Button type="submit" disabled={invite.isPending}>
                  {invite.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Αποστολή
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

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
