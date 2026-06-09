import Papa from "papaparse";

export type Encoding = "utf-8" | "windows-1253";

export interface ParseOptions {
  encoding?: Encoding;
  skipFirstRows?: number;
}

export interface ParseResult {
  columns: string[];
  rows: Record<string, string>[];
}

const BOM = "﻿";

function stripBom(s: string): string {
  return s.startsWith(BOM) ? s.slice(1) : s;
}

function looksLikeMojibake(text: string): boolean {
  // After UTF-8 decoding a Windows-1253 stream, we get replacement chars (U+FFFD)
  // for any Greek byte that isn't a valid UTF-8 sequence start.
  return text.includes("�");
}

async function readAsText(file: File, encoding: Encoding): Promise<string> {
  const buf = await file.arrayBuffer();
  return new TextDecoder(encoding, { fatal: false }).decode(buf);
}

// Known limitation: skipping is line-based, so a quoted CSV field containing
// newlines inside the skipped region shifts the cut. Acceptable — skipFirstRows
// targets human title/preamble lines, which aren't quoted multi-line fields.
function applySkipRows(text: string, skip: number): string {
  if (!skip || skip <= 0) return text;
  const lines = text.split(/\r?\n/);
  return lines.slice(skip).join("\n");
}

// XLSX cells are typed `unknown` by sheet_to_json. In practice they are
// string | number | boolean | Date | null; this narrows safely without
// triggering no-base-to-string for hypothetical object values.
function cellToString(cell: unknown): string {
  if (cell == null) return "";
  if (typeof cell === "string") return cell;
  if (typeof cell === "number" || typeof cell === "boolean") return String(cell);
  if (cell instanceof Date) return cell.toISOString();
  return "";
}

export async function parseCsv(file: File, opts: ParseOptions = {}): Promise<ParseResult> {
  const requested: Encoding = opts.encoding ?? "utf-8";
  let text = await readAsText(file, requested);

  // Auto-fallback: if UTF-8 decode produced mojibake, retry as Windows-1253 (common for Greek exports).
  if (requested === "utf-8" && looksLikeMojibake(text)) {
    text = await readAsText(file, "windows-1253");
  }

  text = stripBom(text);
  text = applySkipRows(text, opts.skipFirstRows ?? 0);

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => stripBom(h).trim(),
    transform: (v) => (typeof v === "string" ? v.trim() : v),
  });

  const columns = (parsed.meta.fields ?? []).filter((c) => c.length > 0);
  const rows = parsed.data.filter((r) => Object.values(r).some((v) => v && String(v).length > 0));

  return { columns, rows };
}

export async function parseXlsx(file: File, opts: ParseOptions = {}): Promise<ParseResult> {
  // Lazy import so CSV-only flows don't pay the xlsx bundle cost.
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { columns: [], rows: [] };
  }
  const sheet = wb.Sheets[sheetName]!;

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });

  const skip = opts.skipFirstRows ?? 0;
  const trimmed = matrix.slice(skip);
  if (trimmed.length === 0) {
    return { columns: [], rows: [] };
  }

  const headerRow = trimmed[0] ?? [];
  // Data cells are read positionally, so every named column must keep its
  // ORIGINAL index — filtering empty header cells out of a flat list would
  // shift all later columns' values one field to the left.
  const namedColumns = headerRow
    .map((h, index) => ({ name: stripBom(cellToString(h)).trim(), index }))
    .filter((c) => c.name.length > 0);

  const rows: Record<string, string>[] = [];
  for (const raw of trimmed.slice(1)) {
    const row: Record<string, string> = {};
    let any = false;
    // Duplicate header names: the rightmost column wins (papaparse parity).
    for (const { name, index } of namedColumns) {
      const val = cellToString(raw[index]).trim();
      row[name] = val;
      if (val.length > 0) any = true;
    }
    if (any) rows.push(row);
  }

  return { columns: namedColumns.map((c) => c.name), rows };
}

export async function parseFile(file: File, opts: ParseOptions = {}): Promise<ParseResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return parseXlsx(file, opts);
  }
  return parseCsv(file, opts);
}

/**
 * Parse a price string that may use comma or dot as decimal separator,
 * optionally with thousand separators and a currency suffix (€, EUR).
 * Returns `null` if the input doesn't look like a number.
 */
export function parsePrice(input: string | number | undefined | null): number | null {
  if (input == null) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;

  let s = input.trim();
  if (s.length === 0) return null;

  // Strip currency symbols and letters (€, $, EUR, etc.) but keep digits, separators, sign.
  s = s.replace(/[^\d,.-]/g, "");
  if (s.length === 0) return null;

  // Pure thousands-grouping ("1.234", "12.345.678", "1,234"): a separator
  // always followed by exactly three digits is a grouping character in
  // Greek/English exports, not a 3-decimal price.
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) {
    return Number(s.replace(/[.,]/g, ""));
  }

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  let normalized: string;
  if (lastComma === -1 && lastDot === -1) {
    normalized = s;
  } else if (lastComma > lastDot) {
    // Comma is the decimal separator (e.g. "1.234,56" or "12,50").
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else {
    // Dot is the decimal separator (e.g. "1,234.56" or "12.50").
    normalized = s.replace(/,/g, "");
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function parseInteger(input: string | number | undefined | null): number | null {
  const n = parsePrice(input);
  if (n == null) return null;
  return Number.isInteger(n) ? n : Math.trunc(n);
}

/**
 * Coerce common spreadsheet boolean representations.
 * Recognised true: "true", "1", "yes", "y", "ναι", "ν".
 * Recognised false: "false", "0", "no", "n", "οχι", "όχι", "ο".
 * Returns `null` if the input doesn't match (caller decides default).
 */
export function parseBool(input: string | number | boolean | undefined | null): boolean | null {
  if (input == null) return null;
  if (typeof input === "boolean") return input;
  if (typeof input === "number") return input !== 0;

  const s = input.trim().toLowerCase();
  if (s.length === 0) return null;
  if (["true", "1", "yes", "y", "ναι", "ν"].includes(s)) return true;
  if (["false", "0", "no", "n", "οχι", "όχι", "ο"].includes(s)) return false;
  return null;
}
