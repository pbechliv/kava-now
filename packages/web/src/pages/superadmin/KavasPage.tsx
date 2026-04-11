import { useState } from "react";
import {
  useSuperAdminKavas,
  useDeleteKava,
} from "../../lib/hooks/use-superadmin-kavas";
import { Button } from "../../components/ui/Button";
import { Spinner } from "../../components/ui/Spinner";

export function KavasPage() {
  const { data, isLoading } = useSuperAdminKavas();
  const deleteMutation = useDeleteKava();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  const kavas = data?.kavas ?? [];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Κάβες</h1>

      {kavas.length === 0 ? (
        <p className="mt-6 text-sm text-gray-500">Δεν υπάρχουν κάβες.</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Όνομα
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Slug
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Ημ/νία
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {kavas.map((kava) => (
                <tr key={kava.id}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {kava.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {kava.slug}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {kava.email}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(kava.createdAt).toLocaleDateString("el-GR")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {confirmId === kava.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs text-red-600">Σίγουρα;</span>
                        <Button
                          variant="danger"
                          size="sm"
                          loading={deleteMutation.isPending}
                          onClick={() => {
                            deleteMutation.mutate(kava.id, {
                              onSuccess: () => setConfirmId(null),
                            });
                          }}
                        >
                          Ναι
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmId(null)}
                        >
                          Όχι
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setConfirmId(kava.id)}
                      >
                        Διαγραφή
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
