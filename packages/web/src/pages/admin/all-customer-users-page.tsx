import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import type { AdminCustomerUsersSearch } from "@kava-now/shared";
import { useAllCustomerUsers } from "@/lib/hooks/use-customer-users";
import { useTenantSlug } from "@/lib/hooks/use-tenant-api";
import { useDeleteUser, useResendInvite } from "@/lib/hooks/use-users";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useFilterSearch } from "@/lib/hooks/use-filter-search";
import { useDeleteConfirmation } from "@/lib/hooks/use-delete-confirmation";
import { SearchInput } from "@/components/ui/search-input";
import { InvitationStatusBadge } from "@/components/admin/invitation-status-badge";
import { ResponsiveTable, type ResponsiveTableColumn } from "@/components/ui/responsive-table";
import { Spinner } from "@/components/spinner";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PaginationControls } from "@/components/pagination-controls";
import { UserInviteActions, useResendInviteFeedback } from "@/components/admin/user-invite-actions";
import { PAGE_SIZE } from "@/lib/constants";

type CustomerUserRow = NonNullable<ReturnType<typeof useAllCustomerUsers>["data"]>["data"][number];

export function AllCustomerUsersPage() {
  const slug = useTenantSlug();
  const adminBase = `/k/${slug}/admin`;
  const { search: urlSearch, setFilters } = useFilterSearch<AdminCustomerUsersSearch>();
  const page = urlSearch.page ?? 1;
  const [search, setSearch] = useState(urlSearch.search ?? "");

  const debouncedSearch = useDebouncedValue(search);
  useEffect(() => {
    if (debouncedSearch !== (urlSearch.search ?? "")) {
      setFilters({ search: debouncedSearch || undefined });
    }
  }, [debouncedSearch, urlSearch.search, setFilters]);

  const { data, isLoading } = useAllCustomerUsers({
    search: urlSearch.search,
    page,
    pageSize: PAGE_SIZE,
  });
  const users = data?.data ?? [];
  const total = data?.total ?? 0;

  const remove = useDeleteUser();
  const resend = useResendInvite();
  const del = useDeleteConfirmation(remove);
  const { feedback, handleResend, resendPendingId } = useResendInviteFeedback(resend);

  // Data-driven path (customer id) — not a static route literal.
  const customerLink = (customerId: string): string => `${adminBase}/customers/${customerId}/users`;

  const columns: ResponsiveTableColumn<CustomerUserRow>[] = [
    {
      header: "Όνομα",
      cellClassName: "font-medium",
      cell: (u) => (
        <>
          {u.name}
          {!u.emailVerified && <InvitationStatusBadge className="ml-2" />}
        </>
      ),
    },
    { header: "Email", cellClassName: "text-muted-foreground", cell: (u) => u.email },
    {
      header: "Πελάτης",
      cell: (u) => (
        <Link to={customerLink(u.customerId)} className="text-primary hover:underline">
          {u.customerName}
        </Link>
      ),
    },
    {
      header: "Προσκλήθηκε από",
      cellClassName: "text-muted-foreground",
      cell: (u) =>
        u.invitedByName ? (
          <span title={u.invitedByEmail ?? ""}>{u.invitedByName}</span>
        ) : (
          <span className="text-muted-foreground/60">—</span>
        ),
    },
    {
      header: undefined,
      headClassName: "text-right",
      cellClassName: "text-right",
      cell: (u) => (
        <UserInviteActions
          user={u}
          feedback={feedback}
          resendPendingId={resendPendingId}
          onResend={handleResend}
          onDelete={del.request}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Χρήστες πελατών</h1>

      <SearchInput
        placeholder="Αναζήτηση με όνομα, email ή πελάτη..."
        value={search}
        onValueChange={setSearch}
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : users.length === 0 ? (
        <EmptyState
          message="Δεν βρέθηκαν χρήστες πελατών"
          description="Οι χρήστες προστίθενται από τη σελίδα του κάθε πελάτη."
        />
      ) : (
        <>
          <ResponsiveTable
            data={users}
            columns={columns}
            getRowKey={(u) => u.id}
            renderMobileItem={(u) => (
              <>
                <div className="min-w-0">
                  <div className="font-medium">
                    {u.name}
                    {!u.emailVerified && <InvitationStatusBadge className="ml-2" />}
                  </div>
                  <div className="text-sm text-muted-foreground">{u.email}</div>
                  <div className="text-sm">
                    <Link to={customerLink(u.customerId)} className="text-primary hover:underline">
                      {u.customerName}
                    </Link>
                  </div>
                  {u.invitedByName && (
                    <div className="text-sm text-muted-foreground">
                      Προσκλήθηκε από {u.invitedByName}
                    </div>
                  )}
                </div>
                <UserInviteActions
                  user={u}
                  feedback={feedback}
                  resendPendingId={resendPendingId}
                  onResend={handleResend}
                  onDelete={del.request}
                  align="start"
                />
              </>
            )}
          />
          <PaginationControls
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={(p) => setFilters({ page: p })}
          />
        </>
      )}

      <ConfirmDialog
        {...del.dialogProps}
        title="Αφαίρεση χρήστη"
        description={
          <>
            Είστε σίγουροι ότι θέλετε να αφαιρέσετε τον χρήστη{" "}
            <span className="font-medium text-foreground">{del.target?.name}</span> από τον πελάτη;
          </>
        }
        confirmLabel="Αφαίρεση"
        onConfirm={() => del.confirm(() => toast.success("Ο χρήστης αφαιρέθηκε"))}
      />
    </div>
  );
}
