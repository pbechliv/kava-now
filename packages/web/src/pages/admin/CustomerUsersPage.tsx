import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useParams } from "react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { inviteCustomerUserSchema } from "@kava-now/shared";
import {
  useCustomerUsers,
  useInviteCustomerUser,
  useResendCustomerUserInvite,
  type InviteCustomerUserInput,
} from "@/lib/hooks/use-customer-users";
import { useCustomer } from "@/lib/hooks/use-customers";
import { useDeleteUser } from "@/lib/hooks/use-users";
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

export function CustomerUsersPage() {
  const { id = "", slug } = useParams<{ id: string; slug: string }>();
  const { data: customer } = useCustomer(id);
  const { data, isLoading } = useCustomerUsers(id);
  const invite = useInviteCustomerUser(id);
  const resend = useResendCustomerUserInvite(id);
  const remove = useDeleteUser();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [resendFeedback, setResendFeedback] = useState<{
    id: string;
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const form = useForm<InviteCustomerUserInput>({
    resolver: zodResolver(inviteCustomerUserSchema),
    defaultValues: { name: "", email: "" },
  });

  const handleResend = (userId: string) => {
    resend.mutate(userId, {
      onSuccess: () =>
        setResendFeedback({
          id: userId,
          kind: "success",
          message: "Η πρόσκληση στάλθηκε ξανά",
        }),
      onError: (err) =>
        setResendFeedback({
          id: userId,
          kind: "error",
          message: err instanceof Error ? err.message : "Σφάλμα",
        }),
    });
  };

  const onInvite = (input: InviteCustomerUserInput) => {
    invite.mutate(input, {
      onSuccess: () => {
        form.reset();
        setInviteOpen(false);
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
          <div className="overflow-x-auto">
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
                      {confirmDeleteId === u.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs text-destructive">Σίγουρα;</span>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={remove.isPending}
                            onClick={() =>
                              remove.mutate(u.id, {
                                onSuccess: () => setConfirmDeleteId(null),
                              })
                            }
                          >
                            {remove.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Ναι
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Όχι
                          </Button>
                        </div>
                      ) : (
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
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setConfirmDeleteId(u.id)}
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
        )}
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
            <DialogTitle>Προσθήκη χρήστη</DialogTitle>
            <DialogDescription>
              Θα σταλεί email με σύνδεσμο για να ορίσει τον κωδικό του στον χρήστη.
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
    </div>
  );
}
