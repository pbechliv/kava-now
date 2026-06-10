import { useEffect, useState } from "react";
import { BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getCurrentSubscription,
  getPushPublicKey,
  pushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push";

type PushState =
  | "loading"
  | "unsupported" // browser can't do web push (e.g. iOS Safari outside a PWA)
  | "unconfigured" // server has no VAPID keys — feature off
  | "off"
  | "on";

/**
 * Per-device push toggle (#28) — shown on the profile/settings pages of all
 * three roles. Subscribing this browser is the opt-in; permission is only
 * requested when the user clicks.
 */
export function PushNotificationsCard() {
  const [state, setState] = useState<PushState>("loading");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!pushSupported()) {
        if (!cancelled) setState("unsupported");
        return;
      }
      try {
        const key = await getPushPublicKey();
        if (cancelled) return;
        if (!key) {
          setState("unconfigured");
          return;
        }
        setPublicKey(key);
        const sub = await getCurrentSubscription();
        if (!cancelled) setState(sub ? "on" : "off");
      } catch {
        if (!cancelled) setState("unconfigured");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async () => {
    if (busy || !publicKey) return;
    setBusy(true);
    try {
      if (state === "on") {
        await unsubscribeFromPush();
        setState("off");
        toast.success("Οι ειδοποιήσεις push απενεργοποιήθηκαν σε αυτή τη συσκευή");
      } else {
        const result = await subscribeToPush(publicKey);
        if (result === "subscribed") {
          setState("on");
          toast.success("Οι ειδοποιήσεις push ενεργοποιήθηκαν σε αυτή τη συσκευή");
        } else if (result === "denied") {
          toast.error("Οι ειδοποιήσεις είναι αποκλεισμένες από τον browser");
        } else {
          setState("unsupported");
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Κάτι πήγε στραβά");
    } finally {
      setBusy(false);
    }
  };

  // Feature off server-side → don't render a dead control at all.
  if (state === "unconfigured") return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="h-4 w-4" />
          Ειδοποιήσεις push
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Λάβετε ειδοποιήσεις για παραγγελίες σε αυτή τη συσκευή, επιπλέον των email.
        </p>
        {state === "unsupported" ? (
          <p className="text-sm text-muted-foreground">
            Ο browser δεν υποστηρίζει ειδοποιήσεις push. Σε iPhone/iPad απαιτείται προσθήκη της
            εφαρμογής στην αρχική οθόνη.
          </p>
        ) : (
          <Button
            type="button"
            variant={state === "on" ? "outline" : "default"}
            disabled={busy || state === "loading"}
            aria-pressed={state === "on"}
            onClick={() => void toggle()}
          >
            {(busy || state === "loading") && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {state === "on" ? "Απενεργοποίηση σε αυτή τη συσκευή" : "Ενεργοποίηση ειδοποιήσεων"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
