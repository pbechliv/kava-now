import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  useUsers,
  useInviteUser,
  useDeleteUser,
  useResendInvite,
  usePromoteToOwner,
  type InviteUserInput,
} from "../../lib/hooks/use-users";
import { useAuth } from "../../lib/hooks/use-auth";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Spinner } from "../../components/ui/Spinner";

const ROLE_LABELS: Record<string, string> = {
  owner: "Ιδιοκτήτης",
  staff: "Προσωπικό",
  customer: "Πελάτης",
};

export function UsersPage() {
  const { user: me } = useAuth();
  const { data, isLoading } = useUsers();
  const invite = useInviteUser();
  const remove = useDeleteUser();
  const resend = useResendInvite();
  const promote = usePromoteToOwner();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [resendFeedback, setResendFeedback] = useState<{
    id: string;
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteUserInput>({ defaultValues: { role: "staff" } });

  const onInvite = (input: InviteUserInput) => {
    invite.mutate(input, {
      onSuccess: () => {
        reset();
        setInviteOpen(false);
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
  const canPromote = me?.role === "owner";

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Χρήστες</h1>
        <Button onClick={() => setInviteOpen(true)}>+ Πρόσκληση</Button>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Όνομα
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Email
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Ρόλος
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Προσκλήθηκε από
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {u.name}
                  {u.id === me?.id && <span className="ml-2 text-xs text-gray-500">(εσείς)</span>}
                  {!u.emailVerified && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">
                      Εκκρεμεί
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{u.email}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{ROLE_LABELS[u.role] ?? u.role}</td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {u.invitedByName ? (
                    <span title={u.invitedByEmail ?? ""}>{u.invitedByName}</span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {u.id !== me?.id &&
                    (confirmDeleteId === u.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs text-red-600">Σίγουρα;</span>
                        <Button
                          variant="danger"
                          size="sm"
                          loading={remove.isPending}
                          onClick={() =>
                            remove.mutate(u.id, {
                              onSuccess: () => setConfirmDeleteId(null),
                            })
                          }
                        >
                          Ναι
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>
                          Όχι
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        {resendFeedback?.id === u.id && (
                          <span
                            className={`text-xs ${
                              resendFeedback.kind === "success" ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {resendFeedback.message}
                          </span>
                        )}
                        {!u.emailVerified && (
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={resend.isPending && resend.variables === u.id}
                            onClick={() => handleResend(u.id)}
                          >
                            Επανάληψη πρόσκλησης
                          </Button>
                        )}
                        {canPromote && u.role === "staff" && (
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={promote.isPending && promote.variables === u.id}
                            onClick={() => promote.mutate(u.id)}
                          >
                            Μετατροπή σε ιδιοκτήτη
                          </Button>
                        )}
                        <Button variant="danger" size="sm" onClick={() => setConfirmDeleteId(u.id)}>
                          Διαγραφή
                        </Button>
                      </div>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {inviteOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">Πρόσκληση χρήστη</h2>
            <p className="mt-1 text-sm text-gray-500">
              Θα σταλεί email στον χρήστη με σύνδεσμο σύνδεσης.
            </p>

            <form onSubmit={handleSubmit(onInvite)} className="mt-4 space-y-4">
              <Input
                id="invite-name"
                label="Όνομα"
                placeholder="Γιάννης Παπαδόπουλος"
                error={errors.name?.message}
                {...register("name", { required: "Υποχρεωτικό" })}
              />
              <Input
                id="invite-email"
                type="email"
                label="Email"
                placeholder="user@example.com"
                error={errors.email?.message}
                {...register("email", { required: "Υποχρεωτικό" })}
              />
              <input type="hidden" {...register("role")} value="staff" />
              <p className="text-xs text-gray-500">
                Οι χρήστες πελατών δημιουργούνται από τη σελίδα{" "}
                <span className="font-medium">Πελάτες</span>.
              </p>

              {invite.error && (
                <p className="text-sm text-red-600">
                  {invite.error instanceof Error ? invite.error.message : "Σφάλμα"}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    reset();
                    setInviteOpen(false);
                  }}
                >
                  Άκυρο
                </Button>
                <Button type="submit" loading={invite.isPending}>
                  Αποστολή
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
