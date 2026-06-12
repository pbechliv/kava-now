import type { OrderStatus, MembershipRole, ProductUnit, ErpStatus } from "./types";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Σε αναμονή",
  confirmed: "Επιβεβαιωμένη",
  shipped: "Απεσταλμένη",
  delivered: "Παραδοθείσα",
  cancelled: "Ακυρωμένη",
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
};
