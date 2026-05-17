import { z } from "zod";

export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1, "Η παραγγελία πρέπει να περιέχει τουλάχιστον ένα προϊόν"),
  notes: z.string().optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const markOrderTransmittedSchema = z.object({
  mark: z.string().trim().min(1, "Το MARK είναι υποχρεωτικό"),
});

export type MarkOrderTransmittedInput = z.infer<typeof markOrderTransmittedSchema>;

export const addOrderItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

export type AddOrderItemInput = z.infer<typeof addOrderItemSchema>;

export const updateOrderItemSchema = z.object({
  quantity: z.number().int().positive(),
});

export type UpdateOrderItemInput = z.infer<typeof updateOrderItemSchema>;

export const replaceOrderItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

export type ReplaceOrderItemInput = z.infer<typeof replaceOrderItemSchema>;
