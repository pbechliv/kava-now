import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ChangePasswordCard } from "@/components/auth/change-password-card";
import { PushNotificationsCard } from "@/components/push-notifications-card";
import { ErrorBanner } from "@/components/error-banner";
import { Spinner } from "@/components/spinner";
import { useProfile, useUpdateProfile } from "@/lib/hooks/use-profile";

export function ProfilePage() {
  const { data: customer, isLoading, error } = useProfile();
  const updateProfile = useUpdateProfile();

  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    if (customer) {
      setPhone(customer.phone ?? "");
      setAddress(customer.address ?? "");
    }
  }, [customer]);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError("");
    if (!customer) return;

    const payload: { phone?: string | null; address?: string | null } = {};
    if (phone !== (customer.phone ?? "")) {
      payload.phone = phone || null;
    }
    if (address !== (customer.address ?? "")) {
      payload.address = address || null;
    }
    if (Object.keys(payload).length === 0) return;

    updateProfile.mutate(payload, {
      onError: (err) => setProfileError(err instanceof Error ? err.message : "Κάτι πήγε στραβά"),
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return <ErrorBanner message={error.message} />;
  }

  if (!customer) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Δεν βρέθηκε προφίλ πελάτη.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold tracking-tight">Προφίλ</h1>

      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Στοιχεία πελάτη</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <dl className="divide-y">
              <ReadOnlyRow label="Επωνυμία" value={customer.name} />
              <ReadOnlyRow label="Email" value={customer.email} />
              <ReadOnlyRow label="Υπεύθυνος επικοινωνίας" value={customer.contactPerson} />
            </dl>
            <p className="text-xs text-muted-foreground">
              Για αλλαγή επωνυμίας, email ή υπευθύνου επικοινωνίας, επικοινωνήστε με τον προμηθευτή
              σας.
            </p>

            <Separator />

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="profile-phone">Τηλέφωνο</Label>
                <Input
                  id="profile-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-address">Διεύθυνση</Label>
                <Input
                  id="profile-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
              {profileError && <p className="text-sm text-destructive">{profileError}</p>}
              {updateProfile.isSuccess && (
                <p className="text-sm text-success">Τα στοιχεία αποθηκεύτηκαν</p>
              )}
              <div className="flex justify-end">
                <Button type="submit" disabled={updateProfile.isPending}>
                  {updateProfile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Αποθήκευση
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <PushNotificationsCard />

        <ChangePasswordCard />
      </div>
    </div>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col py-3 sm:flex-row sm:items-center">
      <dt className="text-sm font-medium text-muted-foreground sm:w-48">{label}</dt>
      <dd className="mt-1 text-sm sm:mt-0">
        {value || <span className="text-muted-foreground">-</span>}
      </dd>
    </div>
  );
}
