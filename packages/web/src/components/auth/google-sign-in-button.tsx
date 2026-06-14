import { useEffect, useRef, useState } from "react";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";

// Google's button is a fixed-width iframe (max 400px). Measure the container
// and clamp so it never overflows on narrow viewports (e.g. iPhone).
const GOOGLE_MAX_WIDTH = 400;

type GoogleSignInButtonProps = {
  onSuccess: (credential: CredentialResponse) => void;
  onError: () => void;
};

export function GoogleSignInButton({ onSuccess, onError }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const available = el.clientWidth;
      if (available > 0) setWidth(Math.min(available, GOOGLE_MAX_WIDTH));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="flex w-full justify-center">
      {width !== undefined && (
        <GoogleLogin
          onSuccess={onSuccess}
          onError={onError}
          text="continue_with"
          theme="outline"
          shape="rectangular"
          size="large"
          logo_alignment="left"
          width={String(width)}
        />
      )}
    </div>
  );
}
