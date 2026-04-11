export function isPlatformDomain(): boolean {
  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  return hostname.split(".").length <= 2;
}
