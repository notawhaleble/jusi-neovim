export function browserPartition(url: string, bufferId: number, profile = "default", sessionId?: string, privateBrowsing = false): string {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(profile)) throw new Error("Invalid browser profile");
  if (privateBrowsing && !sessionId) throw new Error("Private browsing requires a session identity");
  if (privateBrowsing && !url.startsWith("jusi-directory:")) return `jusi-private-${sessionId}`;
  return url.startsWith("jusi-directory:") ? `jusi-local-${sessionId ?? bufferId}` : `persist:jusi-web-${profile}`;
}
