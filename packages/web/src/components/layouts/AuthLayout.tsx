import { Outlet } from "react-router";

export function AuthLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-amber-600">KavaNow</h1>
          <p className="mt-1 text-sm text-gray-500">Η πλατφόρμα παραγγελιών για κάβες</p>
        </div>
        <div className="rounded-xl bg-white p-8 shadow-sm border border-gray-100">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
