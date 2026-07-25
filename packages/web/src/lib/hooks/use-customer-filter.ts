import { useState } from "react";
import { useCustomer } from "./use-customers";
import type { CustomerPickerValue } from "@/components/admin/customer-picker-combobox";

/**
 * State for a `customerId` URL filter driven by a `CustomerPickerCombobox`.
 *
 * Only the id lives in the URL, but the picker renders a name — so the picked
 * customer is held locally and, when that's absent (deep link, reload), fetched
 * by id so the control shows who the list is filtered by instead of its
 * placeholder (#176). Shared by the orders and customer-users filters.
 */
export function useCustomerFilter(customerId: string | undefined) {
  const [display, setDisplay] = useState<CustomerPickerValue | null>(null);
  const { data: fetched } = useCustomer(display ? undefined : customerId);
  const selected =
    display ?? (customerId && fetched ? { id: fetched.id, name: fetched.name } : null);

  return { selected, setDisplay };
}
