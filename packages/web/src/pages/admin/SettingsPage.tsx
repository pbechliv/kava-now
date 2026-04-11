import { useState, useEffect } from "react";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Spinner } from "../../components/ui/Spinner";
import { useSettings, useUpdateSettings } from "../../lib/hooks/use-settings";
import { useAuth } from "../../lib/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";

export function SettingsPage() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [notificationEmails, setNotificationEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState("");

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

  useEffect(() => {
    if (settings) {
      setName(settings.name);
      setAddress(settings.address ?? "");
      setPhone(settings.phone ?? "");
      setEmail(settings.email);
      setLogoUrl(settings.logoUrl ?? "");
      setNotificationEmails(settings.notificationEmails ?? []);
    }
  }, [settings]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  const handleAddEmail = () => {
    const trimmed = newEmail.trim();
    if (!trimmed) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      setEmailError("Μη έγκυρο email");
      return;
    }

    if (notificationEmails.includes(trimmed)) {
      setEmailError("Το email υπάρχει ήδη");
      return;
    }

    setNotificationEmails([...notificationEmails, trimmed]);
    setNewEmail("");
    setEmailError("");
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    setNotificationEmails(
      notificationEmails.filter((e) => e !== emailToRemove),
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings.mutate({
      name,
      address: address || null,
      phone: phone || null,
      email,
      logoUrl: logoUrl || null,
      notificationEmails,
    });
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Ρυθμίσεις</h1>

      <form onSubmit={handleSubmit} className="mt-6 max-w-2xl space-y-6">
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Στοιχεία Καταστήματος
          </h2>
          <div className="space-y-4">
            <Input
              label="Όνομα"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              label="Διεύθυνση"
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            <Input
              label="Τηλέφωνο"
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Input
              label="Email"
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Logo URL"
              id="logoUrl"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Email Ειδοποιήσεων
          </h2>
          <p className="text-sm text-gray-500 mb-3">
            Αυτά τα email θα λαμβάνουν ειδοποιήσεις για νέες παραγγελίες.
          </p>

          {/* Tags */}
          <div className="flex flex-wrap gap-2 mb-3">
            {notificationEmails.map((ne) => (
              <span
                key={ne}
                className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-800"
              >
                {ne}
                <button
                  type="button"
                  onClick={() => handleRemoveEmail(ne)}
                  className="ml-1 text-amber-600 hover:text-amber-800"
                >
                  &times;
                </button>
              </span>
            ))}
            {notificationEmails.length === 0 && (
              <span className="text-sm text-gray-400">
                Δεν έχουν οριστεί email ειδοποιήσεων
              </span>
            )}
          </div>

          {/* Add email */}
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <Input
                value={newEmail}
                onChange={(e) => {
                  setNewEmail(e.target.value);
                  setEmailError("");
                }}
                placeholder="email@example.com"
                error={emailError}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddEmail();
                  }
                }}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={handleAddEmail}
              size="md"
            >
              Προσθήκη
            </Button>
          </div>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" loading={updateSettings.isPending}>
            Αποθήκευση
          </Button>
        </div>
      </form>

      <form onSubmit={handleChangePassword} className="mt-6 max-w-2xl space-y-6">
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {user?.hasPassword ? "Αλλαγή κωδικού" : "Ορισμός κωδικού"}
          </h2>
          <div className="space-y-4">
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
          </div>
        </Card>
        <div className="flex justify-end">
          <Button type="submit" loading={changePassword.isPending}>
            {user?.hasPassword ? "Αλλαγή κωδικού" : "Ορισμός κωδικού"}
          </Button>
        </div>
      </form>
    </div>
  );
}
