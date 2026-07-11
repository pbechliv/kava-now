import { z } from "zod";
import { MAX_ORDER_QUANTITY } from "../constants";

const orderQuantitySchema = z
  .number()
  .int()
  .positive()
  .max(MAX_ORDER_QUANTITY, `Μέγιστη ποσότητα ${MAX_ORDER_QUANTITY}`);

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

/**
 * Body of PATCH /admin/orders/:id/internal-notes — staff/owner-only note.
 * Empty string clears the note (stored as NULL).
 */
export const updateOrderInternalNotesSchema = z.object({
  internalNotes: z.string().max(2000).nullable(),
});

export type UpdateOrderInternalNotesInput = z.infer<typeof updateOrderInternalNotesSchema>;

export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: orderQuantitySchema,
      }),
    )
    .min(1, "Η παραγγελία πρέπει να περιέχει τουλάχιστον ένα προϊόν")
    .max(200, "Έως 200 γραμμές ανά παραγγελία"),
  notes: z.string().max(2000).optional(),
  // Structured B2B checkout fields (#175): a requested delivery date and the
  // customer's own PO reference, so "deliver Thursday before 11:00" and the PO
  // number aren't buried in the free-text note. Both optional.
  requestedDeliveryDate: z.iso.date().optional(),
  poReference: z.string().trim().max(100, "Έως 100 χαρακτήρες").optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/**
 * Body of POST /admin/orders (#159) — staff create an order on a customer's
 * behalf (phone / in-person). Same shape as the customer checkout plus the
 * target `customerId`. `origin` is set server-side to `manual` (portal orders
 * are the customer's own), so it's deliberately not part of this input.
 */
export const adminCreateOrderSchema = createOrderSchema.extend({
  customerId: z.string().uuid(),
});

export type AdminCreateOrderInput = z.infer<typeof adminCreateOrderSchema>;

// The AADE MARK is a numeric string. Copy-paste from AADE/Galaxy commonly
// carries stray whitespace, so we strip all whitespace before validating that
// only digits remain. Length stays permissive on purpose — the exact AADE
// digit count can drift — but a bound (1–20 digits) catches obvious cruft and
// typos that a bare digits-only check would let through.
export const aadeMarkSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, ""))
  .pipe(
    z
      .string()
      .min(1, "Το MARK είναι υποχρεωτικό")
      .max(20, "Το MARK είναι πολύ μεγάλο")
      .regex(/^\d+$/, "Το MARK πρέπει να περιέχει μόνο αριθμούς"),
  );

export const markOrderTransmittedSchema = z.object({
  mark: aadeMarkSchema,
});

export type MarkOrderTransmittedInput = z.infer<typeof markOrderTransmittedSchema>;

/**
 * Body of PATCH /admin/orders/:id/erp/mark — a privileged (owner/superadmin)
 * correction of an already-transmitted order's MARK. The reason is mandatory:
 * it's the audit trail for why a locked fiscal identifier was changed.
 */
export const correctOrderMarkSchema = z.object({
  mark: aadeMarkSchema,
  reason: z
    .string()
    .trim()
    .min(1, "Ο λόγος διόρθωσης είναι υποχρεωτικός")
    .max(500, "Ο λόγος διόρθωσης είναι πολύ μεγάλος"),
});

export type CorrectOrderMarkInput = z.infer<typeof correctOrderMarkSchema>;

export const addOrderItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: orderQuantitySchema,
});

export type AddOrderItemInput = z.infer<typeof addOrderItemSchema>;

export const updateOrderItemSchema = z.object({
  quantity: orderQuantitySchema,
});

export type UpdateOrderItemInput = z.infer<typeof updateOrderItemSchema>;

export const replaceOrderItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: orderQuantitySchema,
});

export type ReplaceOrderItemInput = z.infer<typeof replaceOrderItemSchema>;
