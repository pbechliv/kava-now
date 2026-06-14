import { z } from "zod";

export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
  "cancellation_requested",
  "cancelled_by_customer",
] as const;

/** Body of PUT /admin/orders/:id/status — the transition rules live server-side. */
export const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
});

/** Body of POST /admin/orders/:id/cancellation-request — staff resolution of a customer request. */
export const resolveCancellationRequestSchema = z.object({
  decision: z.enum(["approve", "reject"]),
});

export type ResolveCancellationRequestInput = z.infer<typeof resolveCancellationRequestSchema>;

export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive().max(9999, "Μέγιστη ποσότητα 9999"),
      }),
    )
    .min(1, "Η παραγγελία πρέπει να περιέχει τουλάχιστον ένα προϊόν")
    .max(200, "Έως 200 γραμμές ανά παραγγελία"),
  notes: z.string().max(2000).optional(),
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
