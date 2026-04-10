import { z } from "zod";

export const createPricingTierSchema = z.object({
  name: z.string().min(1, "Το όνομα είναι υποχρεωτικό"),
  discountPct: z
    .number({ required_error: "Το ποσοστό έκπτωσης είναι υποχρεωτικό" })
    .min(0, "Ελάχιστο 0%")
    .max(100, "Μέγιστο 100%"),
});

export const updatePricingTierSchema = z.object({
  name: z.string().min(1, "Το όνομα είναι υποχρεωτικό").optional(),
  discountPct: z.number().min(0, "Ελάχιστο 0%").max(100, "Μέγιστο 100%").optional(),
});

export type CreatePricingTierInput = z.infer<typeof createPricingTierSchema>;
export type UpdatePricingTierInput = z.infer<typeof updatePricingTierSchema>;
