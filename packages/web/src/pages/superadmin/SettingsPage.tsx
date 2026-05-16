import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChangePasswordCard } from "@/components/auth/ChangePasswordCard";
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
          <ProfileTab />
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
