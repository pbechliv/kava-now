import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useTenantSlug } from "@/lib/hooks/use-tenant-api";
import { Loader2, Save, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { ImportStatusBadge } from "@/components/admin/import-status-badge";
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
import { MobileList, MobileListItem, MobileListField } from "@/components/ui/mobile-list";
import { Spinner } from "@/components/spinner";
import { cn } from "@/lib/utils";
import {
  useImportProducts,
  useImportPreview,
  useProductKeys,
  useProductImportHistory,
  useImportMappingTemplates,
  useSaveImportMapping,
  useDeleteImportMapping,
} from "@/lib/hooks/use-products";
import { parseFile, type Encoding, type ParseResult } from "@/lib/spreadsheet-parser";
import {
  applyMapping,
  REQUIRED_TARGETS,
  suggestMapping,
  TARGET_LABELS,
  type AppliedRow,
  type Mapping,
  type TargetField,
} from "@/lib/import-mapping";
import {
  PRODUCT_IMPORT_ROW_LIMIT,
  type ImportProductsResult,
  type ImportMappingTemplate,
  type ProductImportHistoryEntry,
} from "@kava-now/shared";
import { formatDateTime, formatMoney } from "@/lib/format";

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
  const slug = useTenantSlug();
  const productsPath = `/k/${slug}/admin/products`;
  const importMutation = useImportProducts();
  const previewMutation = useImportPreview();

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
  const [templateName, setTemplateName] = useState("");

  const { data: history } = useProductImportHistory();
  const { data: templates } = useImportMappingTemplates();
  const saveMapping = useSaveImportMapping();
  const deleteMapping = useDeleteImportMapping();

  const { data: existingProductKeys } = useProductKeys();
  // Case-sensitive, matching the products (tenant, name, brand) unique index and
  // the server-side upsert target — so the new/update estimate doesn't mislabel
  // rows that differ only by case.
  const existingKeys = useMemo(() => {
    if (!existingProductKeys) return new Set<string>();
    return new Set(existingProductKeys.map((p) => `${p.name}|${p.brand}`));
  }, [existingProductKeys]);

  const applied: AppliedRow[] = useMemo(
    () => (parsed ? applyMapping(parsed.rows, mapping) : []),
    [parsed, mapping],
  );

  // Client-side estimate, shown live while mapping. The authoritative summary
  // on the preview step comes from the server dry-run (handles dedup exactly).
  const counts = useMemo(() => {
    let newRows = 0;
    let updateRows = 0;
    let errorRows = 0;
    for (const r of applied) {
      if (!r.row) {
        errorRows++;
        continue;
      }
      const key = `${r.row.name}|${r.row.brand}`;
      if (existingKeys.has(key)) updateRows++;
      else newRows++;
    }
    return { newRows, updateRows, errorRows };
  }, [applied, existingKeys]);

  const mappingComplete = REQUIRED_TARGETS.every((t) => mapping[t] != null);
  const validRows = applied.flatMap((r) => (r.row ? [r.row] : []));
  const overLimit = parsed ? parsed.rows.length > PRODUCT_IMPORT_ROW_LIMIT : false;

  const preview = previewMutation.data ?? null;
  const conflict = preview?.conflict ?? null;

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
        setMapping(suggestMapping(result.columns));
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

  const goToMap = () => setStep("map");

  const goBackToMap = () => {
    previewMutation.reset();
    setStep("map");
  };

  const handleContinueToPreview = () => {
    setShowAllRows(false);
    setStep("preview");
    // Run the dry-run for server-truth counts + conflict detection.
    if (validRows.length > 0) previewMutation.mutate(validRows);
  };

  const applyTemplate = (id: string) => {
    const template = templates?.find((t) => t.id === id);
    if (!template || !parsed) return;
    // Keep only columns that exist in the currently loaded file.
    const next: Mapping = {};
    for (const [field, col] of Object.entries(template.mapping)) {
      if (col && parsed.columns.includes(col)) next[field as TargetField] = col;
    }
    setMapping(next);
    toast.success(`Φορτώθηκε η αντιστοίχιση «${template.name}»`);
  };

  const handleSaveMapping = () => {
    const name = templateName.trim();
    if (!name) return;
    saveMapping.mutate(
      { name, mapping },
      {
        onSuccess: () => {
          toast.success("Η αντιστοίχιση αποθηκεύτηκε");
          setTemplateName("");
        },
        onError: () => toast.error("Αποτυχία αποθήκευσης αντιστοίχισης"),
      },
    );
  };

  const handleImport = () => {
    if (validRows.length === 0 || conflict) return;
    importMutation.mutate(
      { rows: validRows, sourceFilename: file?.name },
      {
        onSuccess: (result) => void navigate({ to: productsPath, state: { importResult: result } }),
      },
    );
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
        <Button variant="outline" onClick={() => navigate({ to: productsPath })}>
          Πίσω στα προϊόντα
        </Button>
      </div>

      <Stepper current={step} />

      {step === "upload" && (
        <>
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
              <p className="mt-1 text-xs text-muted-foreground">
                CSV, XLSX ή XLS · έως {PRODUCT_IMPORT_ROW_LIMIT.toLocaleString("el-GR")} γραμμές
              </p>
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
              <Alert variant="destructive" className="mt-4">
                {parseError}
              </Alert>
            )}

            {parsed && !parsing && overLimit && (
              <Alert variant="destructive" className="mt-4">
                Το αρχείο έχει {parsed.rows.length.toLocaleString("el-GR")} γραμμές — το όριο ανά
                εισαγωγή είναι {PRODUCT_IMPORT_ROW_LIMIT.toLocaleString("el-GR")}. Χωρίστε το αρχείο
                σε μικρότερα μέρη.
              </Alert>
            )}

            {parsed && !parsing && (
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Εντοπίστηκαν{" "}
                  <span className="font-medium text-foreground">{parsed.columns.length}</span>{" "}
                  στήλες και{" "}
                  <span className="font-medium text-foreground">{parsed.rows.length}</span> γραμμές
                  δεδομένων.
                </p>
                <Button onClick={goToMap} disabled={overLimit}>
                  Συνέχεια στην αντιστοίχιση
                </Button>
              </div>
            )}
          </Card>

          <ImportHistoryCard history={history ?? []} />
        </>
      )}

      {step === "map" && parsed && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold">Αντιστοίχιση στηλών</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Συνδέστε κάθε πεδίο προϊόντος με μια στήλη του αρχείου. Τα πεδία με * είναι υποχρεωτικά.
          </p>

          <MappingTemplates
            templates={templates ?? []}
            templateName={templateName}
            onTemplateNameChange={setTemplateName}
            onLoad={applyTemplate}
            onSave={handleSaveMapping}
            onDelete={(id) => deleteMapping.mutate(id)}
            saving={saveMapping.isPending}
          />

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
                        if (!v || v === "none") {
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
            <p className="mt-3 text-xs text-warning">
              Συνδέστε τα πεδία Όνομα, Μάρκα και Τιμή για να συνεχίσετε.
            </p>
          )}
        </Card>
      )}

      {step === "preview" && parsed && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold">Προεπισκόπηση</h2>

          <PreviewSummary loading={previewMutation.isPending} preview={preview} fallback={counts} />

          {conflict && (
            <Alert variant="destructive" className="mt-3">
              Η γραμμή {conflict.rowIndex + 1} έχει κωδικό ERP «{conflict.erpRef ?? ""}» που
              χρησιμοποιείται ήδη από άλλο προϊόν. Διορθώστε το αρχείο πριν την εισαγωγή —
              διαφορετικά δεν θα εισαχθεί τίποτα.
            </Alert>
          )}

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
                  const key = r.row ? `${r.row.name}|${r.row.brand}` : "";
                  const status: "new" | "update" | "error" = !r.row
                    ? "error"
                    : existingKeys.has(key)
                      ? "update"
                      : "new";
                  return (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell>
                        <ImportStatusBadge status={status} />
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
                        {r.row ? formatMoney(r.row.basePrice) : "-"}
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
            <Alert variant="destructive" className="mt-4">
              {importMutation.error.message}
            </Alert>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="outline" onClick={goBackToMap}>
              Πίσω στην αντιστοίχιση
            </Button>
            <Button
              onClick={handleImport}
              disabled={
                importMutation.isPending ||
                previewMutation.isPending ||
                validRows.length === 0 ||
                !!conflict
              }
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

interface PreviewCounts {
  newRows: number;
  updateRows: number;
  errorRows: number;
}

function PreviewSummary({
  loading,
  preview,
  fallback,
}: {
  loading: boolean;
  preview: ImportProductsResult | null;
  fallback: PreviewCounts;
}) {
  if (loading) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <Spinner className="h-4 w-4" /> Έλεγχος στον διακομιστή...
      </div>
    );
  }

  // Server dry-run available → authoritative counts (exact dedup + overwrites).
  if (preview && !preview.conflict) {
    return (
      <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
        Θα εισαχθούν <span className="font-semibold">{preview.inserted + preview.updated}</span>{" "}
        προϊόντα: <span className="font-semibold">{preview.inserted}</span> νέα,{" "}
        <span className="font-semibold">{preview.updated}</span> θα ενημερωθούν (αντικατάσταση
        υπαρχόντων).
        {preview.categoriesCreated > 0 && (
          <>
            {" "}
            Θα δημιουργηθούν <span className="font-semibold">{preview.categoriesCreated}</span> νέες
            κατηγορίες.
          </>
        )}
        {preview.duplicatesInFile > 0 && (
          <>
            {" "}
            <span className="font-semibold text-warning">{preview.duplicatesInFile}</span> διπλές
            γραμμές στο αρχείο θα συγχωνευθούν (υπερισχύει η τελευταία).
          </>
        )}
      </div>
    );
  }

  // Fallback estimate (e.g. while no dry-run yet or after an error).
  return (
    <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
      Θα εισαχθούν <span className="font-semibold">{fallback.newRows + fallback.updateRows}</span>{" "}
      προϊόντα: <span className="font-semibold">{fallback.newRows}</span> νέα,{" "}
      <span className="font-semibold">{fallback.updateRows}</span> θα ενημερωθούν.
      {fallback.errorRows > 0 && (
        <>
          {" "}
          <span className="font-semibold text-destructive">{fallback.errorRows}</span> γραμμές έχουν
          σφάλματα και θα παραλειφθούν.
        </>
      )}
    </div>
  );
}

