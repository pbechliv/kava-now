import { useState } from "react";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { useAuth, useUpdateMe } from "../../lib/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { authClient } from "../../lib/auth-client";

type Tab = "profile" | "password";

export function SuperAdminSettingsPage() {
  const [tab, setTab] = useState<Tab>("profile");

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Ρυθμίσεις</h1>

      <div className="mt-4 border-b border-gray-200">
        <nav className="flex gap-1 -mb-px" aria-label="Tabs">
          <TabButton
            active={tab === "profile"}
            onClick={() => setTab("profile")}
          >
            Προφίλ
          </TabButton>
          <TabButton
            active={tab === "password"}
            onClick={() => setTab("password")}
          >
            Κωδικός
          </TabButton>
        </nav>
      </div>

      <div className="mt-6">
        {tab === "profile" && <ProfileTab />}
        {tab === "password" && <PasswordTab />}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        active
          ? "border-amber-500 text-amber-600"
          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
      }`}
    >
      {children}
    </button>
  );
}

function ProfileTab() {
  const { user } = useAuth();
  const updateMe = useUpdateMe();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!user) return;

    const payload: { name?: string; email?: string } = {};
    if (name !== user.name) payload.name = name;
    if (email !== user.email) payload.email = email;
    if (Object.keys(payload).length === 0) return;

    updateMe.mutate(payload, {
      onError: (err) =>
        setError(err instanceof Error ? err.message : "Κάτι πήγε στραβά"),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Τα στοιχεία μου
        </h2>
        <div className="space-y-4">
          <Input
            label="Όνομα"
            id="sa-me-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            label="Email"
            id="sa-me-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          {updateMe.isSuccess && (
            <p className="text-sm text-green-600">Το προφίλ ενημερώθηκε</p>
          )}
        </div>
      </Card>
      <div className="flex justify-end">
        <Button type="submit" loading={updateMe.isPending}>
          Αποθήκευση
        </Button>
      </div>
    </form>
  );
}

function PasswordTab() {
  const { user } = useAuth();
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

  return (
    <form onSubmit={handleChangePassword} className="max-w-2xl space-y-6">
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {user?.hasPassword ? "Αλλαγή κωδικού" : "Ορισμός κωδικού"}
        </h2>
        <div className="space-y-4">
          {user?.hasPassword && (
            <Input
              id="sa-currentPassword"
              type="password"
              label="Τρέχων κωδικός"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          )}
          <Input
            id="sa-newPassword"
            type="password"
            label="Νέος κωδικός"
            placeholder="Τουλάχιστον 8 χαρακτήρες"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <Input
            id="sa-confirmNewPassword"
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
  );
}
