import { Menu, type BrowserWindow } from "electron";
import { randomUUID } from "node:crypto";

export function browserLinkUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 32768 || /[\x00-\x20\x7f]/.test(value)) return false;
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
}

/** The native menu authorizes one URL; the shell supplies its explicit presentation identity. */
export function installBrowserLinks(source: any, parent: BrowserWindow, local: boolean,
  privateBrowsing: boolean, activeTarget: () => {bufferId: number; incarnation: number; sessionId: string; windowId: number; tabId: number} | undefined,
  selected: (token: string) => void) {
  let generation = 0;
  let pending: { token: string; target: NonNullable<ReturnType<typeof activeTarget>>; url: string; deadline: number; generation: number } | undefined;
  const reset = () => { generation++; pending = undefined; };
  source.on("did-start-navigation", (_event: unknown, _url: string, _inPlace: boolean, mainFrame: boolean) => {
    if (mainFrame) reset();
  });
  source.on("render-process-gone", reset);
  source.on("destroyed", reset);
  source.on("context-menu", (_event: unknown, params: { linkURL?: string }) => {
    reset();
    if (local || !browserLinkUrl(params.linkURL)) return;
    const target = activeTarget();
    if (!target) return;
    const url = params.linkURL, version = generation;
    Menu.buildFromTemplate([{
      label: privateBrowsing ? "Open link in new private tab (fresh session)" : "Open link in new Neovim tab",
      click: () => {
        if (source.isDestroyed() || generation !== version) return;
        const token = randomUUID();
        pending = { token, target, url, deadline: Date.now() + 5000, generation };
        selected(token);
      },
    }]).popup({ window: parent });
  });
  return {
    consume(token: string) {
      const request = pending;
      pending = undefined;
      if (!request || source.isDestroyed() || request.token !== token
        || request.generation !== generation || request.deadline <= Date.now()) return;
      return { target: request.target, url: request.url };
    },
  };
}
