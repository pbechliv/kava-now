import { z } from "zod";

export const createCategorySchema = z.object({
  name: z.string().min(1, "Το όνομα είναι υποχρεωτικό"),
  parentId: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1, "Το όνομα είναι υποχρεωτικό").optional(),
  parentId: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
