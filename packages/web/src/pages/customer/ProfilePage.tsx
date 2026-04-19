import { useEffect, useState } from "react";
import { useProfile, useUpdateProfile } from "../../lib/hooks/use-profile";
import { useAuth } from "../../lib/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { authClient } from "../../lib/auth-client";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";

export function ProfilePage() {
  const { data: customer, isLoading } = useProfile();
  const { user } = useAuth();
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

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const changePassword = useMutation({
    mutationFn: async (data: {
      currentPassword?: string;
      newPassword: string;
    }) => {
      if (data.currentPassword) {
        const { error } = await authClient.changePassword({
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
        });
        if (error) throw new Error(error.message ?? "Σφάλμα");
        return;
      }
      // set-password isn't exposed by better-auth's REST API; use our proxy.
      await api.post("/api/auth/set-password", {
        newPassword: data.newPassword,
      });
    },
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordError("");
    },
    onError: (err) => {
      setPasswordError(
        err instanceof Error ? err.message : "Κάτι πήγε στραβά",
      );
    },
  });

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");

    if (newPassword.length < 8) {
      setPasswordError("Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError("Οι κωδικοί δεν ταιριάζουν");
      return;
    }

    changePassword.mutate({
      ...(user?.hasPassword ? { currentPassword } : {}),
      newPassword,
    });
  };

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
      onError: (err) =>
        setProfileError(
          err instanceof Error ? err.message : "Κάτι πήγε στραβά",
        ),
    });
  };

  if (isLoading) {
    return (
      <div className="text-center text-sm text-gray-500 py-8">Φόρτωση...</div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center text-sm text-gray-500 py-8">
        Δεν βρέθηκε προφίλ πελάτη.
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Προφίλ</h1>

      <div className="mt-6 max-w-2xl">
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Στοιχεία πελάτη
          </h2>
          <dl className="divide-y divide-gray-100 mb-4">
            <ReadOnlyRow label="Επωνυμία" value={customer.name} />
            <ReadOnlyRow label="Email" value={customer.email} />
            <ReadOnlyRow
              label="Υπεύθυνος επικοινωνίας"
              value={customer.contactPerson}
            />
          </dl>
          <p className="text-xs text-gray-400 mb-4">
            Για αλλαγή επωνυμίας, email ή υπευθύνου επικοινωνίας,
            επικοινωνήστε με τον προμηθευτή σας.
          </p>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <Input
              label="Τηλέφωνο"
              id="profile-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Input
              label="Διεύθυνση"
              id="profile-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            {profileError && (
              <p className="text-sm text-red-600">{profileError}</p>
            )}
            {updateProfile.isSuccess && (
              <p className="text-sm text-green-600">Τα στοιχεία αποθηκεύτηκαν</p>
            )}
            <div className="flex justify-end">
              <Button type="submit" loading={updateProfile.isPending}>
                Αποθήκευση
              </Button>
            </div>
          </form>
        </Card>
      </div>

      <div className="mt-8 max-w-2xl">
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {user?.hasPassword ? "Αλλαγή κωδικού" : "Ορισμός κωδικού"}
          </h2>
          <form onSubmit={handleChangePassword} className="space-y-4">
            {user?.hasPassword && (
              <Input
                id="currentPassword"
                type="password"
                label="Τρέχων κωδικός"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            )}
            <Input
              id="newPassword"
              type="password"
              label="Νέος κωδικός"
              placeholder="Τουλάχιστον 8 χαρακτήρες"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <Input
              id="confirmNewPassword"
              type="password"
              label="Επιβεβαίωση νέου κωδικού"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
            />

            {passwordError && (
              <p className="text-sm text-red-600">{passwordError}</p>
            )}

            {changePassword.isSuccess && (
              <p className="text-sm text-green-600">
                Ο κωδικός άλλαξε επιτυχώς
              </p>
            )}

            <div className="flex justify-end">
              <Button type="submit" loading={changePassword.isPending}>
                {user?.hasPassword ? "Αλλαγή κωδικού" : "Ορισμός κωδικού"}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}

function ReadOnlyRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center py-3">
      <dt className="text-sm font-medium text-gray-500 sm:w-48">{label}</dt>
      <dd className="mt-1 sm:mt-0 text-sm text-gray-900">
        {value || <span className="text-gray-400">-</span>}
      </dd>
    </div>
  );
}
