import { useState, useEffect } from "react";
import { useParams, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsiveTable, type ResponsiveTableColumn } from "@/components/ui/responsive-table";
import { Spinner } from "@/components/spinner";
import { EmptyState } from "@/components/empty-state";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { useCustomer } from "@/lib/hooks/use-customers";
import {
  useCustomerBrandPricing,
  useUpdateCustomerBrandPricing,
} from "@/lib/hooks/use-customer-brand-pricing";

interface LocalAssignment {
  brand: string;
  discountPct: string;
}

export function CustomerBrandPricingPage() {
  const { id = "", slug } = useParams({ strict: false });
  const navigate = useNavigate();
  const { data: customer } = useCustomer(id);
  const { data: rows, isLoading } = useCustomerBrandPricing(id);
  const updateMutation = useUpdateCustomerBrandPricing(id ?? "");

  const [assignments, setAssignments] = useState<LocalAssignment[]>([]);
  // Last-saved discounts (brand → numeric %), the baseline the dirty check
  // compares against. Seeded from the server rows and refreshed on save, so a
  // successful save clears the dirty state without waiting for a refetch (#174).
  const [baseline, setBaseline] = useState<Record<string, number>>({});

  useEffect(() => {
    if (rows) {
      setAssignments(
        rows.map((r) => ({
          brand: r.brand,
          discountPct: r.discountPct > 0 ? String(r.discountPct) : "",
        })),
      );
      setBaseline(Object.fromEntries(rows.map((r) => [r.brand, r.discountPct])));
    }
  }, [rows]);

  const setDiscount = (brand: string, value: string) => {
    setAssignments((prev) =>
      prev.map((a) => (a.brand === brand ? { ...a, discountPct: value } : a)),
    );
  };

  const toNumber = (value: string) => (value ? Number(value) : 0);

  // Any line whose edited discount differs from the last-saved value. "" and
  // "0" both normalize to 0, so clearing a zero field isn't flagged as a change.
  const dirty = assignments.some((a) => toNumber(a.discountPct) !== (baseline[a.brand] ?? 0));

  const columns: ResponsiveTableColumn<LocalAssignment>[] = [
    { header: "Μάρκα", cellClassName: "font-medium", cell: (a) => a.brand },
    {
      header: "Έκπτωση %",
      headClassName: "text-right",
      cellClassName: "text-right",
      cell: (a) => (
        <Input
          type="number"
          step="0.01"
          min="0"
          max="100"
          placeholder="0"
          value={a.discountPct}
          onChange={(e) => setDiscount(a.brand, e.target.value)}
          className="ml-auto w-24 text-right"
        />
      ),
    },
  ];

  const handleSave = () => {
    const payload = assignments.map((a) => ({
      brand: a.brand,
      discountPct: toNumber(a.discountPct),
    }));
    updateMutation.mutate(
      { assignments: payload },
      {
        onSuccess: () => {
          toast.success("Η τιμολόγηση αποθηκεύτηκε");
          setBaseline(Object.fromEntries(payload.map((p) => [p.brand, p.discountPct])));
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <UnsavedChangesGuard when={dirty} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Τιμολόγηση Πελάτη</h1>
          {customer && <p className="mt-1 text-sm text-muted-foreground">{customer.name}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate({ to: `/k/${slug}/admin/customers` })}>
            Πίσω
          </Button>
          <Button onClick={handleSave} disabled={!dirty || updateMutation.isPending}>
            {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Αποθήκευση
          </Button>
        </div>
      </div>

      {/* Next to the Save button, not below the (possibly long) table — an
          error at the bottom of the page is invisible when saving from the top. */}
      {updateMutation.error && (
        <p className="text-sm text-destructive">{updateMutation.error.message}</p>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : !rows || rows.length === 0 ? (
        <EmptyState message="Δεν υπάρχουν μάρκες προϊόντων" />
      ) : (
        <ResponsiveTable
          data={assignments}
          columns={columns}
          getRowKey={(a) => a.brand}
          rowClassName={(a) => (a.discountPct ? "bg-primary/5" : undefined)}
          mobileItemClassName={(a) => (a.discountPct ? "bg-primary/5" : undefined)}
          renderMobileItem={(a) => (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 font-medium">{a.brand}</div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-sm text-muted-foreground">Έκπτωση %</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="0"
                  value={a.discountPct}
                  onChange={(e) => setDiscount(a.brand, e.target.value)}
                  className="w-24 text-right"
                />
              </div>
            </div>
          )}
        />
      )}
    </div>
  );
}
