import { z } from "zod";

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * Optional uuid/date list filters — garbage values must 400 at the boundary
 * instead of reaching a typed SQL comparison (22P02 / Invalid time value →
 * 500). Empty strings count as absent (HTML form serialization).
 */
export const listFiltersQuerySchema = z.object({
  customerId: z
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  categoryId: z
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  dateFrom: z.iso
    .date()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  dateTo: z.iso
    .date()
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
