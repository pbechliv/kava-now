import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { AdminCustomerUsersSearch } from "@kava-now/shared";
import { useCustomerUsers, useInviteCustomerUser } from "@/lib/hooks/use-customer-users";
import { useCustomerFilter } from "@/lib/hooks/use-customer-filter";
import { useDeleteUser, useResendInvite } from "@/lib/hooks/use-users";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useFilterSearch } from "@/lib/hooks/use-filter-search";
import { useDeleteConfirmation } from "@/lib/hooks/use-delete-confirmation";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { InvitationStatusBadge } from "@/components/admin/invitation-status-badge";
import {
  CustomerPickerCombobox,
  type CustomerPickerValue,
} from "@/components/admin/customer-picker-combobox";
import { ResponsiveTable, type ResponsiveTableColumn } from "@/components/ui/responsive-table";
import { Spinner } from "@/components/spinner";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PaginationControls } from "@/components/pagination-controls";
import { InviteUserDialog } from "@/components/admin/invite-user-dialog";
import { UserInviteActions, useResendInviteFeedback } from "@/components/admin/user-invite-actions";
import { PAGE_SIZE } from "@/lib/constants";

type CustomerUserRow = NonNullable<ReturnType<typeof useCustomerUsers>["data"]>["data"][number];

/**
 * Every customer's users in one list, each row tagged with its customer. The
 * customer filter covers what the old per-customer page did (the Πελάτες list
 * deep-links here with `?customerId=`), and invites pick their customer, so
 * there's one place to see and manage customer logins.
 */
export function CustomerUsersPage() {
  const { search: urlSearch, setFilters } = useFilterSearch<AdminCustomerUsersSearch>();
  const page = urlSearch.page ?? 1;
  const [search, setSearch] = useState(urlSearch.search ?? "");

  const debouncedSearch = useDebouncedValue(search);
  useEffect(() => {
    if (debouncedSearch !== (urlSearch.search ?? "")) {
      setFilters({ search: debouncedSearch || undefined });
    }
  }, [debouncedSearch, urlSearch.search, setFilters]);

  const { selected: selectedCustomer, setDisplay: setCustomerDisplay } = useCustomerFilter(
    urlSearch.customerId,
  );

  const { data, isLoading } = useCustomerUsers({
    search: urlSearch.search,
    customerId: urlSearch.customerId,
    page,
    pageSize: PAGE_SIZE,
  });
  const users = data?.data ?? [];
  const total = data?.total ?? 0;

  const invite = useInviteCustomerUser();
  const remove = useDeleteUser();
  const resend = useResendInvite();
  const del = useDeleteConfirmation(remove);
  const { feedback, handleResend, resendPendingId } = useResendInviteFeedback(resend);

  const [inviteOpen, setInviteOpen] = useState(false);
  // The invite's target customer: defaults to whatever the list is filtered by.
  const [inviteCustomer, setInviteCustomer] = useState<CustomerPickerValue | null>(null);

  const openInvite = () => {
    setInviteCustomer(selectedCustomer);
    setInviteOpen(true);
  };

  const columns: ResponsiveTableColumn<CustomerUserRow>[] = [
    {
      header: "Όνομα",
      cellClassName: "font-medium",
      cell: (u) => (
        <>
          {u.name}
          {!u.activated && <InvitationStatusBadge className="ml-2" />}
        </>
      ),
    },
    { header: "Email", cellClassName: "text-muted-foreground", cell: (u) => u.email },
    {
      header: "Πελάτης",
      cell: (u) => (
        <button
          type="button"
          className="text-primary hover:underline"
          onClick={() => {
            setCustomerDisplay({ id: u.customerId, name: u.customerName });
            setFilters({ customerId: u.customerId });
          }}
        >
          {u.customerName}
        </button>
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Χρήστες πελατών</h1>
        <Button onClick={openInvite} className="self-start sm:self-auto">
          + Προσθήκη χρήστη
        </Button>
      </div>

      <FilterBar
        search={
          <SearchInput
            placeholder="Αναζήτηση με όνομα, email ή πελάτη..."
            value={search}
            onValueChange={setSearch}
          />
        }
        activeCount={urlSearch.customerId ? 1 : 0}
        onClear={() => {
          setCustomerDisplay(null);
          setFilters({ customerId: undefined });
        }}
      >
        <FilterField label="Πελάτης" className="md:w-64">
          <CustomerPickerCombobox
            selected={selectedCustomer}
            onSelect={(c) => {
              setCustomerDisplay(c);
              setFilters({ customerId: c?.id });
            }}
          />
        </FilterField>
      </FilterBar>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : users.length === 0 ? (
        <EmptyState
          message="Δεν βρέθηκαν χρήστες πελατών"
          actionLabel="+ Προσθήκη χρήστη"
          onAction={openInvite}
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
                    {!u.activated && <InvitationStatusBadge className="ml-2" />}
                  </div>
                  <div className="text-sm text-muted-foreground">{u.email}</div>
                  <div className="text-sm">{u.customerName}</div>
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

      <InviteUserDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title="Προσθήκη χρήστη πελάτη"
        description="Θα σταλεί email με σύνδεσμο για να ορίσει τον κωδικό του στον χρήστη."
        prefix={
          <FilterField label="Πελάτης">
            <CustomerPickerCombobox selected={inviteCustomer} onSelect={setInviteCustomer} />
          </FilterField>
        }
        submitDisabled={!inviteCustomer}
        pending={invite.isPending}
        error={invite.error}
        onSubmit={(values) => {
          if (!inviteCustomer) return;
          invite.mutate(
            { ...values, customerId: inviteCustomer.id },
            {
              onSuccess: () => {
                setInviteOpen(false);
                toast.success("Η πρόσκληση στάλθηκε");
              },
            },
          );
        }}
      />

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
