import { allowBrowserFullscreen } from './browser-fullscreen.js';
import { browserNavigationSource } from '../backends/web/navigation.js';
import { MediaPermissions } from "./media-permissions.js";
import { allowClipboardWrite } from "./browser-clipboard.js";
import { dialog } from "electron";
import { isGuestNavigationAllowed } from "./browser-policy.js";

const configured = new WeakMap<object, MediaPermissions>();
export function browserPermissions(session: any): MediaPermissions {
  const permissions = configured.get(session);
  if (!permissions) throw new Error("Browser session is not configured");
  return permissions;
}

/** Media grants last only for this app session. Clipboard requests are evaluated individually. */
export function configureBrowserSession(session: any, local: boolean): void {
  if (configured.has(session)) return;
  const permissions = new MediaPermissions(async (site, types) => {
    const result = await dialog.showMessageBox({
      type: "question", title: "Site permission", buttons: ["Deny", "Allow for this session"],
      defaultId: 0, cancelId: 0, noLink: true,
      message: `${site} wants to use your ${types.map(type => type === "audio" ? "microphone" : "camera").join(" and ")}.`,
    });
    return result.response === 1;
  });
  configured.set(session, permissions);
  session.setPermissionCheckHandler((contents: any, permission: string, requestingOrigin: string, details: any) =>
    permission === 'fullscreen' ? allowBrowserFullscreen(contents) : !local && permissions.check(contents, permission, requestingOrigin, details));
  session.setPermissionRequestHandler((contents: any, permission: string, callback: (allowed: boolean) => void, details: any) => {
    if (permission === 'fullscreen') { callback(allowBrowserFullscreen(contents, true)); return; }
    if (local) { callback(false); return; }
    if (permission === 'clipboard-sanitized-write') {
      void allowClipboardWrite(contents, details).then(callback, () => callback(false)); return;
    }
    void permissions.request(contents, permission, details).then(callback, () => callback(false));
  });
  // Local files never share cookies or permissions with network browsing and cannot exfiltrate files.
  if (local) {
    session.webRequest.onBeforeRequest((details: any, callback: (result: { cancel: boolean }) => void) => {
      const allowed = isGuestNavigationAllowed(details.url, true) || details.url.startsWith("data:") || details.url.startsWith("blob:");
      callback({ cancel: !allowed });
    });
  }
}

export function secureGuest(contents: any, local: boolean): void {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on('dom-ready', () => { void contents.executeJavaScript(browserNavigationSource()).catch(() => {}); });
  const guard = (event: any, url: string) => {
    if (!isGuestNavigationAllowed(url, local)) event.preventDefault();
  };
  contents.on("will-navigate", guard);
  contents.on("will-redirect", guard);
  // Subframes also cannot navigate into a local or privileged scheme.
  contents.on("will-frame-navigate", (event: any) => {
    const url = event.url;
    if (typeof url === "string" && url !== "about:srcdoc" && !isGuestNavigationAllowed(url, local)) event.preventDefault();
  });
  contents.on("will-attach-webview", (event: any) => event.preventDefault());
}
