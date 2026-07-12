import { z } from "zod";
import { DEFAULT_PAGE_SIZE } from "../constants";

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(DEFAULT_PAGE_SIZE),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

// Pagination params with no defaults — absent means "unpaginated". Lets one
// endpoint serve both a full list (e.g. dropdown options) and a paginated
// slice, deciding by whether `page` was supplied.
export const optionalPaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export type OptionalPaginationQuery = z.infer<typeof optionalPaginationQuerySchema>;

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
