import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useParams } from "react-router";
import {
  useCustomerUsers,
  useInviteCustomerUser,
  type InviteCustomerUserInput,
} from "../../lib/hooks/use-customer-users";
import { useCustomer } from "../../lib/hooks/use-customers";
import { useDeleteUser } from "../../lib/hooks/use-users";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Spinner } from "../../components/ui/Spinner";

export function CustomerUsersPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { data: customer } = useCustomer(id);
  const { data, isLoading } = useCustomerUsers(id);
  const invite = useInviteCustomerUser(id);
  const remove = useDeleteUser();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteCustomerUserInput>();

  const onInvite = (input: InviteCustomerUserInput) => {
    invite.mutate(input, {
      onSuccess: () => {
        reset();
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
    <div>
      <div className="flex items-center justify-between">
        <div>
          <Link
            to="/admin/customers"
            className="text-sm text-amber-600 hover:text-amber-700 font-medium"
          >
            ← Πίσω στους πελάτες
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">
            Χρήστες — {customer?.name ?? "…"}
          </h1>
        </div>
        <Button onClick={() => setInviteOpen(true)}>+ Προσθήκη χρήστη</Button>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        {users.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">
            Δεν έχουν προσκληθεί χρήστες ακόμα.
          </p>
        ) : (
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
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{u.email}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {u.invitedByName ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {confirmDeleteId === u.id ? (
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
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Όχι
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setConfirmDeleteId(u.id)}
                      >
                        Διαγραφή
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {inviteOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">
              Προσθήκη χρήστη
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Θα σταλεί email με σύνδεσμο σύνδεσης στον χρήστη.
            </p>
            <form onSubmit={handleSubmit(onInvite)} className="mt-4 space-y-4">
              <Input
                id="cust-user-name"
                label="Όνομα"
                placeholder="Γιάννης Παπαδόπουλος"
                error={errors.name?.message}
                {...register("name", { required: "Υποχρεωτικό" })}
              />
              <Input
                id="cust-user-email"
                type="email"
                label="Email"
                placeholder="user@example.com"
                error={errors.email?.message}
                {...register("email", { required: "Υποχρεωτικό" })}
              />
              {invite.error && (
                <p className="text-sm text-red-600">
                  {invite.error instanceof Error
                    ? invite.error.message
                    : "Σφάλμα"}
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
