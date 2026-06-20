import { z } from "zod";

export const createProductSchema = z.object({
  name: z.string().min(1, "Το όνομα είναι υποχρεωτικό"),
  brand: z.string().min(1, "Η μάρκα είναι υποχρεωτική"),
  categoryId: z.string().uuid().optional().nullable(),
  description: z.string().optional(),
  basePrice: z
    .number({ error: "Η τιμή είναι υποχρεωτική" })
    .positive("Η τιμή πρέπει να είναι θετικός αριθμός"),
  unit: z.enum(["bottle", "case", "keg"]).optional(),
  volumeMl: z.number().int().positive().optional().nullable(),
  alcoholPct: z.number().min(0).max(100).optional().nullable(),
  sku: z.string().optional(),
  erpRef: z.string().optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
});

export const updateProductSchema = z
  .object({
    name: z.string().min(1, "Το όνομα είναι υποχρεωτικό").optional(),
    brand: z.string().min(1, "Η μάρκα είναι υποχρεωτική").optional(),
    categoryId: z.string().uuid().optional().nullable(),
    description: z.string().optional().nullable(),
    basePrice: z.number().positive("Η τιμή πρέπει να είναι θετικός αριθμός").optional(),
    unit: z.enum(["bottle", "case", "keg"]).optional(),
    volumeMl: z.number().int().positive().optional().nullable(),
    alcoholPct: z.number().min(0).max(100).optional().nullable(),
    sku: z.string().optional().nullable(),
    erpRef: z.string().optional().nullable(),
    imageUrl: z.string().url().optional().nullable(),
    active: z.boolean().optional(),
    // Empty updates used to reach Drizzle's set({}) → "No values to set" 500.
  })
  .refine((d) => Object.keys(d).length > 0, "Δεν δόθηκαν πεδία για ενημέρωση");

export const importProductRowSchema = z.object({
  name: z.string().trim().min(1, "Το όνομα είναι υποχρεωτικό"),
  brand: z.string().trim().min(1, "Η μάρκα είναι υποχρεωτική"),
  basePrice: z.number().positive("Η τιμή πρέπει να είναι θετικός αριθμός"),
  categoryName: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  sku: z.string().trim().optional(),
  erpRef: z.string().trim().optional(),
  unit: z.enum(["bottle", "case", "keg"]).optional(),
  volumeMl: z.number().int().positive().optional(),
  alcoholPct: z.number().min(0).max(100).optional(),
  imageUrl: z.string().url().optional(),
  active: z.boolean().optional(),
});

/** Max rows accepted per import batch — shared so the UI can warn before submit. */
export const PRODUCT_IMPORT_ROW_LIMIT = 5000;

export const importProductsBatchSchema = z.object({
  rows: z
    .array(importProductRowSchema)
    .min(1, "Δεν υπάρχουν γραμμές προς εισαγωγή")
    .max(PRODUCT_IMPORT_ROW_LIMIT, `Πάρα πολλές γραμμές (όριο ${PRODUCT_IMPORT_ROW_LIMIT})`),
  // Dry-run validates + computes the outcome in a rolled-back transaction so the
  // preview shows server-truth counts (dedup, conflicts) without writing.
  dryRun: z.boolean().optional().default(false),
  // Original filename, recorded in the import history (audit log) on commit.
  sourceFilename: z.string().trim().max(255).optional(),
});

export type ImportProductRow = z.infer<typeof importProductRowSchema>;
export type ImportProductsBatch = z.infer<typeof importProductsBatchSchema>;

/** An incoming row whose erpRef collides with a different existing product. */
export interface ImportErpConflict {
  /** Zero-based index into the submitted rows. */
  rowIndex: number;
  erpRef: string | null;
}

export interface ImportProductsResult {
  inserted: number;
  updated: number;
  categoriesCreated: number;
  /** Rows collapsed by the (name, brand) de-duplication (last row wins). */
  duplicatesInFile: number;
  total: number;
  dryRun: boolean;
  /**
   * Set when an erpRef collision blocks the import. On a real (non-dry-run)
   * import this is surfaced as a 409 instead; on a dry-run it rides along the
   * 200 so the preview can flag it before the user commits.
   */
  conflict: ImportErpConflict | null;
}

// ── Column mapping (file header → product field) ────────────────────────────
// The set of product fields an import column can map to. Shared so the API can
// validate saved mapping templates against the same field list the web maps.
export const IMPORT_TARGET_FIELDS = [
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
] as const;

export type ImportTargetField = (typeof IMPORT_TARGET_FIELDS)[number];

/** A column mapping: product field → source column header. Partial by design. */
export const importColumnMappingSchema = z.record(z.enum(IMPORT_TARGET_FIELDS), z.string().min(1));

export type ImportColumnMapping = Partial<Record<ImportTargetField, string>>;

export const saveImportMappingSchema = z.object({
  name: z.string().trim().min(1, "Το όνομα είναι υποχρεωτικό").max(100),
  mapping: importColumnMappingSchema,
});

// z.record infers a total Record; the mapping is partial by design (only the
// mapped fields are present), so model the input type explicitly.
export interface SaveImportMappingInput {
  name: string;
  mapping: ImportColumnMapping;
}

export interface ImportMappingTemplate {
  id: string;
  name: string;
  mapping: ImportColumnMapping;
  createdAt: string;
  updatedAt: string;
}

// ── Import history (audit log) ──────────────────────────────────────────────
export interface ProductImportHistoryEntry {
  id: string;
  sourceFilename: string | null;
  total: number;
  inserted: number;
  updated: number;
  categoriesCreated: number;
  duplicatesInFile: number;
  createdAt: string;
  createdByName: string | null;
  createdByEmail: string | null;
}

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
