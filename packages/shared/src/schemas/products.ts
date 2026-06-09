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

export const importProductsBatchSchema = z.object({
  rows: z
    .array(importProductRowSchema)
    .min(1, "Δεν υπάρχουν γραμμές προς εισαγωγή")
    .max(5000, "Πάρα πολλές γραμμές (όριο 5000)"),
});

export type ImportProductRow = z.infer<typeof importProductRowSchema>;
export type ImportProductsBatch = z.infer<typeof importProductsBatchSchema>;

export interface ImportProductsResult {
  inserted: number;
  updated: number;
  categoriesCreated: number;
  total: number;
}

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
