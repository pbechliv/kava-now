import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4">
      <h1 className="text-6xl font-bold text-muted-foreground/30">404</h1>
      <p className="mt-4 text-lg text-muted-foreground">Η σελίδα δεν βρέθηκε</p>
      <Link to="/" className="mt-6">
        <Button>Αρχική</Button>
      </Link>
    </div>
  );
}
