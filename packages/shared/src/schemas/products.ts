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
  imageUrl: z.string().url().optional().nullable(),
});

export const updateProductSchema = z.object({
  name: z.string().min(1, "Το όνομα είναι υποχρεωτικό").optional(),
  brand: z.string().min(1, "Η μάρκα είναι υποχρεωτική").optional(),
  categoryId: z.string().uuid().optional().nullable(),
  description: z.string().optional().nullable(),
  basePrice: z
    .number()
    .positive("Η τιμή πρέπει να είναι θετικός αριθμός")
    .optional(),
  unit: z.enum(["bottle", "case", "keg"]).optional(),
  volumeMl: z.number().int().positive().optional().nullable(),
  alcoholPct: z.number().min(0).max(100).optional().nullable(),
  sku: z.string().optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  active: z.boolean().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
