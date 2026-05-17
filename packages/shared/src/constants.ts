import type {
  OrderStatus,
  MembershipRole,
  ProductUnit,
  ErpStatus,
  OrderItemStatus,
} from "./types";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Σε αναμονή",
  confirmed: "Επιβεβαιωμένη",
  shipped: "Απεσταλμένη",
  delivered: "Παραδοθείσα",
  cancelled: "Ακυρωμένη",
};

export const ORDER_ITEM_STATUS_LABELS: Record<OrderItemStatus, string> = {
  active: "Ενεργό",
  cancelled: "Ακυρωμένο",
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
