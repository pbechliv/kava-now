import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { Button } from "../../components/ui/Button";
import { Spinner } from "../../components/ui/Spinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { useCustomer } from "../../lib/hooks/use-customers";
import {
  useCustomerProducts,
  useUpdateCustomerProducts,
  type CustomerProductRow,
} from "../../lib/hooks/use-customer-products";

interface LocalAssignment {
  productId: string;
  assigned: boolean;
  customPrice: string; // kept as string for input control
}

export function CustomerProductsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: customer } = useCustomer(id);
  const { data: rows, isLoading } = useCustomerProducts(id);
  const updateMutation = useUpdateCustomerProducts(id!);

  const [assignments, setAssignments] = useState<LocalAssignment[]>([]);

  // Sync from server data
  useEffect(() => {
    if (rows) {
      setAssignments(
        rows.map((r) => ({
          productId: r.product.id,
          assigned: r.assigned,
          customPrice:
            r.customPrice != null ? String(r.customPrice) : "",
        })),
      );
    }
  }, [rows]);

  const toggleAssign = (productId: string) => {
    setAssignments((prev) =>
      prev.map((a) =>
        a.productId === productId ? { ...a, assigned: !a.assigned } : a,
      ),
    );
  };

  const setCustomPrice = (productId: string, value: string) => {
    setAssignments((prev) =>
      prev.map((a) =>
        a.productId === productId ? { ...a, customPrice: value } : a,
      ),
    );
  };

  const selectAll = () =>
    setAssignments((prev) => prev.map((a) => ({ ...a, assigned: true })));
  const deselectAll = () =>
    setAssignments((prev) => prev.map((a) => ({ ...a, assigned: false })));

  const handleSave = async () => {
    const assigned = assignments.filter((a) => a.assigned);
    await updateMutation.mutateAsync({
      assignments: assigned.map((a) => ({
        productId: a.productId,
        customPrice: a.customPrice ? Number(a.customPrice) : null,
        active: true,
      })),
    });
  };

  // Build a map for quick lookup from rows
  const rowMap = new Map<string, CustomerProductRow>();
  rows?.forEach((r) => rowMap.set(r.product.id, r));

  const resolveDisplayPrice = (a: LocalAssignment): string => {
    const row = rowMap.get(a.productId);
    if (!row) return "-";
    if (a.customPrice) {
      return Number(a.customPrice).toFixed(2);
    }
    return row.resolvedPrice.toFixed(2);
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Προϊόντα Πελάτη
          </h1>
          {customer && (
            <p className="mt-1 text-sm text-gray-500">{customer.name}</p>
          )}
        </div>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => navigate("/admin/customers")}
          >
            Πίσω
          </Button>
          <Button onClick={handleSave} loading={updateMutation.isPending}>
            Αποθήκευση
          </Button>
        </div>
      </div>

      {/* Bulk actions */}
      <div className="mt-4 flex gap-3">
        <Button variant="ghost" size="sm" onClick={selectAll}>
          Επιλογή Όλων
        </Button>
        <Button variant="ghost" size="sm" onClick={deselectAll}>
          Αποεπιλογή Όλων
        </Button>
      </div>

      <div className="mt-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : !rows || rows.length === 0 ? (
          <EmptyState message="Δεν υπάρχουν προϊόντα" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-500">
                  <th className="w-10 px-4 py-3" />
                  <th className="px-4 py-3 font-medium">Προϊόν</th>
                  <th className="px-4 py-3 font-medium text-right">
                    Τιμή βάσης
                  </th>
                  <th className="px-4 py-3 font-medium text-right">
                    Ειδική τιμή
                  </th>
                  <th className="px-4 py-3 font-medium text-right">
                    Τελική τιμή
                  </th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => {
                  const row = rowMap.get(a.productId);
                  if (!row) return null;
                  return (
                    <tr
                      key={a.productId}
                      className={`border-b last:border-0 ${
                        a.assigned ? "bg-amber-50/40" : "hover:bg-gray-50"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={a.assigned}
                          onChange={() => toggleAssign(a.productId)}
                          className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {row.product.name}
                        {row.product.brand && (
                          <span className="ml-2 text-xs text-gray-400">
                            {row.product.brand}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {Number(row.product.basePrice).toFixed(2)} &euro;
                      </td>
                      <td className="px-4 py-3 text-right">
                        {a.assigned ? (
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="-"
                            value={a.customPrice}
                            onChange={(e) =>
                              setCustomPrice(a.productId, e.target.value)
                            }
                            className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {a.assigned
                          ? `${resolveDisplayPrice(a)} \u20AC`
                          : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {updateMutation.error && (
        <p className="mt-4 text-sm text-red-600">
          {updateMutation.error.message}
        </p>
      )}
    </div>
  );
}
