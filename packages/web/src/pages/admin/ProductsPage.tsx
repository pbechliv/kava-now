import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Spinner } from "../../components/ui/Spinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { Badge } from "../../components/ui/Badge";
import { useProducts, useUpdateProduct, useDeleteProduct } from "../../lib/hooks/use-products";
import { useCategories } from "../../lib/hooks/use-categories";
import { SeedCatalogModal } from "./SeedCatalogModal";
import { UNIT_LABELS } from "@kava-now/shared";

export function ProductsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [seedModalOpen, setSeedModalOpen] = useState(false);

  const { data: products, isLoading } = useProducts({
    search: search || undefined,
    categoryId: categoryFilter || undefined,
  });
  const { data: categories } = useCategories();
  const updateMutation = useUpdateProduct();
  const deleteMutation = useDeleteProduct();

  const handleToggleActive = (id: string, currentActive: boolean) => {
    updateMutation.mutate({ id, data: { active: !currentActive } });
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Είστε σίγουροι ότι θέλετε να διαγράψετε το "${name}";`)) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Προϊόντα</h1>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setSeedModalOpen(true)}>
            Εισαγωγή από Κατάλογο
          </Button>
          <Button onClick={() => navigate("/admin/products/new")}>
            Νέο Προϊόν
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-4 flex gap-4">
        <div className="flex-1">
          <Input
            placeholder="Αναζήτηση με όνομα ή brand..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="">Όλες οι κατηγορίες</option>
          {categories?.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="mt-6">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : !products || products.length === 0 ? (
          <EmptyState
            message="Δεν βρέθηκαν προϊόντα"
            actionLabel="Νέο Προϊόν"
            onAction={() => navigate("/admin/products/new")}
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">Όνομα</th>
                  <th className="px-4 py-3 font-medium">Brand</th>
                  <th className="px-4 py-3 font-medium">Κατηγορία</th>
                  <th className="px-4 py-3 font-medium text-right">Τιμή</th>
                  <th className="px-4 py-3 font-medium">Μονάδα</th>
                  <th className="px-4 py-3 font-medium text-center">Ενεργό</th>
                  <th className="px-4 py-3 font-medium text-right">Ενέργειες</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {product.name}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {product.brand ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {product.categoryName ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900">
                      {Number(product.basePrice).toFixed(2)} &euro;
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {UNIT_LABELS[product.unit]}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() =>
                          handleToggleActive(product.id, product.active)
                        }
                        className="inline-flex"
                      >
                        <Badge color={product.active ? "green" : "gray"}>
                          {product.active ? "Ναι" : "Όχι"}
                        </Badge>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            navigate(`/admin/products/${product.id}`)
                          }
                        >
                          Επεξεργασία
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() =>
                            handleDelete(product.id, product.name)
                          }
                        >
                          Διαγραφή
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SeedCatalogModal
        open={seedModalOpen}
        onClose={() => setSeedModalOpen(false)}
      />
    </div>
  );
}
