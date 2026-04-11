export function isSuperAdminDomain(): boolean {
  const hostname = window.location.hostname;
  const firstSegment = hostname.split(".")[0];
  return firstSegment === "admin";
}
