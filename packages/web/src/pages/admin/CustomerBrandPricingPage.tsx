import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { Button } from "../../components/ui/Button";
import { Spinner } from "../../components/ui/Spinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { useCustomer } from "../../lib/hooks/use-customers";
import {
  useCustomerBrandPricing,
  useUpdateCustomerBrandPricing,
} from "../../lib/hooks/use-customer-brand-pricing";

interface LocalAssignment {
  brand: string;
  discountPct: string;
}

export function CustomerBrandPricingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: customer } = useCustomer(id);
  const { data: rows, isLoading } = useCustomerBrandPricing(id);
  const updateMutation = useUpdateCustomerBrandPricing(id!);

  const [assignments, setAssignments] = useState<LocalAssignment[]>([]);

  useEffect(() => {
    if (rows) {
      setAssignments(
        rows.map((r) => ({
          brand: r.brand,
          discountPct: r.discountPct > 0 ? String(r.discountPct) : "",
        })),
      );
    }
  }, [rows]);

  const setDiscount = (brand: string, value: string) => {
    setAssignments((prev) =>
      prev.map((a) => (a.brand === brand ? { ...a, discountPct: value } : a)),
    );
  };

  const handleSave = async () => {
    await updateMutation.mutateAsync({
      assignments: assignments.map((a) => ({
        brand: a.brand,
        discountPct: a.discountPct ? Number(a.discountPct) : 0,
      })),
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Τιμολόγηση Πελάτη</h1>
          {customer && <p className="mt-1 text-sm text-gray-500">{customer.name}</p>}
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => navigate("/admin/customers")}>
            Πίσω
          </Button>
          <Button onClick={handleSave} loading={updateMutation.isPending}>
            Αποθήκευση
          </Button>
        </div>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : !rows || rows.length === 0 ? (
          <EmptyState message="Δεν υπάρχουν μάρκες προϊόντων" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">Μάρκα</th>
                  <th className="px-4 py-3 font-medium text-right">Έκπτωση %</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr
                    key={a.brand}
                    className={`border-b last:border-0 ${
                      a.discountPct ? "bg-amber-50/40" : "hover:bg-gray-50"
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{a.brand}</td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        placeholder="0"
                        value={a.discountPct}
                        onChange={(e) => setDiscount(a.brand, e.target.value)}
                        className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {updateMutation.error && (
        <p className="mt-4 text-sm text-red-600">{updateMutation.error.message}</p>
      )}
    </div>
  );
}
