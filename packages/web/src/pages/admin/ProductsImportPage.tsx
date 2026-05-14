import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../components/ui/Button";
import { Spinner } from "../../components/ui/Spinner";
import { useAuth } from "../../lib/hooks/use-auth";
import { useProducts, useImportProducts } from "../../lib/hooks/use-products";
import { parseFile, type Encoding, type ParseResult } from "../../lib/spreadsheet-parser";
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
} from "../../lib/import-mapping";

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

  // Existing products — used to compute the "new vs. update" split in the preview.
  const { data: existingProducts } = useProducts();
  const existingKeys = useMemo(() => {
    if (!existingProducts) return new Set<string>();
    return new Set(existingProducts.map((p) => `${p.name.toLowerCase()}|${p.brand.toLowerCase()}`));
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
        // Auto-suggest mapping, then layer any persisted mapping on top — but only
        // for columns that actually exist in this file.
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
    void navigate("/admin/products", { state: { importResult: result } });
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) handleFile(dropped);
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Εισαγωγή προϊόντων από αρχείο</h1>
          <p className="mt-1 text-sm text-gray-500">
            Ανέβασμα CSV ή Excel · Αντιστοίχιση στηλών · Προεπισκόπηση
          </p>
        </div>
        <Button variant="secondary" onClick={() => navigate("/admin/products")}>
          Πίσω στα προϊόντα
        </Button>
      </div>

      {/* Steps indicator */}
      <Stepper current={step} />

      {step === "upload" && (
        <section className="mt-6 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
              isDragging
                ? "border-amber-500 bg-amber-50"
                : "border-gray-300 bg-gray-50 hover:bg-gray-100"
            }`}
          >
            <svg
              className="h-10 w-10 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 7.5m0 0L7.5 12M12 7.5v9"
              />
            </svg>
            <p className="mt-3 text-sm font-medium text-gray-700">
              Σύρετε το αρχείο εδώ ή επιλέξτε αρχείο
            </p>
            <p className="mt-1 text-xs text-gray-500">CSV, XLSX ή XLS</p>
            <label className="mt-4 inline-flex">
              <span className="cursor-pointer rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-700">
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
              <p className="mt-4 text-xs text-gray-600">
                Επιλεγμένο: <span className="font-medium">{file.name}</span> (
                {Math.ceil(file.size / 1024)} KB)
              </p>
            )}
          </div>

          {/* CSV-specific options */}
          {file && file.name.toLowerCase().endsWith(".csv") && (
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="encoding" className="block text-sm font-medium text-gray-700 mb-1">
                  Κωδικοποίηση
                </label>
                <select
                  id="encoding"
                  value={encoding}
                  onChange={(e) => setEncoding(e.target.value as Encoding)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="utf-8">UTF-8 (αυτόματη επαναφορά σε Windows-1253)</option>
                  <option value="windows-1253">Windows-1253 (ελληνικά)</option>
                </select>
              </div>
              <div>
                <label htmlFor="skipRows" className="block text-sm font-medium text-gray-700 mb-1">
                  Παράλειψη πρώτων γραμμών
                </label>
                <input
                  id="skipRows"
                  type="number"
                  min={0}
                  value={skipRows}
                  onChange={(e) => setSkipRows(Math.max(0, Number(e.target.value) || 0))}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div className="sm:col-span-2">
                <Button variant="secondary" size="sm" onClick={handleReparse}>
                  Επανανάγνωση
                </Button>
              </div>
            </div>
          )}

          {parsing && (
            <div className="mt-6 flex items-center gap-2 text-sm text-gray-600">
              <Spinner className="h-4 w-4" /> Ανάλυση αρχείου...
            </div>
          )}

          {parseError && (
            <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{parseError}</p>
          )}

          {parsed && !parsing && (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Εντοπίστηκαν <span className="font-medium">{parsed.columns.length}</span> στήλες και{" "}
                <span className="font-medium">{parsed.rows.length}</span> γραμμές δεδομένων.
              </p>
              <Button onClick={handleContinueToMap}>Συνέχεια στην αντιστοίχιση</Button>
            </div>
          )}
        </section>
      )}

      {step === "map" && parsed && (
        <section className="mt-6 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Αντιστοίχιση στηλών</h2>
          <p className="mt-1 text-sm text-gray-500">
            Συνδέστε κάθε πεδίο προϊόντος με μια στήλη του αρχείου. Τα πεδία με * είναι υποχρεωτικά.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            {TARGET_ORDER.map((target) => {
              const isRequired = REQUIRED_TARGETS.includes(target);
              return (
                <div key={target} className="flex flex-col">
                  <label
                    htmlFor={`map-${target}`}
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    {TARGET_LABELS[target]}
                    {isRequired ? " *" : ""}
                  </label>
                  <select
                    id={`map-${target}`}
                    value={mapping[target] ?? ""}
                    onChange={(e) =>
                      setMapping((prev) => {
                        const next = { ...prev };
                        if (e.target.value === "") {
                          delete next[target];
                        } else {
                          next[target] = e.target.value;
                        }
                        return next;
                      })
                    }
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">— αγνόηση —</option>
                    {parsed.columns.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <Button variant="secondary" onClick={() => setStep("upload")}>
              Πίσω
            </Button>
            <Button onClick={handleContinueToPreview} disabled={!mappingComplete}>
              Συνέχεια στην προεπισκόπηση
            </Button>
          </div>
          {!mappingComplete && (
            <p className="mt-3 text-xs text-amber-700">
              Συνδέστε τα πεδία Όνομα, Μάρκα και Τιμή για να συνεχίσετε.
            </p>
          )}
        </section>
      )}

      {step === "preview" && parsed && (
        <section className="mt-6 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Προεπισκόπηση</h2>

          <div className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Θα εισαχθούν <span className="font-semibold">{counts.newRows + counts.updateRows}</span>{" "}
            προϊόντα: <span className="font-semibold">{counts.newRows}</span> νέα,{" "}
            <span className="font-semibold">{counts.updateRows}</span> θα ενημερωθούν.
            {counts.errorRows > 0 && (
              <>
                {" "}
                <span className="font-semibold text-red-700">{counts.errorRows}</span> γραμμές έχουν
                σφάλματα και θα παραλειφθούν.
              </>
            )}
          </div>

          <div className="mt-4 overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-500">
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Κατάσταση</th>
                  <th className="px-3 py-2 font-medium">Όνομα</th>
                  <th className="px-3 py-2 font-medium">Μάρκα</th>
                  <th className="px-3 py-2 font-medium">Κατηγορία</th>
                  <th className="px-3 py-2 font-medium text-right">Τιμή</th>
                </tr>
              </thead>
              <tbody>
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
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={status} />
                        {r.error && <p className="mt-1 text-xs text-red-600">{r.error}</p>}
                      </td>
                      <td className="px-3 py-2 text-gray-900">
                        {r.row?.name ?? r.raw[mapping.name ?? ""] ?? "-"}
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {r.row?.brand ?? r.raw[mapping.brand ?? ""] ?? "-"}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{r.row?.categoryName ?? "-"}</td>
                      <td className="px-3 py-2 text-right text-gray-900">
                        {r.row ? `${r.row.basePrice.toFixed(2)} €` : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {applied.length > PREVIEW_LIMIT && (
            <div className="mt-3 text-center">
              <Button variant="ghost" size="sm" onClick={() => setShowAllRows((v) => !v)}>
                {showAllRows ? "Δείτε λιγότερες" : `Δείτε όλες (${applied.length})`}
              </Button>
            </div>
          )}

          {importMutation.error && (
            <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {importMutation.error.message}
            </p>
          )}

          <div className="mt-6 flex items-center justify-between">
            <Button variant="secondary" onClick={() => setStep("map")}>
              Πίσω στην αντιστοίχιση
            </Button>
            <Button
              onClick={handleImport}
              loading={importMutation.isPending}
              disabled={validRows.length === 0}
            >
              Εισαγωγή {validRows.length} προϊόντων
            </Button>
          </div>
        </section>
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
    <ol className="mt-6 flex gap-2 text-sm">
      {steps.map((s, i) => {
        const state = i < currentIdx ? "done" : i === currentIdx ? "current" : "pending";
        return (
          <li
            key={s.id}
            className={`rounded-lg px-3 py-1.5 ${
              state === "current"
                ? "bg-amber-600 text-white"
                : state === "done"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-gray-100 text-gray-500"
            }`}
          >
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}

function StatusBadge({ status }: { status: "new" | "update" | "error" }) {
  if (status === "new") {
    return (
      <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
        Νέο
      </span>
    );
  }
  if (status === "update") {
    return (
      <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
        Ενημέρωση
      </span>
    );
  }
  return (
    <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
      Σφάλμα
    </span>
  );
}
