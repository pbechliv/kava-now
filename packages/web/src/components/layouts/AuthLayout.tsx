import { Outlet } from "react-router";
import { Card, CardContent } from "@/components/ui/card";

export function AuthLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-primary">KavaNow</h1>
          <p className="mt-1 text-sm text-muted-foreground">Η πλατφόρμα παραγγελιών για κάβες</p>
        </div>
        <Card>
          <CardContent className="p-6 sm:p-8">
            <Outlet />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
