import { useState } from "react";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { useGoogleSignIn } from "@/lib/hooks/use-google-sign-in";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

const googleEnabled = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;

export function WelcomePage() {
  const { token = "", email = "", error: linkError = "" } = useSearch({ strict: false });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { slug } = useParams({ strict: false });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  // Set when better-auth rejects the token at submit time (valid at click, then
  // expired/consumed while the invitee sat on the form).
  const [tokenRejected, setTokenRejected] = useState(false);

  const loginPath = slug ? `/k/${slug}/login` : "/login";
  const homePath = slug ? `/k/${slug}` : "/";

  const { data: tenantInfo } = useQuery({
    queryKey: ["tenant-info", slug],
    queryFn: () => api.get<{ name: string; slug: string }>(`/api/k/${slug}/tenant`),
    enabled: !!slug,
    retry: false,
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationFn: async (newPassword: string) => {
      const { error: authError } = await authClient.resetPassword({ newPassword, token });
      if (authError) {
        // better-auth returns BAD_REQUEST / "Invalid token" when the token is
        // expired or already consumed. Surface the re-request path rather than
        // the raw English message.
        const isTokenError =
          authError.code === "INVALID_TOKEN" || /invalid token/i.test(authError.message ?? "");
        if (isTokenError) {
          const expired = new Error("INVALID_TOKEN");
          expired.name = "InvalidToken";
          throw expired;
        }
        throw new Error(authErrorMessage(authError, "Ο ορισμός κωδικού απέτυχε — δοκιμάστε ξανά"));
      }
      // better-auth's resetPassword creates no session. The invite link carries
      // the email, so sign the invitee in transparently instead of bouncing
      // them to the login form. If the email is absent (older links) or sign-in
      // fails, fall back to the "password set — please sign in" screen.
      if (email) {
        const { error: signInError } = await authClient.signIn.email({
          email,
          password: newPassword,
        });
        if (!signInError) return { signedIn: true };
      }
      return { signedIn: false };
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["auth"] });
      if (result.signedIn) {
        // HomePage resolves the correct role-based landing page.
        void navigate({ to: homePath, replace: true });
      }
    },
    onError: (err) => {
      if (err instanceof Error && err.name === "InvalidToken") {
        setTokenRejected(true);
      }
    },
  });

  const googleSignIn = useGoogleSignIn();

  const reRequestLink = slug ? (
    <Link
      to="/k/$slug/auth/forgot-password"
      params={{ slug }}
      search={{ email }}
      className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
    >
      Ζητήστε νέο σύνδεσμο
    </Link>
  ) : (
    <Link
      to="/auth/forgot-password"
      search={{ email }}
      className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
    >
      Ζητήστε νέο σύνδεσμο
    </Link>
  );

  // The invite link is unusable: no token, better-auth flagged it at click
  // (?error=…), or it was rejected on submit. Offer a fresh link instead of a
  // dead end.
  if (!token || linkError || tokenRejected) {
    return (
      <div className="text-center">
        <h2 className="text-lg font-semibold">Ο σύνδεσμος δεν είναι πλέον έγκυρος</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Ο σύνδεσμος πρόσκλησης έληξε ή έχει ήδη χρησιμοποιηθεί. Ζητήστε νέο σύνδεσμο για να
          ολοκληρώσετε την εγγραφή σας.
        </p>
        <div className="mt-4 flex flex-col items-center gap-1">
          {reRequestLink}
          <Link
            to={loginPath}
            className="inline-block text-sm font-medium text-muted-foreground hover:underline"
          >
            Επιστροφή στη σύνδεση
          </Link>
        </div>
      </div>
    );
  }

  // Auto-login succeeded — we're navigating to the home page; show a brief
  // spinner instead of flashing the success screen.
  if (mutation.isSuccess && mutation.data.signedIn) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Password set but not auto-signed-in (no email on the link / sign-in failed).
  if (mutation.isSuccess) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-lg font-semibold">Ο κωδικός ορίστηκε</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Ο λογαριασμός σας είναι έτοιμος — συνδεθείτε για να συνεχίσετε.
        </p>
        <Button className="mt-6" onClick={() => void navigate({ to: loginPath, replace: true })}>
          Σύνδεση
        </Button>
      </div>
    );
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες");
      return;
    }
    if (password !== confirm) {
      setError("Οι κωδικοί δεν ταιριάζουν");
      return;
    }
    mutation.mutate(password);
  };

  return (
    <div>
      <h2 className="text-center text-lg font-semibold">Καλώς ήρθατε!</h2>
      {tenantInfo?.name && (
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Έχετε προσκληθεί στο <strong>{tenantInfo.name}</strong>.
        </p>
      )}
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Ορίστε τον κωδικό σας για να ολοκληρώσετε τη σύνδεση.
      </p>

      {googleEnabled && (
        <div className="mt-6 space-y-3">
          <GoogleSignInButton
            onSuccess={(cred) => googleSignIn.mutate(cred)}
            onError={() => googleSignIn.reset()}
          />
          {googleSignIn.error && (
            <p className="text-sm text-destructive">
              {googleSignIn.error instanceof Error
                ? googleSignIn.error.message
                : "Η σύνδεση με Google απέτυχε"}
            </p>
          )}
          <div className="relative my-2">
            <Separator />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
              ή ορίστε κωδικό
            </span>
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="welcome-password">Νέος κωδικός</Label>
          <Input
            id="welcome-password"
            type="password"
            placeholder="Τουλάχιστον 8 χαρακτήρες"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="welcome-confirm">Επιβεβαίωση κωδικού</Label>
          <Input
            id="welcome-confirm"
            type="password"
            placeholder="Επαναλάβετε τον κωδικό"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        {(error || mutation.error) && (
          <p className="text-sm text-destructive">
            {error ||
              (mutation.error instanceof Error ? mutation.error.message : "Κάτι πήγε στραβά")}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Ορισμός κωδικού
        </Button>
      </form>
    </div>
  );
}
