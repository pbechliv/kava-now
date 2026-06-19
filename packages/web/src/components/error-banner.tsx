import { Alert } from "@/components/ui/alert";

interface ErrorBannerProps {
  message: string;
}

export function ErrorBanner({ message }: ErrorBannerProps) {
  return <Alert variant="destructive">{message}</Alert>;
}
