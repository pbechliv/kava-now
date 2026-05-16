import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Spinner } from "@/components/spinner";
import { useSeedCatalog, useImportSeedProducts } from "@/lib/hooks/use-seed-catalog";
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
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Εισαγωγή από Κατάλογο</DialogTitle>
        </DialogHeader>

        <Input
          placeholder="Αναζήτηση προϊόντων..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {importedCount !== null && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
            Εισήχθησαν {importedCount} προϊόντα επιτυχώς!
          </div>
        )}

        <div className="max-h-[50vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : !seeds || seeds.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Δεν βρέθηκαν προϊόντα</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selected.size === seeds.length}
                      onCheckedChange={toggleAll}
                      aria-label="Επιλογή όλων"
                    />
                  </TableHead>
                  <TableHead>Όνομα</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Κατηγορία</TableHead>
                  <TableHead>Μονάδα</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {seeds.map((seed) => (
                  <TableRow key={seed.id}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(seed.id)}
                        onCheckedChange={() => toggleSelect(seed.id)}
                        aria-label={`Επιλογή ${seed.name}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{seed.name}</TableCell>
                    <TableCell className="text-muted-foreground">{seed.brand ?? "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{seed.categoryName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {UNIT_LABELS[seed.unit]}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter className="flex flex-row items-center justify-between sm:justify-between">
          <span className="text-sm text-muted-foreground">
            {selected.size > 0 ? `${selected.size} επιλεγμένα` : "Κανένα επιλεγμένο"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose}>
              Κλείσιμο
            </Button>
            <Button
              onClick={handleImport}
              disabled={selected.size === 0 || importMutation.isPending}
            >
              {importMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Εισαγωγή
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
