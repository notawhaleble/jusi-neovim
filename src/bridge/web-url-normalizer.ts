import { statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export function normalizeWebSessionUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch (_error) {
    return rawUrl;
  }

  if (parsed.protocol !== "file:") {
    return rawUrl;
  }

  try {
    const filePath = fileURLToPath(parsed);
    const normalized = new URL(pathToFileURL(filePath).href);
    if (localPathExists(filePath)) {
      return localPathWebSessionUrl(filePath);
    }
    normalized.search = parsed.search;
    normalized.hash = parsed.hash;
    return normalized.href;
  } catch (_error) {
    return rawUrl;
  }
}

function localPathWebSessionUrl(filePath: string): string {
  const url = new URL("jusi-directory://open/");
  url.searchParams.set("path", filePath);
  return url.href;
}

function localPathExists(filePath: string): boolean {
  try {
    statSync(filePath);
    return true;
  } catch (_error) {
    return false;
  }
}
