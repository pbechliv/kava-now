import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChangePasswordCard } from "@/components/auth/ChangePasswordCard";
import { PushNotificationsCard } from "@/components/PushNotificationsCard";
import { useAuth, useUpdateMe } from "@/lib/hooks/use-auth";

type Tab = "profile" | "password";

export function SuperAdminSettingsPage() {
  const [tab, setTab] = useState<Tab>("profile");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Ρυθμίσεις</h1>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex">
          <TabsTrigger value="profile">Προφίλ</TabsTrigger>
          <TabsTrigger value="password">Κωδικός</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="mt-6">
          <div className="max-w-2xl space-y-6">
            <ProfileTab />
            <PushNotificationsCard />
          </div>
        </TabsContent>
        <TabsContent value="password" className="mt-6">
          <ChangePasswordCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProfileTab() {
  const { user } = useAuth();
  const updateMe = useUpdateMe();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [error, setError] = useState("");

  const emailChanged = !!user && email !== user.email;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!user) return;

    const payload: { name?: string; email?: string; currentPassword?: string } = {};
    if (name !== user.name) payload.name = name;
    if (emailChanged) {
      payload.email = email;
      payload.currentPassword = currentPassword;
    }
    if (Object.keys(payload).length === 0) return;

    updateMe.mutate(payload, {
      onSuccess: () => setCurrentPassword(""),
      onError: (err) => setError(err instanceof Error ? err.message : "Κάτι πήγε στραβά"),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Τα στοιχεία μου</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sa-me-name">Όνομα</Label>
            <Input
              id="sa-me-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sa-me-email">Email</Label>
            <Input
              id="sa-me-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {emailChanged && (
            <div className="space-y-2">
              <Label htmlFor="sa-me-current-password">Τρέχων κωδικός πρόσβασης</Label>
              <Input
                id="sa-me-current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Απαιτείται για αλλαγή email"
                required
              />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {updateMe.isSuccess && <p className="text-sm text-green-600">Το προφίλ ενημερώθηκε</p>}
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button type="submit" disabled={updateMe.isPending}>
          {updateMe.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Αποθήκευση
        </Button>
      </div>
    </form>
  );
}