function MappingTemplates({
  templates,
  templateName,
  onTemplateNameChange,
  onLoad,
  onSave,
  onDelete,
  saving,
}: {
  templates: ImportMappingTemplate[];
  templateName: string;
  onTemplateNameChange: (v: string) => void;
  onLoad: (id: string) => void;
  onSave: () => void;
  onDelete: (id: string) => void;
  saving: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string>("");
  return (
    <div className="mt-4 flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-end">
      <div className="flex-1 space-y-2">
        <Label htmlFor="load-template">Αποθηκευμένες αντιστοιχίσεις</Label>
        <div className="flex gap-2">
          <Select
            value={selectedId}
            onValueChange={(v) => {
              if (!v) return;
              setSelectedId(v);
              onLoad(v);
            }}
            disabled={templates.length === 0}
          >
            <SelectTrigger id="load-template" className="w-full">
              <SelectValue
                placeholder={templates.length ? "Επιλέξτε αντιστοίχιση" : "Καμία αποθηκευμένη"}
              />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedId && (
            <Button
              variant="ghost-destructive"
              size="icon"
              aria-label="Διαγραφή αντιστοίχισης"
              onClick={() => {
                onDelete(selectedId);
                setSelectedId("");
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 space-y-2">
        <Label htmlFor="save-template">Αποθήκευση τρέχουσας ως</Label>
        <div className="flex gap-2">
          <Input
            id="save-template"
            placeholder="Όνομα αντιστοίχισης"
            value={templateName}
            onChange={(e) => onTemplateNameChange(e.target.value)}
          />
          <Button variant="outline" onClick={onSave} disabled={!templateName.trim() || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span className="ml-2 hidden sm:inline">Αποθήκευση</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

function ImportHistoryCard({ history }: { history: ProductImportHistoryEntry[] }) {
  if (history.length === 0) return null;
  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold">Πρόσφατες εισαγωγές</h2>
      <div className="mt-4 hidden overflow-x-auto rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ημερομηνία</TableHead>
              <TableHead>Αρχείο</TableHead>
              <TableHead>Χρήστης</TableHead>
              <TableHead className="text-right">Νέα</TableHead>
              <TableHead className="text-right">Ενημερώσεις</TableHead>
              <TableHead className="text-right">Κατηγορίες</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((h) => (
              <TableRow key={h.id}>
                <TableCell className="whitespace-nowrap">{formatDateTime(h.createdAt)}</TableCell>
                <TableCell className="text-muted-foreground">{h.sourceFilename ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {h.createdByName ?? h.createdByEmail ?? "-"}
                </TableCell>
                <TableCell className="text-right">{h.inserted}</TableCell>
                <TableCell className="text-right">{h.updated}</TableCell>
                <TableCell className="text-right">{h.categoriesCreated}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="mt-4 rounded-lg border md:hidden">
        <MobileList>
          {history.map((h) => (
            <MobileListItem key={h.id}>
              <MobileListField label="Ημερομηνία">{formatDateTime(h.createdAt)}</MobileListField>
              <MobileListField label="Αρχείο">{h.sourceFilename ?? "-"}</MobileListField>
              <MobileListField label="Χρήστης">
                {h.createdByName ?? h.createdByEmail ?? "-"}
              </MobileListField>
              <MobileListField label="Νέα">{h.inserted}</MobileListField>
              <MobileListField label="Ενημερώσεις">{h.updated}</MobileListField>
              <MobileListField label="Κατηγορίες">{h.categoriesCreated}</MobileListField>
            </MobileListItem>
          ))}
        </MobileList>
      </div>
    </Card>
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
