import { BrowserWindow } from "electron";
import { secureGuest } from "./browser-session.js";

import { PopupPermit } from "./popup-policy.js";

/** One native child owned by one source guest. No guest-controlled host bridge. */
export function installBrowserPopups(source: any, parent: BrowserWindow, local: boolean,
  feedback: (message: string) => void, returnToText: () => void) {
  const permit = new PopupPermit();
  let label = "", child: BrowserWindow | undefined, lastNotice = 0;
  const notice = (message: string) => {
    if (Date.now() - lastNotice < 1000) return;
    lastNotice = Date.now(); feedback(message);
  };
  const reset = () => { permit.reset(); child?.destroy(); child = undefined; };
  source.on("destroyed", reset);
  source.on("render-process-gone", reset);
  source.on("did-start-navigation", (_event: unknown, _url: string, inPlace: boolean, mainFrame: boolean) => {
    if (mainFrame && !inPlace) reset();
  });
  parent.on("closed", reset);
  source.once("destroyed", () => parent.removeListener("closed", reset));
  source.setWindowOpenHandler((details: { url: string; disposition?: string }) => {
    if (details.disposition === "background-tab") {
      permit.reset(); notice("Background-tab popup blocked; retry a foreground open action.");
      return { action: "deny" };
    }
    if (local || !permit.take(details.url) || child) {
      notice("Popup blocked. Use Allow next popup, then repeat the page action. Only web URLs are supported.");
      return { action: "deny" };
    }
    permit.reset(); // Consume before creation, including failed creation.
    return {
      action: "allow",
      outlivesOpener: false,
      overrideBrowserWindowOptions: {
        show: false, frame: true, width: 900, height: 700, fullscreenable: false,
        webPreferences: { session: source.session, sandbox: true, contextIsolation: true,
          nodeIntegration: false, nodeIntegrationInSubFrames: false, nodeIntegrationInWorker: false,
          webSecurity: true, allowRunningInsecureContent: false, webviewTag: false },
      },
      createWindow: (options: any) => {
        const popup = new BrowserWindow({
          ...options, parent, show: false, frame: true, width: 900, height: 700,
          minWidth: 500, minHeight: 300, fullscreenable: false, alwaysOnTop: false,
          skipTaskbar: false, titleBarStyle: "default", transparent: false,
        });
        child = popup;
        const contents = popup.webContents;
        secureGuest(contents, false); // Includes nested-popup denial and scheme guards.
        contents.setWindowOpenHandler(() => {
          notice("Nested popup blocked."); return { action: "deny" };
        });
        const title = () => {
          const url = contents.getURL();
          let site = "Blank page";
          try { site = new URL(url).origin; if (site === "null") site = "Blank page"; } catch {}
          popup.setTitle(`Jusi popup · ${label} · ${site}`);
        };
        contents.on("page-title-updated", (event: any) => { event.preventDefault(); title(); });
        contents.on("did-navigate", title);
        contents.on("did-navigate-in-page", title);
        contents.on("content-bounds-updated", (event: any) => event.preventDefault());
        let textChordUntil = 0;
        contents.on("before-input-event", (event: any, input: any) => {
          if (input.type !== "keyDown") return;
          if (input.control && input.key.toLowerCase() === "q") { event.preventDefault(); popup.destroy(); }
          if (input.control && input.key.toLowerCase() === "n" && Date.now() < textChordUntil) {
            event.preventDefault(); textChordUntil = 0; parent.focus(); returnToText(); return;
          }
          textChordUntil = input.control && input.key === "\\" ? Date.now() + 2000 : 0;
          if (textChordUntil) event.preventDefault();
        });
        contents.on("render-process-gone", () => { notice("Popup stopped."); popup.destroy(); });
        popup.on("closed", () => { if (child === popup) child = undefined; });
        popup.setMenu(null);
        title(); popup.center(); popup.show();
        return contents;
      },
    };
  });
  return {
    arm(scope: string): boolean {
      if (local || source.isDestroyed() || child) return false;
      label = scope; permit.arm();
      return true;
    },
  };
}
