import { z } from "zod";

export const assignProductsSchema = z.object({
  assignments: z.array(
    z.object({
      productId: z.string().uuid(),
      customPrice: z.number().positive().nullable().optional(),
      active: z.boolean().default(true),
    }),
  ),
});

export type AssignProductsInput = z.infer<typeof assignProductsSchema>;
