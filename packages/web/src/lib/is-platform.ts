const baseDomainHost = (import.meta.env.VITE_BASE_DOMAIN || "lvh.me:5173").split(":")[0];

export function isPlatformDomain(): boolean {
  const hostname = window.location.hostname;
  if (hostname === "127.0.0.1") return true;
  return hostname === baseDomainHost;
}
