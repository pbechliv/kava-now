import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
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
import { EmptyState } from "@/components/empty-state";
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
  const { id, slug } = useParams<{ id: string; slug: string }>();
  const navigate = useNavigate();
  const { data: customer } = useCustomer(id);
  const { data: rows, isLoading } = useCustomerBrandPricing(id);
  const updateMutation = useUpdateCustomerBrandPricing(id ?? "");

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

  const handleSave = () => {
    updateMutation.mutate(
      {
        assignments: assignments.map((a) => ({
          brand: a.brand,
          discountPct: a.discountPct ? Number(a.discountPct) : 0,
        })),
      },
      { onSuccess: () => toast.success("Η τιμολόγηση αποθηκεύτηκε") },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Τιμολόγηση Πελάτη</h1>
          {customer && <p className="mt-1 text-sm text-muted-foreground">{customer.name}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(`/k/${slug}/admin/customers`)}>
            Πίσω
          </Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Αποθήκευση
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : !rows || rows.length === 0 ? (
        <EmptyState message="Δεν υπάρχουν μάρκες προϊόντων" />
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Μάρκα</TableHead>
                  <TableHead className="text-right">Έκπτωση %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => (
                  <TableRow key={a.brand} className={a.discountPct ? "bg-primary/5" : undefined}>
                    <TableCell className="font-medium">{a.brand}</TableCell>
                    <TableCell className="text-right">
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <MobileList>
            {assignments.map((a) => (
              <MobileListItem key={a.brand} className={a.discountPct ? "bg-primary/5" : undefined}>
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
              </MobileListItem>
            ))}
          </MobileList>
        </Card>
      )}

      {updateMutation.error && (
        <p className="text-sm text-destructive">{updateMutation.error.message}</p>
      )}
    </div>
  );
}
