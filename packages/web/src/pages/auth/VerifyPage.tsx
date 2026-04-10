import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router";
import { api, ApiError } from "../../lib/api";
import { Spinner } from "../../components/ui/Spinner";
import type { User } from "@kava-now/shared";

interface VerifyResponse {
  success: boolean;
  redirect: string;
  user: User;
}

export function VerifyPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setError("Λείπει το token επαλήθευσης");
      return;
    }

    api
      .get<VerifyResponse>(`/api/auth/verify?token=${encodeURIComponent(token)}`)
      .then((data) => {
        navigate(data.redirect, { replace: true });
      })
      .catch((err) => {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("Η επαλήθευση απέτυχε. Δοκιμάστε ξανά.");
        }
      });
  }, [searchParams, navigate]);

  if (error) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Σφάλμα επαλήθευσης</h2>
        <p className="mt-2 text-sm text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center py-4">
      <Spinner />
      <p className="mt-4 text-sm text-gray-600">Επαλήθευση...</p>
    </div>
  );
}
