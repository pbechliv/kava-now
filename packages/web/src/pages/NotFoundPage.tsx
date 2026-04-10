import { Link } from "react-router";
import { Button } from "../components/ui/Button";

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <h1 className="text-6xl font-bold text-gray-300">404</h1>
      <p className="mt-4 text-lg text-gray-600">Η σελίδα δεν βρέθηκε</p>
      <Link to="/" className="mt-6">
        <Button variant="primary">Αρχική</Button>
      </Link>
    </div>
  );
}
