import type { OrderStatus, MembershipRole, ProductUnit, ErpStatus, OrderOrigin } from "./types";

/** Rows per page for all paginated list views — one value for API + web. */
export const DEFAULT_PAGE_SIZE = 50;

/** Max quantity per order line — enforced by the API schemas and mirrored by
 * the web's steppers/inputs so the cap is visible before submit. */
export const MAX_ORDER_QUANTITY = 9999;

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Σε αναμονή",
  confirmed: "Επιβεβαιωμένη",
  shipped: "Απεσταλμένη",
  delivered: "Παραδοθείσα",
  cancelled: "Ακυρωμένη",
  cancellation_requested: "Αίτημα ακύρωσης",
  cancelled_by_customer: "Ακυρώθηκε από πελάτη",
};

export const ROLE_LABELS: Record<MembershipRole, string> = {
  owner: "Ιδιοκτήτης",
  staff: "Προσωπικό",
  customer: "Πελάτης",
};

export const UNIT_LABELS: Record<ProductUnit, string> = {
  bottle: "Φιάλη",
  case: "Κιβώτιο",
  keg: "Βαρέλι",
};

export const ERP_STATUS_LABELS: Record<ErpStatus, string> = {
  pending: "Εκκρεμεί",
  transmitted: "Διαβιβασμένη",
};

export const ORDER_ORIGIN_LABELS: Record<OrderOrigin, string> = {
  portal: "Πύλη πελάτη",
  manual: "Χειροκίνητη",
};

/**
 * Fulfillment status transition rules: key = current, value = allowed next.
 * The API enforces these server-side; the web uses them to drive the
 * status-change picker.
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
  // Customer-driven statuses are NOT staff-pickable transitions. A pending
  // cancellation request is resolved via the dedicated approve/reject endpoint,
  // and customer cancellations are terminal — so the staff status picker offers
  // nothing here.
  cancellation_requested: [],
  cancelled_by_customer: [],
};

/**
 * Fulfillment statuses that can never be transmitted to the ERP — a cancelled
 * (or cancellation-pending) order is blocked from transmission, so it must not
 * count toward the "pending ERP" compliance KPI or appear in its filtered list
 * (#162). The ERP-transmit guard in the API rejects exactly these statuses.
 */
export const ERP_UNTRANSMITTABLE_STATUSES: OrderStatus[] = [
  "cancelled",
  "cancelled_by_customer",
  "cancellation_requested",
];
