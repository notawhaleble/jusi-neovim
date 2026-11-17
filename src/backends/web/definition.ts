import type { PresentationBackend } from "../../presentation/backend-registry.js";

export const webBackend: PresentationBackend = {
  id: "web", apiVersion: 1,
  validateSurface(surface) {
    if (typeof surface.uri !== "string" || surface.uri.length === 0 || surface.uri.length > 65536) {
      throw new Error("Invalid web surface URI");
    }
    const url = new URL(surface.uri);
    if (!["http:", "https:", "jusi-directory:"].includes(url.protocol) && url.href !== "about:blank") {
      throw new Error("Unsupported web surface scheme");
    }
  },
};
