import { realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, sep } from "node:path";

export function isNetworkUrl(raw: string): boolean {
  try { return ["https:", "http:"].includes(new URL(raw).protocol); } catch { return false; }
}

export { browserPartition } from "../backends/web/partition.js";

export function isGuestNavigationAllowed(url: string, local: boolean): boolean {
  if (url === "about:blank") return true;
  try {
    const parsed = new URL(url);
    return local ? parsed.protocol === "jusi-directory:" : isNetworkUrl(url);
  } catch { return false; }
}

/** Canonical paths prevent ../ and symlinks escaping an explicitly opened local root. */
export function localRootForUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== "jusi-directory:") throw new Error("Not a local document");
  const path = parsed.searchParams.get("path");
  if (!path || !isAbsolute(path)) throw new Error("Expected an absolute local path");
  const canonical = realpathSync(path);
  return statSync(canonical).isDirectory() ? canonical : dirname(canonical);
}

export function isPathWithinRoot(path: string, root: string): boolean {
  try {
    const child = relative(root, realpathSync(path));
    return child === "" || (!isAbsolute(child) && child !== ".." && !child.startsWith(`..${sep}`));
  } catch { return false; }
}

export function isTrustedShellSender(event: any, shell: any): boolean {
  return event.sender === shell && event.senderFrame != null && event.senderFrame === shell.mainFrame;
}
