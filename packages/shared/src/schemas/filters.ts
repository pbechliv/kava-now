import { z } from "zod";
import { ORDER_STATUSES } from "./orders";
import { paginationQuerySchema } from "./pagination";

// Single source of truth for list-filter query params, shared by the API
// (strict validation at the request boundary — garbage 400s) and the web
// router's `validateSearch` (tolerant — a bad URL must never throw, it degrades
// to "no filter"). The *field definitions* (names, enums, coercions) live here
// once so the two sides can never drift; only the error policy differs.

// --- shared field primitives ---
const ERP_STATUS_VALUES = ["pending", "transmitted"] as const;
const ACTIVE_VALUES = ["true", "false"] as const;

// Empty string (HTML form / cleared URL param) counts as absent.
const optionalUuid = z
  .uuid()
  .optional()
  .or(z.literal("").transform(() => undefined));
const optionalIsoDate = z.iso
  .date()
  .optional()
  .or(z.literal("").transform(() => undefined));
const optionalSearch = z
  .string()
  .trim()
  .optional()
  .or(z.literal("").transform(() => undefined));

// =========================================================================
// API (strict) — fed `c.req.query()`; invalid uuid/date 400s at the boundary
// instead of reaching a typed SQL comparison. status/erpStatus/active stay
// tolerant (unknown values are ignored, matching the pre-existing handlers).
// =========================================================================

export const adminOrdersFiltersSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional().catch(undefined),
  erpStatus: z.enum(ERP_STATUS_VALUES).optional().catch(undefined),
  customerId: optionalUuid,
  dateFrom: optionalIsoDate,
  dateTo: optionalIsoDate,
});

export const adminProductsFiltersSchema = z.object({
  search: optionalSearch,
  categoryId: optionalUuid,
  active: z.enum(ACTIVE_VALUES).optional().catch(undefined),
});

export const adminCustomersFiltersSchema = z.object({
  search: optionalSearch,
});

export const catalogFiltersSchema = z.object({
  search: optionalSearch,
  categoryId: optionalUuid,
});

// Admin catalog browsing for the staff-created-order flow (#159): the same
// catalog filters, but prices resolve against an explicit `customerId` (staff
// have no customer profile of their own), so it's required here.
export const adminCatalogFiltersSchema = catalogFiltersSchema.extend({
  customerId: z.uuid(),
});

/** Merged filters + pagination schemas the API handlers validate against. */
export const adminOrdersQuerySchema = adminOrdersFiltersSchema.merge(paginationQuerySchema);
export const adminProductsQuerySchema = adminProductsFiltersSchema.merge(paginationQuerySchema);
export const adminCustomersQuerySchema = adminCustomersFiltersSchema.merge(paginationQuerySchema);
export const catalogQuerySchema = catalogFiltersSchema.merge(paginationQuerySchema);
export const adminCatalogQuerySchema = adminCatalogFiltersSchema.merge(paginationQuerySchema);

// =========================================================================
// Web (tolerant) — TanStack Router `validateSearch`. Every field `.catch`es to
// undefined so a hand-edited/garbage URL renders the unfiltered list rather
// than throwing. `pageSize` is intentionally absent: it's the fixed PAGE_SIZE
// constant the hook supplies, not a user-facing URL param.
// =========================================================================

const pageSearchField = z.coerce.number().int().min(1).optional().catch(undefined);

export const adminOrdersSearchSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional().catch(undefined),
  erpStatus: z.enum(ERP_STATUS_VALUES).optional().catch(undefined),
  customerId: z.string().optional().catch(undefined),
  dateFrom: z.string().optional().catch(undefined),
  dateTo: z.string().optional().catch(undefined),
  page: pageSearchField,
});

export const adminProductsSearchSchema = z.object({
  search: z.string().optional().catch(undefined),
  categoryId: z.string().optional().catch(undefined),
  active: z.enum(ACTIVE_VALUES).optional().catch(undefined),
  page: pageSearchField,
});

export const adminCustomersSearchSchema = z.object({
  search: z.string().optional().catch(undefined),
  page: pageSearchField,
});

export const catalogSearchSchema = z.object({
  search: z.string().optional().catch(undefined),
  categoryId: z.string().optional().catch(undefined),
  page: pageSearchField,
});

export const pageOnlySearchSchema = z.object({
  page: pageSearchField,
});

export type AdminOrdersSearch = z.infer<typeof adminOrdersSearchSchema>;
export type AdminProductsSearch = z.infer<typeof adminProductsSearchSchema>;
export type AdminCustomersSearch = z.infer<typeof adminCustomersSearchSchema>;
export type CatalogSearch = z.infer<typeof catalogSearchSchema>;
export type PageOnlySearch = z.infer<typeof pageOnlySearchSchema>;
