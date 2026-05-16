import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useTenantSlug } from "@/lib/hooks/use-tenant-api";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Spinner } from "@/components/spinner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/hooks/use-auth";
import { useProducts, useImportProducts } from "@/lib/hooks/use-products";
import { parseFile, type Encoding, type ParseResult } from "@/lib/spreadsheet-parser";
import {
  applyMapping,
  loadMapping,
  persistMapping,
  REQUIRED_TARGETS,
  suggestMapping,
  TARGET_LABELS,
  type AppliedRow,
  type Mapping,
  type TargetField,
} from "@/lib/import-mapping";

type Step = "upload" | "map" | "preview";

const TARGET_ORDER: TargetField[] = [
  "name",
  "brand",
  "basePrice",
  "categoryName",
  "description",
  "sku",
  "unit",
  "volumeMl",
  "alcoholPct",
  "imageUrl",
  "active",
];

const PREVIEW_LIMIT = 20;

export function ProductsImportPage() {
  const navigate = useNavigate();
  const { kava } = useAuth();
  const slug = useTenantSlug();
  const productsPath = `/k/${slug}/admin/products`;
  const importMutation = useImportProducts();

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [encoding, setEncoding] = useState<Encoding>("utf-8");
  const [skipRows, setSkipRows] = useState(0);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [mapping, setMapping] = useState<Mapping>({});
  const [showAllRows, setShowAllRows] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const { data: existingProducts } = useProducts({ pageSize: 100 });
  const existingKeys = useMemo(() => {
    if (!existingProducts) return new Set<string>();
    return new Set(
      existingProducts.data.map((p) => `${p.name.toLowerCase()}|${p.brand.toLowerCase()}`),
    );
  }, [existingProducts]);

  const applied: AppliedRow[] = useMemo(
    () => (parsed ? applyMapping(parsed.rows, mapping) : []),
    [parsed, mapping],
  );

  const counts = useMemo(() => {
    let newRows = 0;
    let updateRows = 0;
    let errorRows = 0;
    for (const r of applied) {
      if (!r.row) {
        errorRows++;
        continue;
      }
      const key = `${r.row.name.toLowerCase()}|${r.row.brand.toLowerCase()}`;
      if (existingKeys.has(key)) updateRows++;
      else newRows++;
    }
    return { newRows, updateRows, errorRows };
  }, [applied, existingKeys]);

  const mappingComplete = REQUIRED_TARGETS.every((t) => mapping[t] != null);
  const validRows = applied.flatMap((r) => (r.row ? [r.row] : []));

  const doParse = async (selected: File, withEncoding: Encoding, withSkip: number) => {
    setParsing(true);
    setParseError(null);
    setParsed(null);
    try {
      const result = await parseFile(selected, {
        encoding: withEncoding,
        skipFirstRows: withSkip,
      });
      if (result.columns.length === 0) {
        setParseError("Δεν εντοπίστηκαν στήλες στο αρχείο.");
      } else if (result.rows.length === 0) {
        setParseError("Το αρχείο δεν περιέχει γραμμές δεδομένων.");
      } else {
        setParsed(result);
        const suggested = suggestMapping(result.columns);
        const persisted = kava ? loadMapping(kava.slug) : null;
        const merged: Mapping = { ...suggested };
        if (persisted) {
          for (const [k, v] of Object.entries(persisted) as [TargetField, string][]) {
            if (v && result.columns.includes(v)) merged[k] = v;
          }
        }
        setMapping(merged);
      }
    } catch (err) {
      setParseError(
        err instanceof Error ? `Αδυναμία ανάγνωσης: ${err.message}` : "Αδυναμία ανάγνωσης αρχείου.",
      );
    } finally {
      setParsing(false);
    }
  };

  const handleFile = (selected: File | null) => {
    setFile(selected);
    if (!selected) {
      setParsed(null);
      setParseError(null);
      return;
    }
    void doParse(selected, encoding, skipRows);
  };

  const handleReparse = () => {
    if (file) void doParse(file, encoding, skipRows);
  };

  const handleContinueToMap = () => {
    if (!parsed) return;
    setStep("map");
  };

  const handleContinueToPreview = () => {
    if (kava) persistMapping(kava.slug, mapping);
    setStep("preview");
  };

  const handleImport = async () => {
    if (validRows.length === 0) return;
    const result = await importMutation.mutateAsync(validRows);
    void navigate(productsPath, { state: { importResult: result } });
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) handleFile(dropped);
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Εισαγωγή προϊόντων από αρχείο</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ανέβασμα CSV ή Excel · Αντιστοίχιση στηλών · Προεπισκόπηση
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate(productsPath)}>
          Πίσω στα προϊόντα
        </Button>
      </div>

      <Stepper current={step} />

      {step === "upload" && (
        <Card className="p-6">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={cn(
              "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors sm:p-10",
              isDragging
                ? "border-primary bg-primary/5"
                : "border-input bg-muted/30 hover:bg-muted/60",
            )}
          >
            <Upload className="h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Σύρετε το αρχείο εδώ ή επιλέξτε αρχείο</p>
            <p className="mt-1 text-xs text-muted-foreground">CSV, XLSX ή XLS</p>
            <label className="mt-4 inline-flex">
              <span className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
                Επιλογή αρχείου
              </span>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {file && (
              <p className="mt-4 text-xs text-muted-foreground">
                Επιλεγμένο: <span className="font-medium text-foreground">{file.name}</span> (
                {Math.ceil(file.size / 1024)} KB)
              </p>
            )}
          </div>

          {file && file.name.toLowerCase().endsWith(".csv") && (
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="encoding">Κωδικοποίηση</Label>
                <Select value={encoding} onValueChange={(v) => setEncoding(v as Encoding)}>
                  <SelectTrigger id="encoding" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="utf-8">
                      UTF-8 (αυτόματη επαναφορά σε Windows-1253)
                    </SelectItem>
                    <SelectItem value="windows-1253">Windows-1253 (ελληνικά)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="skipRows">Παράλειψη πρώτων γραμμών</Label>
                <Input
                  id="skipRows"
                  type="number"
                  min={0}
                  value={skipRows}
                  onChange={(e) => setSkipRows(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
              <div className="sm:col-span-2">
                <Button variant="outline" size="sm" onClick={handleReparse}>
                  Επανανάγνωση
                </Button>
              </div>
            </div>
          )}

          {parsing && (
            <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="h-4 w-4" /> Ανάλυση αρχείου...
            </div>
          )}

          {parseError && (
            <p className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {parseError}
            </p>
          )}

          {parsed && !parsing && (
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Εντοπίστηκαν{" "}
                <span className="font-medium text-foreground">{parsed.columns.length}</span> στήλες
                και <span className="font-medium text-foreground">{parsed.rows.length}</span>{" "}
                γραμμές δεδομένων.
              </p>
              <Button onClick={handleContinueToMap}>Συνέχεια στην αντιστοίχιση</Button>
            </div>
          )}
        </Card>
      )}

      {step === "map" && parsed && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold">Αντιστοίχιση στηλών</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Συνδέστε κάθε πεδίο προϊόντος με μια στήλη του αρχείου. Τα πεδία με * είναι υποχρεωτικά.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            {TARGET_ORDER.map((target) => {
              const isRequired = REQUIRED_TARGETS.includes(target);
              return (
                <div key={target} className="space-y-2">
                  <Label htmlFor={`map-${target}`}>
                    {TARGET_LABELS[target]}
                    {isRequired && <span className="ml-0.5 text-destructive">*</span>}
                  </Label>
                  <Select
                    value={mapping[target] || "none"}
                    onValueChange={(v) =>
                      setMapping((prev) => {
                        const next = { ...prev };
                        if (v === "none") {
                          delete next[target];
                        } else {
                          next[target] = v;
                        }
                        return next;
                      })
                    }
                  >
                    <SelectTrigger id={`map-${target}`} className="w-full">
                      <SelectValue placeholder="— αγνόηση —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— αγνόηση —</SelectItem>
                      {parsed.columns.map((col) => (
                        <SelectItem key={col} value={col}>
                          {col}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="outline" onClick={() => setStep("upload")}>
              Πίσω
            </Button>
            <Button onClick={handleContinueToPreview} disabled={!mappingComplete}>
              Συνέχεια στην προεπισκόπηση
            </Button>
          </div>
          {!mappingComplete && (
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
              Συνδέστε τα πεδία Όνομα, Μάρκα και Τιμή για να συνεχίσετε.
            </p>
          )}
        </Card>
      )}

      {step === "preview" && parsed && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold">Προεπισκόπηση</h2>

          <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
            Θα εισαχθούν <span className="font-semibold">{counts.newRows + counts.updateRows}</span>{" "}
            προϊόντα: <span className="font-semibold">{counts.newRows}</span> νέα,{" "}
            <span className="font-semibold">{counts.updateRows}</span> θα ενημερωθούν.
            {counts.errorRows > 0 && (
              <>
                {" "}
                <span className="font-semibold text-destructive">{counts.errorRows}</span> γραμμές
                έχουν σφάλματα και θα παραλειφθούν.
              </>
            )}
          </div>

          <div className="mt-4 overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Κατάσταση</TableHead>
                  <TableHead>Όνομα</TableHead>
                  <TableHead>Μάρκα</TableHead>
                  <TableHead>Κατηγορία</TableHead>
                  <TableHead className="text-right">Τιμή</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applied.slice(0, showAllRows ? applied.length : PREVIEW_LIMIT).map((r, i) => {
                  const key = r.row
                    ? `${r.row.name.toLowerCase()}|${r.row.brand.toLowerCase()}`
                    : "";
                  const status: "new" | "update" | "error" = !r.row
                    ? "error"
                    : existingKeys.has(key)
                      ? "update"
                      : "new";
                  return (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell>
                        <StatusBadge status={status} />
                        {r.error && <p className="mt-1 text-xs text-destructive">{r.error}</p>}
                      </TableCell>
                      <TableCell>{r.row?.name ?? r.raw[mapping.name ?? ""] ?? "-"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.row?.brand ?? r.raw[mapping.brand ?? ""] ?? "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.row?.categoryName ?? "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.row ? `${r.row.basePrice.toFixed(2)} €` : "-"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {applied.length > PREVIEW_LIMIT && (
            <div className="mt-3 text-center">
              <Button variant="ghost" size="sm" onClick={() => setShowAllRows((v) => !v)}>
                {showAllRows ? "Δείτε λιγότερες" : `Δείτε όλες (${applied.length})`}
              </Button>
            </div>
          )}

          {importMutation.error && (
            <p className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {importMutation.error.message}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="outline" onClick={() => setStep("map")}>
              Πίσω στην αντιστοίχιση
            </Button>
            <Button
              onClick={handleImport}
              disabled={importMutation.isPending || validRows.length === 0}
            >
              {importMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Εισαγωγή {validRows.length} προϊόντων
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function Stepper({ current }: { current: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: "upload", label: "1. Ανέβασμα" },
    { id: "map", label: "2. Αντιστοίχιση" },
    { id: "preview", label: "3. Προεπισκόπηση" },
  ];
  const currentIdx = steps.findIndex((s) => s.id === current);
  return (
    <ol className="flex flex-wrap gap-2 text-sm">
      {steps.map((s, i) => {
        const state = i < currentIdx ? "done" : i === currentIdx ? "current" : "pending";
        return (
          <li
            key={s.id}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium",
              state === "current" && "bg-primary text-primary-foreground",
              state === "done" && "bg-primary/10 text-primary",
              state === "pending" && "bg-muted text-muted-foreground",
            )}
          >
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}

function StatusBadge({ status }: { status: "new" | "update" | "error" }) {
  if (status === "new") return <Badge variant="success">Νέο</Badge>;
  if (status === "update") return <Badge variant="info">Ενημέρωση</Badge>;
  return <Badge variant="destructive">Σφάλμα</Badge>;
}
