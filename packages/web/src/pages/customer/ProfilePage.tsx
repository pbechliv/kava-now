import { useState } from "react";
import { useProfile } from "../../lib/hooks/use-profile";
import { useAuth } from "../../lib/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";

export function ProfilePage() {
  const { data: customer, isLoading } = useProfile();
  const { user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const changePassword = useMutation({
    mutationFn: (data: {
      currentPassword?: string;
      newPassword: string;
      confirmNewPassword: string;
    }) => api.post("/api/auth/change-password", data),
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
      confirmNewPassword,
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

  const fields = [
    { label: "Επωνυμία", value: customer.name },
    { label: "Email", value: customer.email },
    { label: "Τηλέφωνο", value: customer.phone },
    { label: "Υπεύθυνος επικοινωνίας", value: customer.contactPerson },
    { label: "Διεύθυνση", value: customer.address },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Προφίλ</h1>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white shadow-sm">
        <dl className="divide-y divide-gray-100">
          {fields.map((field) => (
            <div
              key={field.label}
              className="flex flex-col sm:flex-row sm:items-center px-4 py-3"
            >
              <dt className="text-sm font-medium text-gray-500 sm:w-48">
                {field.label}
              </dt>
              <dd className="mt-1 sm:mt-0 text-sm text-gray-900">
                {field.value || (
                  <span className="text-gray-400">-</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">
          {user?.hasPassword ? "Αλλαγή κωδικού" : "Ορισμός κωδικού"}
        </h2>
        <form
          onSubmit={handleChangePassword}
          className="mt-4 max-w-md space-y-4"
        >
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

          <Button type="submit" loading={changePassword.isPending}>
            {user?.hasPassword ? "Αλλαγή κωδικού" : "Ορισμός κωδικού"}
          </Button>
        </form>
      </div>

      <p className="mt-4 text-xs text-gray-400">
        Για αλλαγές στα στοιχεία σας, επικοινωνήστε με τον προμηθευτή σας.
      </p>
    </div>
  );
}
