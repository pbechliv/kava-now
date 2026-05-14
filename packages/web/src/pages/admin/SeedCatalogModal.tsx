import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Spinner } from "../../components/ui/Spinner";
import { useSeedCatalog, useImportSeedProducts } from "../../lib/hooks/use-seed-catalog";
import { UNIT_LABELS } from "@kava-now/shared";

interface SeedCatalogModalProps {
  open: boolean;
  onClose: () => void;
}

export function SeedCatalogModal({ open, onClose }: SeedCatalogModalProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importedCount, setImportedCount] = useState<number | null>(null);

  const { data: seeds, isLoading } = useSeedCatalog(search || undefined);
  const importMutation = useImportSeedProducts();

  if (!open) return null;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (!seeds) return;
    if (selected.size === seeds.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(seeds.map((s) => s.id)));
    }
  };

  const handleImport = async () => {
    if (selected.size === 0) return;
    const result = await importMutation.mutateAsync([...selected]);
    setImportedCount(result.imported);
    setSelected(new Set());
  };

  const handleClose = () => {
    setSearch("");
    setSelected(new Set());
    setImportedCount(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Εισαγωγή από Κατάλογο</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="border-b px-6 py-3">
          <Input
            placeholder="Αναζήτηση προϊόντων..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Success message */}
        {importedCount !== null && (
          <div className="mx-6 mt-3 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
            Εισήχθησαν {importedCount} προϊόντα επιτυχώς!
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : !seeds || seeds.length === 0 ? (
            <p className="text-center text-sm text-gray-500 py-8">Δεν βρέθηκαν προϊόντα</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-3">
                    <input
                      type="checkbox"
                      checked={selected.size === seeds.length}
                      onChange={toggleAll}
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th className="pb-2">Όνομα</th>
                  <th className="pb-2">Brand</th>
                  <th className="pb-2">Κατηγορία</th>
                  <th className="pb-2">Μονάδα</th>
                </tr>
              </thead>
              <tbody>
                {seeds.map((seed) => (
                  <tr key={seed.id} className="border-b last:border-0">
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        checked={selected.has(seed.id)}
                        onChange={() => toggleSelect(seed.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="py-2 font-medium text-gray-900">{seed.name}</td>
                    <td className="py-2 text-gray-600">{seed.brand ?? "-"}</td>
                    <td className="py-2 text-gray-600">{seed.categoryName}</td>
                    <td className="py-2 text-gray-600">{UNIT_LABELS[seed.unit]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-6 py-4">
          <span className="text-sm text-gray-500">
            {selected.size > 0 ? `${selected.size} επιλεγμένα` : "Κανένα επιλεγμένο"}
          </span>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={handleClose}>
              Κλείσιμο
            </Button>
            <Button
              onClick={handleImport}
              disabled={selected.size === 0}
              loading={importMutation.isPending}
            >
              Εισαγωγή
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
