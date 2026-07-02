import { API_ERROR_CODES, type ApiErrorCode } from "@kava-now/shared";

/**
 * Greek user-facing messages for backend error codes. Backend sends the
 * code plus an English description; we translate here so the UI stays
 * localized without leaking Greek strings into the API surface.
 */
const CODE_MESSAGES: Record<ApiErrorCode, string> = {
  [API_ERROR_CODES.DUPLICATE_CUSTOMER_ERP_REF]:
    "Ο κωδικός ERP χρησιμοποιείται ήδη από άλλον πελάτη",
  [API_ERROR_CODES.DUPLICATE_PRODUCT_ERP_REF]: "Ο κωδικός ERP χρησιμοποιείται ήδη από άλλο προϊόν",
  [API_ERROR_CODES.DUPLICATE_PRODUCT_NAME_BRAND]: "Υπάρχει ήδη προϊόν με αυτό το όνομα και μάρκα",
  [API_ERROR_CODES.DUPLICATE_CATEGORY_NAME]: "Υπάρχει ήδη κατηγορία με αυτό το όνομα",
  [API_ERROR_CODES.DUPLICATE_TENANT_SLUG]: "Αυτό το slug χρησιμοποιείται ήδη",
  [API_ERROR_CODES.DUPLICATE_USER_EMAIL]: "Αυτό το email χρησιμοποιείται ήδη",
  [API_ERROR_CODES.DUPLICATE_TENANT_MEMBERSHIP]:
    "Αυτός ο χρήστης είναι ήδη μέλος αυτού του λογαριασμού",

  [API_ERROR_CODES.ORDER_LOCKED_BY_STATUS]:
    "Η παραγγελία δεν μπορεί να τροποποιηθεί σε αυτή την κατάσταση",
  [API_ERROR_CODES.ORDER_LOCKED_BY_ERP]:
    "Η παραγγελία έχει ήδη διαβιβαστεί στο ERP και δεν μπορεί να τροποποιηθεί",
  [API_ERROR_CODES.ORDER_ALREADY_TRANSMITTED]: "Η παραγγελία έχει ήδη διαβιβαστεί",
  [API_ERROR_CODES.ORDER_ITEM_CANCELLED]: "Το προϊόν έχει ακυρωθεί",
  [API_ERROR_CODES.ORDER_INVALID_STATUS]: "Μη έγκυρη μετάβαση κατάστασης",
  [API_ERROR_CODES.ORDER_CANCELLATION_NOT_REQUESTED]:
    "Η παραγγελία δεν έχει εκκρεμές αίτημα ακύρωσης",
  [API_ERROR_CODES.ORDER_REQUIRES_ACTIVE_ITEM]:
    "Δεν μπορείτε να ακυρώσετε την τελευταία ενεργή γραμμή — ακυρώστε ολόκληρη την παραγγελία",
  [API_ERROR_CODES.PRODUCT_NOT_AVAILABLE]: "Το προϊόν δεν είναι διαθέσιμο",
  [API_ERROR_CODES.REPLACEMENT_PRODUCT_NOT_AVAILABLE]:
    "Το προϊόν αντικατάστασης δεν είναι διαθέσιμο",

  [API_ERROR_CODES.CATEGORY_HAS_PRODUCTS]:
    "Δεν μπορείτε να διαγράψετε κατηγορία που χρησιμοποιείται από προϊόντα",
  [API_ERROR_CODES.CUSTOMER_HAS_ORDERS]: "Δεν μπορείτε να διαγράψετε πελάτη με παραγγελίες",

  [API_ERROR_CODES.INVALID_CATEGORY_REFERENCE]: "Η κατηγορία δεν βρέθηκε σε αυτόν τον λογαριασμό",
  [API_ERROR_CODES.CATEGORY_PARENT_CYCLE]:
    "Η γονική κατηγορία δεν μπορεί να είναι απόγονος αυτής της κατηγορίας",
  [API_ERROR_CODES.USER_ALREADY_ACTIVATED]: "Ο χρήστης έχει ήδη ενεργοποιηθεί",
  [API_ERROR_CODES.EMAIL_CHANGE_REQUIRES_PASSWORD]:
    "Η αλλαγή email είναι δυνατή μόνο σε λογαριασμούς με κωδικό πρόσβασης",
  [API_ERROR_CODES.INVALID_CURRENT_PASSWORD]:
    "Ο τρέχων κωδικός πρόσβασης λείπει ή είναι λανθασμένος",
  [API_ERROR_CODES.CANT_DELETE_SELF]: "Δεν μπορείτε να διαγράψετε τον εαυτό σας",
  [API_ERROR_CODES.LAST_OWNER_PROTECTION]:
    "Δεν μπορείτε να αφαιρέσετε τον τελευταίο ιδιοκτήτη του λογαριασμού",
  [API_ERROR_CODES.ONLY_OWNER_CAN_PROMOTE]: "Μόνο ιδιοκτήτης μπορεί να προωθήσει σε ιδιοκτήτη",
  [API_ERROR_CODES.ONLY_OWNER_CAN_DELETE_OWNER]: "Μόνο ιδιοκτήτης μπορεί να διαγράψει ιδιοκτήτη",
  [API_ERROR_CODES.ONLY_STAFF_PROMOTABLE]:
    "Μόνο χρήστες προσωπικού μπορούν να προωθηθούν σε ιδιοκτήτη",

  [API_ERROR_CODES.CUSTOMER_PROFILE_MISSING]: "Ο λογαριασμός σας δεν είναι συνδεδεμένος με πελάτη",
  [API_ERROR_CODES.ORIGINAL_ITEMS_UNAVAILABLE]:
    "Κανένα προϊόν από την αρχική παραγγελία δεν είναι πλέον διαθέσιμο",
  [API_ERROR_CODES.ORDER_EMPTY]: "Η παραγγελία δεν περιέχει προϊόντα",

  [API_ERROR_CODES.NO_UPDATE_FIELDS]: "Δεν δόθηκαν πεδία για ενημέρωση",
  // Fallback only — validation responses normally carry their own per-field
  // messages, which the api client prefers over this generic one.
  [API_ERROR_CODES.VALIDATION_ERROR]: "Μη έγκυρα στοιχεία — ελέγξτε τη φόρμα",
};

/**
 * Generic Greek messages keyed by HTTP status — used when the backend
 * returns no code (or an unknown one). Keeps the UI Greek even for
 * endpoints we haven't explicitly mapped.
 */
const STATUS_MESSAGES: Record<number, string> = {
  400: "Μη έγκυρο αίτημα",
  401: "Απαιτείται σύνδεση",
  403: "Δεν έχετε δικαίωμα πρόσβασης",
  404: "Δεν βρέθηκε",
  409: "Σύγκρουση δεδομένων",
  429: "Πάρα πολλές αιτήσεις. Δοκιμάστε ξανά αργότερα.",
  500: "Σφάλμα διακομιστή",
  502: "Σφάλμα διακομιστή",
  503: "Σφάλμα διακομιστή",
};

export function translateApiErrorCode(code: ApiErrorCode | undefined): string | undefined {
  return code ? CODE_MESSAGES[code] : undefined;
}

export function translateApiErrorStatus(status: number): string | undefined {
  return STATUS_MESSAGES[status];
}
