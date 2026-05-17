import { importProductRowSchema, type ImportProductRow } from "@kava-now/shared";
import { parseBool, parseInteger, parsePrice } from "./spreadsheet-parser";

export type TargetField =
  | "name"
  | "brand"
  | "basePrice"
  | "categoryName"
  | "description"
  | "sku"
  | "unit"
  | "volumeMl"
  | "alcoholPct"
  | "imageUrl"
  | "active";

export const REQUIRED_TARGETS: TargetField[] = ["name", "brand", "basePrice"];

export const TARGET_LABELS: Record<TargetField, string> = {
  name: "Όνομα",
  brand: "Μάρκα",
  basePrice: "Τιμή βάσης",
  categoryName: "Κατηγορία",
  description: "Περιγραφή",
  sku: "SKU",
  unit: "Μονάδα",
  volumeMl: "Όγκος (ml)",
  alcoholPct: "Αλκοόλ (%)",
  imageUrl: "URL Εικόνας",
  active: "Ενεργό",
};

export type Mapping = Partial<Record<TargetField, string>>;

const HEADER_HINTS: Record<TargetField, RegExp[]> = {
  name: [
    /^όνομα$/i,
    /^name$/i,
    /^product/i,
    /^προϊόν/i,
    /^περιγραφή είδους/i,
    /^description name$/i,
  ],
  brand: [/^μάρκα$/i, /^brand$/i, /^κατασκευαστής$/i, /^manufacturer$/i, /^vendor$/i],
  basePrice: [/^τιμή/i, /^price$/i, /^retail/i, /^τιμη λιανικ/i, /^cost$/i, /^τιμή πώλησης/i],
  categoryName: [/^κατηγορία$/i, /^category$/i, /^group$/i, /^ομάδα$/i],
  description: [/^περιγραφή$/i, /^description$/i, /^σχόλια$/i],
  sku: [/^sku$/i, /^κωδικός$/i, /^code$/i, /^κωδ/i, /^barcode$/i],
  unit: [/^μονάδα/i, /^unit$/i, /^uom$/i],
  volumeMl: [/^όγκος/i, /^volume$/i, /ml$/i, /^περιεκτικότητα/i],
  alcoholPct: [/^αλκοόλ/i, /^alcohol/i, /^abv$/i, /%$/],
  imageUrl: [/^εικόνα/i, /^image/i, /^url$/i, /^φωτογραφία/i],
  active: [/^ενεργό/i, /^active$/i, /^enabled$/i],
};

export function suggestMapping(columns: string[]): Mapping {
  const result: Mapping = {};
  const used = new Set<string>();

  // Sort targets by specificity — match the more specific fields first so generic
  // patterns like /price/ don't steal a column meant for retail-price.
  const order: TargetField[] = [
    "name",
    "brand",
    "basePrice",
    "categoryName",
    "sku",
    "unit",
    "volumeMl",
    "alcoholPct",
    "imageUrl",
    "active",
    "description",
  ];

  for (const target of order) {
    const patterns = HEADER_HINTS[target];
    const match = columns.find(
      (col) => !used.has(col) && patterns.some((re) => re.test(col.trim())),
    );
    if (match) {
      result[target] = match;
      used.add(match);
    }
  }

  return result;
}

const UNIT_VALUES = new Set(["bottle", "case", "keg"]);
const UNIT_ALIASES: Record<string, "bottle" | "case" | "keg"> = {
  bottle: "bottle",
  μπουκάλι: "bottle",
  φιάλη: "bottle",
  case: "case",
  κιβώτιο: "case",
  κασόνι: "case",
  keg: "keg",
  βαρέλι: "keg",
};

function parseUnit(input: string): "bottle" | "case" | "keg" | undefined {
  const s = input.trim().toLowerCase();
  if (!s) return undefined;
  if (UNIT_VALUES.has(s)) return s as "bottle" | "case" | "keg";
  return UNIT_ALIASES[s];
}

export interface AppliedRow {
  row: ImportProductRow | null;
  error: string | null;
  raw: Record<string, string>;
}

/**
 * Apply a column mapping to parsed sheet rows, normalising types and running
 * each result through the shared Zod schema. Returns one entry per input row,
 * preserving order and reporting the first validation error inline.
 */
export function applyMapping(rows: Record<string, string>[], mapping: Mapping): AppliedRow[] {
  return rows.map((raw) => {
    const candidate: Record<string, unknown> = {};

    const getStr = (target: TargetField) => {
      const col = mapping[target];
      if (!col) return undefined;
      const v = raw[col];
      if (v == null) return undefined;
      const trimmed = String(v).trim();
      return trimmed.length === 0 ? undefined : trimmed;
    };

    const name = getStr("name");
    if (name != null) candidate.name = name;

    const brand = getStr("brand");
    if (brand != null) candidate.brand = brand;

    const priceRaw = getStr("basePrice");
    if (priceRaw != null) {
      const n = parsePrice(priceRaw);
      candidate.basePrice = n ?? priceRaw; // pass-through on parse failure so Zod surfaces it
    }

    const categoryName = getStr("categoryName");
    if (categoryName != null) candidate.categoryName = categoryName;

    const description = getStr("description");
    if (description != null) candidate.description = description;

    const sku = getStr("sku");
    if (sku != null) candidate.sku = sku;

    const unitRaw = getStr("unit");
    if (unitRaw != null) {
      const u = parseUnit(unitRaw);
      if (u) candidate.unit = u;
    }

    const volumeRaw = getStr("volumeMl");
    if (volumeRaw != null) {
      const n = parseInteger(volumeRaw);
      candidate.volumeMl = n ?? volumeRaw;
    }

    const alcoholRaw = getStr("alcoholPct");
    if (alcoholRaw != null) {
      const n = parsePrice(alcoholRaw);
      candidate.alcoholPct = n ?? alcoholRaw;
    }

    const imageUrl = getStr("imageUrl");
    if (imageUrl != null) candidate.imageUrl = imageUrl;

    const activeRaw = getStr("active");
    if (activeRaw != null) {
      const b = parseBool(activeRaw);
      if (b != null) candidate.active = b;
    }

    const result = importProductRowSchema.safeParse(candidate);
    if (result.success) {
      return { row: result.data, error: null, raw };
    }

    const flat = result.error.flatten().fieldErrors as Record<string, string[] | undefined>;
    const firstField = Object.keys(flat)[0];
    const firstMsg = firstField ? flat[firstField]?.[0] : "Μη έγκυρη γραμμή";
    return { row: null, error: `${firstField ?? ""}: ${firstMsg ?? "σφάλμα"}`.trim(), raw };
  });
}

const STORAGE_PREFIX = "tenant-now:product-import-mapping:";

export function persistMapping(tenantSlug: string, mapping: Mapping): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + tenantSlug, JSON.stringify(mapping));
  } catch {
    /* localStorage disabled / quota; non-fatal */
  }
}

export function loadMapping(tenantSlug: string): Mapping | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + tenantSlug);
    if (!raw) return null;
    return JSON.parse(raw) as Mapping;
  } catch {
    return null;
  }
}
