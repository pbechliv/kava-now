import { useState, useEffect } from "react";
import { useParams } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/spinner";
import { ChangePasswordCard } from "@/components/auth/change-password-card";
import { PushNotificationsCard } from "@/components/push-notifications-card";
import { useSettings, useUpdateSettings } from "@/lib/hooks/use-settings";
import { useAuth, useUpdateMe, useUpdateNotificationPreference } from "@/lib/hooks/use-auth";

type Tab = "tenant" | "profile" | "password";

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>("tenant");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Ρυθμίσεις</h1>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-flex">
          <TabsTrigger value="tenant">Λογαριασμός</TabsTrigger>
          <TabsTrigger value="profile">Προφίλ</TabsTrigger>
          <TabsTrigger value="password">Κωδικός</TabsTrigger>
        </TabsList>
        <TabsContent value="tenant" className="mt-6">
          <TenantSettingsTab />
        </TabsContent>
        <TabsContent value="profile" className="mt-6">
          <div className="max-w-2xl space-y-6">
            <ProfileTab />
            <OrderNotificationsCard />
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

function TenantSettingsTab() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  useEffect(() => {
    if (settings) {
      setName(settings.name);
      setAddress(settings.address ?? "");
      setPhone(settings.phone ?? "");
      setEmail(settings.email);
      setLogoUrl(settings.logoUrl ?? "");
    }
  }, [settings]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings.mutate({
      name,
      address: address || null,
      phone: phone || null,
      email,
      logoUrl: logoUrl || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Στοιχεία Καταστήματος</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldRow id="name" label="Όνομα" required>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </FieldRow>
          <FieldRow id="address" label="Διεύθυνση">
            <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </FieldRow>
          <FieldRow id="phone" label="Τηλέφωνο">
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </FieldRow>
          <FieldRow id="email" label="Email" required>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </FieldRow>
          <FieldRow id="logoUrl" label="Logo URL">
            <Input
              id="logoUrl"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://..."
            />
          </FieldRow>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={updateSettings.isPending}>
          {updateSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Αποθήκευση
        </Button>
      </div>
    </form>
  );
}

function ProfileTab() {
  const { user, currentMembership } = useAuth();
  const updateMe = useUpdateMe();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
    }
  }, [user]);

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
      onError: (err) => {
        setError(err instanceof Error ? err.message : "Κάτι πήγε στραβά");
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Τα στοιχεία μου</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldRow id="me-name" label="Όνομα" required>
            <Input id="me-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </FieldRow>
          <FieldRow id="me-email" label="Email" required>
            <Input
              id="me-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </FieldRow>
          {emailChanged && (
            <FieldRow id="me-current-password" label="Τρέχων κωδικός πρόσβασης" required>
              <Input
                id="me-current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Απαιτείται για αλλαγή email"
                required
              />
            </FieldRow>
          )}
          {currentMembership?.invitedBy && (
            <div className="text-sm text-muted-foreground">
              Προσκληθήκατε από{" "}
              <span className="font-medium text-foreground">
                {currentMembership.invitedBy.name}
              </span>{" "}
              ({currentMembership.invitedBy.email})
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {updateMe.isSuccess && <p className="text-sm text-success">Το προφίλ ενημερώθηκε</p>}
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

function OrderNotificationsCard() {
  const { slug } = useParams({ strict: false });
  const { currentMembership } = useAuth();
  const updatePref = useUpdateNotificationPreference(slug ?? "");
  const enabled = currentMembership?.notifyAllOrders ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ειδοποιήσεις παραγγελιών</CardTitle>
        <CardDescription>
          Λάβετε ειδοποίηση για κάθε νέα παραγγελία, ανεξάρτητα από το αν σας έχει ανατεθεί ο
          πελάτης.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <span className="text-sm text-muted-foreground">
          {enabled ? "Ενεργό — λαμβάνετε όλες τις παραγγελίες" : "Ανενεργό"}
        </span>
        <Button
          type="button"
          variant={enabled ? "outline" : "default"}
          disabled={updatePref.isPending || !slug}
          onClick={() => updatePref.mutate(!enabled)}
        >
          {updatePref.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {enabled ? "Απενεργοποίηση" : "Ενεργοποίηση"}
        </Button>
      </CardContent>
    </Card>
  );
}

function FieldRow({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}
