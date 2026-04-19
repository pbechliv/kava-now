import { z } from "zod";

export const updateCustomerBrandPricingSchema = z.object({
  assignments: z.array(
    z.object({
      brand: z.string().min(1, "Η μάρκα είναι υποχρεωτική"),
      discountPct: z
        .number({ error: "Το ποσοστό έκπτωσης είναι υποχρεωτικό" })
        .min(0, "Ελάχιστο 0%")
        .max(100, "Μέγιστο 100%"),
    }),
  ),
});

export type UpdateCustomerBrandPricingInput = z.infer<
  typeof updateCustomerBrandPricingSchema
>;
