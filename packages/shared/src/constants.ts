import type { OrderStatus, MembershipRole, ProductUnit } from "./types";

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
