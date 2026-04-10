import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { Customer } from "@kava-now/shared";

export function useProfile() {
  return useQuery({
    queryKey: ["customer", "profile"],
    queryFn: () => api.get<Customer>("/api/customer/profile"),
  });
}
