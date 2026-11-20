import { BrowserDocumentEvents } from './browser-document-events.js';
import { BrowserFullscreen } from './browser-fullscreen.js';
import { startBrowserTrace, traceBrowser, traceBrowserUrl, browserTraceEnabled, browserTraceMark } from './browser-trace.js';
import { isFullscreenToggleInput, toggleFullscreen } from './browser-window-input.js';
import { resetBrowserInputOnFocusBoundary } from './browser-input-boundary.js';
import { observeBrowserLocation } from './browser-location.js';
import { browserCommandForInput, dispatchBrowserCommand, zoomActionForInput as appZoomActionForInput } from '../backends/web/browser-commands.js';
import { BrowserModeKeys } from '../backends/web/mode-keys.js';
import { NativePopupCoordinator } from "./native-popups.js";
import { NativeViewportExchange, nativeLayoutKey } from "./native-viewport.js";
import { browserLinkUrl, installBrowserLinks } from "./browser-links.js";
import { markHintsSource } from "../backends/web/mark-hints.js";
import { browserIndex, browserPosition } from "../backends/web/interaction.js";
import { mirrorLinkTargetSource } from "../backends/web/document-scripts.js";
import { browserPartition } from "../backends/web/partition.js";
import { BrowserProfiles, type ProfileAction } from "./browser-profiles.js";
import { directoryScheme, registerDirectoryProtocol, type ProtocolRegistry } from "../backends/web/local-preview.js";
import { DocumentRevisions, DocumentTicket } from "../presentation/document-revisions.js";
import { configureBrowserSession, browserPermissions, secureGuest } from "./browser-session.js";
import { isGuestNavigationAllowed, isTrustedShellSender, localRootForUrl } from "./browser-policy.js";
import { app, BrowserWindow, dialog, webContents, clipboard, ipcMain, Menu, nativeImage, protocol, session as electronSession } from "electron";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { EmbeddedNvimRpcClient } from "../bridge/nvim-client.js";
import { EmbeddedNvimSession, EmbeddedSessionState } from "../bridge/rpc-session.js";
import { MirrorDocument, UiSnapshot } from "../core/types.js";
import { RendererSessionState } from "../renderer/contracts.js";
import { isCtrlAInput, isPhysicalKeyInput, isTabKey, isWindowCommandFollower, shouldBlockShellAccelerator } from "./key-routing.js";

const appDisplayName = "Jusi Neovim";
const appLogoFile = "jusi-neovim-logo.png";
const linuxExecutableName = "jusi-neovim";
const linuxDesktopFileName = `${linuxExecutableName}.desktop`;

app.setName(appDisplayName);
protocol.registerSchemesAsPrivileged([
  {
    scheme: directoryScheme,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
    },
  },
]);

function currentDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

function projectRoot(): string {
  return resolve(currentDir(), "..", "..");
}

function rendererHtml(): string {
  return join(projectRoot(), "src", "renderer", "index.html");
}

function rendererQuery(): Record<string, string> | undefined {
  return shouldLogPerf() ? { perf: "1" } : undefined;
}

function preloadScript(): string {
  return join(projectRoot(), "src", "electron", "preload.cjs");
}

function runtimePluginScript(): string {
  return join(projectRoot(), "runtime", "plugin", "jusi_neovim.lua");
}

function appIconCandidates(): string[] {
  const env = processEnv();
  const appDir = env.APPDIR;
  return [
    ...(appDir
      ? [
          join(appDir, ".DirIcon"),
          join(appDir, `${linuxExecutableName}.png`),
          join(appDir, "usr", "share", "icons", "hicolor", "512x512", "apps", `${linuxExecutableName}.png`),
          join(appDir, "usr", "share", "icons", "hicolor", "1024x1024", "apps", `${linuxExecutableName}.png`),
        ]
      : []),
    join(projectRoot(), "build", "icons", "512x512.png"),
    join(projectRoot(), "assets", appLogoFile),
  ];
}

function appIconPath(): string {
  return appIconCandidates().find((candidate) => existsSync(candidate)) ?? join(projectRoot(), "assets", appLogoFile);
}

function appIcon(): string | ReturnType<typeof nativeImage.createFromPath> {
  const iconPath = appIconPath();
  const icon = nativeImage.createFromPath(iconPath);
  return icon.isEmpty() ? iconPath : icon;
}

function currentPlatform(): string {
  return (globalThis as unknown as { process?: { platform?: string } }).process?.platform ?? "";
}

function configureAppIdentity(): void {
  app.setName(appDisplayName);
  if (currentPlatform() === "linux") {
    (app as unknown as { setDesktopName?: (name: string) => void }).setDesktopName?.(linuxDesktopFileName);
  }
  app.setAboutPanelOptions?.({
    applicationName: appDisplayName,
    iconPath: appIconPath(),
  });
  app.dock?.setIcon(appIconPath());

  if (currentPlatform() === "darwin") {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {
        label: appDisplayName,
        submenu: [
          { role: "about" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      // Native macOS editing shortcuts require their application-menu roles.
      // Let AppKit route them to the focused document, including native children.
      { role: "editMenu" },
    ]));
    return;
  }

  Menu.setApplicationMenu(null);
}

function processEnv(): Record<string, string | undefined> {
  return (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
}

function shouldLaunchCleanNvim(): boolean {
  return processEnv().JUSI_NVIM_CLEAN === "1";
}

function shouldRunStartupDemo(): boolean {
  return processEnv().JUSI_STARTUP_DEMO === "1";
}

function shouldLogPerf(): boolean {
  return processEnv().JUSI_PERF === "1";
}

function shouldUseElectronClipboard(): boolean {
  const value = String(processEnv().JUSI_NVIM_CLIPBOARD ?? "").toLowerCase();
  return value === "electron" || value === "1" || value === "true";
}

function clipboardTextFromRegister(lines: unknown, regtype: unknown): string {
  const textLines = Array.isArray(lines)
    ? lines.map((line) => String(line ?? ""))
    : [String(lines ?? "")];
  const text = textLines.join("\n");
  return regtype === "V" ? `${text}\n` : text;
}

function registerFromClipboardText(text: string): { lines: string[]; regtype: string } {
  return {
    lines: text.split(/\r\n|\n|\r/),
    regtype: "v",
  };
}

function nowMs(): number {
  const perf = (globalThis as unknown as { performance?: { now?: () => number } }).performance;
  return perf?.now?.() ?? Date.now();
}

function perfLog(event: Record<string, unknown>): void {
  if (!shouldLogPerf()) {
    return;
  }
  console.log("[perf]", JSON.stringify({
    t: Date.now(),
    ...event,
  }));
}

function stateMetrics(state: RendererSessionState): Record<string, number> {
  return {
    tabs: state.snapshot.tabs.length,
    windows: state.snapshot.windows.length,
    buffers: state.snapshot.buffers.length,
    grids: state.grids.length,
    attachedWebViews: state.attachedWebViews.length,
    screenRows: state.screen.rows,
    screenCols: state.screen.cols,
    gridCells: state.grids.reduce((sum, grid) => sum + (grid.rows * grid.cols), 0),
    highlightCount: Object.keys(state.screen.highlights).length,
    screenRuns: state.screen.runs.reduce((sum, line) => sum + line.length, 0),
    gridRuns: state.grids.reduce(
      (sum, grid) => sum + grid.runs.reduce((gridSum, line) => gridSum + line.length, 0),
      0,
    ),
    messageEntries: state.messages.entries.length,
    cmdlineBlockLines: state.cmdline.blockLines.length,
  };
}

function snapshotForRenderer(snapshot: UiSnapshot, debugUi: boolean): UiSnapshot {
  if (debugUi || snapshot.currentTabId === null) {
    return snapshot;
  }

  const tabs = snapshot.tabs.filter((tab) => tab.id === snapshot.currentTabId);
  const windows = snapshot.windows.filter((window) => window.tabId === snapshot.currentTabId);
  const visibleBufferIds = new Set(windows.map((window) => window.bufferId));
  const buffers = snapshot.buffers.filter((buffer) => visibleBufferIds.has(buffer.id));
  return {
    currentTabId: snapshot.currentTabId,
    tabs,
    windows,
    buffers,
  };
}

function toRendererState(state: EmbeddedSessionState): RendererSessionState {
  const env = processEnv();
  const debugUi = env?.JUSI_DEBUG_UI === "1";
  const snapshot = snapshotForRenderer(state.snapshot, debugUi);
  return {
    debugUi,
    presentationBufferIds: state.presentationBufferIds,
    snapshot,
    attachedWebViews: state.attachedWebViews,
    screen: debugUi ? state.screen : { ...state.screen, cells: undefined },
    grids: debugUi ? state.grids : state.grids.map((grid) => ({ ...grid, cells: undefined })),
    cmdline: state.cmdline,
    popupmenu: state.popupmenu,
    messages: state.messages,
  };
}

function estimateGrid(width: number, height: number): { columns: number; lines: number } {
  const columns = Math.max(20, Math.floor(width / 9));
  const lines = Math.max(8, Math.floor(height / 18) - 1);
  return { columns, lines };
}

function isModifierOnlyKey(key: string): boolean {
  return key === "Shift" || key === "Control" || key === "Alt" || key === "Meta";
}

async function createWindow(): Promise<void> {
  configureAppIdentity();
  const client = await EmbeddedNvimRpcClient.spawn({ clean: shouldLaunchCleanNvim() });
  const session = new EmbeddedNvimSession(client);
  let closing = false;
  const documents = new DocumentRevisions(ticket => session.invalidateWebDocument(ticket));
  const resetBrowserKeys = new WeakMap<object, () => void>();
  const guests = new Map<number, { contents: any; ready: boolean; sessionId?: string; bufferId?: number }>();
  const revokeGuest = (guest: { sessionId?: string; bufferId?: number }) => {
    if (closing || guest.bufferId === undefined || !guest.sessionId) return;
    const current = session.getWebSession(guest.bufferId);
    if (current?.sessionId !== guest.sessionId || current.incarnation === undefined) {
      documents.forget(guest.sessionId);
      return;
    }
    void session.setBrowserTextStatus(current, "idle");
    void documents.advance({ bufferId: guest.bufferId, sessionId: guest.sessionId, incarnation: current.incarnation })
      .catch(error => console.error("[document-invalidation]", error));
  };
  const traceSetting = processEnv().JUSI_BROWSER_TRACE;
  if (traceSetting && traceSetting !== '0') startBrowserTrace(traceSetting === '1' ? join(app.getPath('userData'), 'browser-traces') : resolve(traceSetting));
  if (browserTraceEnabled()) {
    const hashes: Record<string,string> = {};
    for (const [label,path] of [
      ['main',join(currentDir(),'main.js')],['fullscreen',join(currentDir(),'browser-fullscreen.js')],
      ['input',join(currentDir(),'browser-document-events.js')],['clicks',join(currentDir(),'../backends/web/link-clicks.js')],['browser-runtime',join(projectRoot(),'runtime/lua/jusi_neovim/browser.lua')],
    ]) {
      try { hashes[label] = createHash('sha256').update(readFileSync(path)).digest('hex'); }
      catch { hashes[label] = 'unreadable'; }
    }
    traceBrowser('trace.build', {hashes});
  }
  const win = new BrowserWindow({
    title: appDisplayName,
    show: false,
    icon: appIcon(),
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadScript(),
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      nodeIntegration: false,
      webviewTag: true,
      disableHtmlFullscreenWindowResize: true,
    },
  });
  if (browserTraceEnabled()) for (const name of ['focus','blur','enter-full-screen','leave-full-screen','enter-html-full-screen','leave-html-full-screen','close']) {
    win.on(name as any, () => traceBrowser('host.' + name, {window:win.id,fullscreen:win.isFullScreen(),focused:win.isFocused()}));
  }
  win.on("close", () => {
    closing = true;
    for (const guest of guests.values()) if (guest.sessionId) documents.forget(guest.sessionId);
  });
  win.setTitle?.(appDisplayName);
  win.setIcon?.(appIcon());
  (win as unknown as { setMenu?: (menu: null) => void }).setMenu?.(null);

  win.webContents.on("console-message", (event) => {
    console.log("[renderer]", event.message);
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  const profiles = new BrowserProfiles(name => {
    const target = electronSession.fromPartition(`persist:jusi-web-${name}`);
    configureBrowserSession(target, false);
    return target;
  }, browserPermissions, target => webContents.getAllWebContents().some(contents =>
    !contents.isDestroyed() && contents.session === target),
  async (name, action) => {
    const answer = await dialog.showMessageBox(win, {
      type: "warning", title: "Browser profile", buttons: ["Cancel", action === "clear" ? "Clear profile data" : "Revoke grants"],
      defaultId: 0, cancelId: 0, noLink: true,
      message: action === "clear" ? `Clear browser data for profile "${name}"?` : `Revoke session permissions for profile "${name}"?`,
      detail: action === "clear"
        ? "This signs you out and removes this profile's cookies, site storage, caches and session grants. It cannot be undone. Downloaded files, Neovim text and other profiles are not removed."
        : "Camera and microphone grants for this profile will be forgotten. Sites must ask again. Other profiles and OS permissions are unchanged.",
    });
    return !closing && answer.response === 1;
  });
  const profileFeedback = (result: { ok: boolean; message: string }) => client.request("nvim_exec_lua", [
    'local result = ...; require("jusi_web").profile_result(result)', [result],
  ]).catch(error => console.error("[browser-profile]", error));
  const profileOpenBlocked = (name: string) => {
    void profileFeedback({ ok: false, message: `Profile ${name} is busy. Close this new buffer and reopen after the profile operation finishes.` });
  };
  client.onNotification(notification => {
    if (notification.method !== "jusi:browser-profile") return;
    const request = notification.args[0] as { profile?: unknown; action?: unknown };
    void profiles.run(request?.profile as string, request?.action as ProfileAction)
      .then(message => ({ ok: true, message }), error => ({ ok: false, message: String(error) }))
      .then(profileFeedback);
  });
  // Fetch the local shell and renderer module graph while Neovim initializes.
  // The renderer boots only once its host IPC handlers are installed.
  const shellLoad = win.loadFile(rendererHtml(), { query: rendererQuery() });
  // Setup can outlive a failed navigation. Observe failure immediately and
  // propagate it at the startup barrier below.
  void shellLoad.catch(() => {});
  const browserApiInfo = await client.request("nvim_get_api_info", []);
  const browserChannel = Array.isArray(browserApiInfo) ? Number(browserApiInfo[0]) : 0;
  if (!Number.isSafeInteger(browserChannel) || browserChannel <= 0) throw new Error("Browser RPC channel unavailable");
  await client.request("nvim_exec_lua", ["vim.g.jusi_browser_rpc_channel = ...", [browserChannel]]);
  const profileNames = new WeakMap<object, string>();
  const linkControllers = new Map<number, ReturnType<typeof installBrowserLinks>>();
  let nativePopups: NativePopupCoordinator | undefined;
  const popupControllers = new Map<number, { arm(scope: string, documentGrant?: boolean): boolean; resetInput(): void }>();
  const localSessions = new WeakSet<object>();
  win.webContents.on("will-attach-webview", (event, preferences, params) => {
    const partition = typeof params.partition === "string" ? params.partition : "";
    const profileName = partition.startsWith("persist:jusi-web-") ? partition.slice("persist:jusi-web-".length) : "";
    if (profileName && profiles.isBusy(profileName)) { event.preventDefault(); profileOpenBlocked(profileName); return; }
    const local = /^jusi-local-[a-f0-9-]+$/.test(partition);
    if ((!local && !/^persist:jusi-web-[a-zA-Z0-9_-]{1,64}$/.test(partition) && !/^jusi-private-[a-f0-9-]+$/.test(partition)) || !isGuestNavigationAllowed(params.src, local)) {
      event.preventDefault();
      return;
    }
    delete preferences.preload;
    preferences.nodeIntegration = false;
    preferences.nodeIntegrationInSubFrames = false;
    preferences.nodeIntegrationInWorker = false;
    preferences.contextIsolation = true;
    preferences.sandbox = true;
    preferences.webSecurity = true;
    preferences.allowRunningInsecureContent = false;
    preferences.webviewTag = false;
    preferences.disableHtmlFullscreenWindowResize = true;
    const guestSession = electronSession.fromPartition(partition);
    if (profileName) profileNames.set(guestSession, profileName);
    configureBrowserSession(guestSession, local);
    if (local) {
      localSessions.add(guestSession);
      try { registerDirectoryProtocol(guestSession.protocol as ProtocolRegistry, localRootForUrl(params.src)); }
      catch { event.preventDefault(); }
    }
  });
  win.webContents.on("did-attach-webview", (_event, contents) => {
    const profileName = profileNames.get(contents.session);
    if (profileName && profiles.isBusy(profileName)) { contents.close(); profileOpenBlocked(profileName); return; }
    secureGuest(contents, localSessions.has(contents.session));
    const identity = () => {
      const guest = guests.get(contents.id);
      const current = guest?.bufferId === undefined ? undefined : session.getWebSession(guest.bufferId);
      return current && typeof current.incarnation === "number" && current.sessionId === guest?.sessionId
        ? { bufferId: current.bufferId, sessionId: current.sessionId, incarnation: current.incarnation } : undefined;
    };
    const local = localSessions.has(contents.session);
    const events = browserEvents.install(contents, identity, local);
    popupControllers.set(contents.id, { resetInput: events.resetInput, arm: nativePopups!.installOpener(contents, identity, local, events.trace) });
    contents.once("destroyed", () => popupControllers.delete(contents.id));
    const guest = { contents, ready: false } as { contents: any; ready: boolean; sessionId?: string; bufferId?: number };
    guests.set(contents.id, guest);
    observeBrowserLocation(contents, () => {
      const current = guest.bufferId === undefined ? undefined : session.getWebSession(guest.bufferId);
      return current?.sessionId === guest.sessionId && current?.incarnation !== undefined
        ? {bufferId: current.bufferId, sessionId: current.sessionId, incarnation: current.incarnation} : undefined;
    }, (owner, url) => session.setBrowserLocation(owner, url), error => console.error('[browser-location]', error));
    contents.on("before-mouse-event", (_event: unknown, mouse: { type: string; button?: string; x: number; y: number }) => {
      if (!guest.ready || mouse.type !== "mouseDown" || mouse.button !== "left" || guest.bufferId === undefined) return;
      const current = session.getWebSession(guest.bufferId);
      const snapshot = session.getSnapshot();
      const window = snapshot.windows.find(window => window.id === current?.attachedWindowId
        && window.bufferId === guest.bufferId && window.tabId === snapshot.currentTabId);
      if (!current || current.sessionId !== guest.sessionId || !window) return;
      if (pendingStateTimer) clearTimeout(pendingStateTimer);
      flushPendingState();
      win.webContents.send("jusi:browser-pointer", { bufferId: current.bufferId, sessionId: current.sessionId,
        incarnation: current.incarnation, windowId: window.id, documentRevision: current.mirror?.version,
        x: mouse.x, y: mouse.y });
    });
    linkControllers.set(contents.id, installBrowserLinks(contents, win, localSessions.has(contents.session), !profileName,
      () => browserEvents.activeTarget(identity()), token => win.webContents.send("jusi:browser-link-selected", { guestId: contents.id, token })));
    contents.once("destroyed", () => linkControllers.delete(contents.id));
    contents.on("did-start-navigation", (_event: unknown, _url: string, inPlace: boolean, mainFrame: boolean) => {
      if (!mainFrame || inPlace) return;
      guest.ready = false;
      revokeGuest(guest);
    });
    contents.on("dom-ready", () => { guest.ready = true; });
    contents.on("render-process-gone", () => { guest.ready = false; revokeGuest(guest); });
    contents.on("destroyed", () => { guest.ready = false; revokeGuest(guest); guests.delete(contents.id); });
  });
  win.webContents.on("before-input-event", (event, input) => {
    if (isFullscreenToggleInput(input)) {
      event.preventDefault();
      toggleFullscreen(win, input.isAutoRepeat);
      return;
    }

    const zoomAction = appZoomActionForInput(input);
    if (zoomAction) {
      event.preventDefault();
      win.webContents.send("jusi:app-zoom", { action: zoomAction });
      return;
    }

    if (input.type === "keyDown" && isTabKey(input.key)) {
      event.preventDefault();
      void session.input(input.shift ? "<S-Tab>" : "<Tab>");
      return;
    }

    if (isCtrlAInput(input)) {
      event.preventDefault();
      void session.input("<C-A>");
      return;
    }

    if (shouldBlockShellAccelerator(input)) {
      event.preventDefault();
    }
  });

  session.start();
  const nativeViewport = new NativeViewportExchange(() => nativePopups?.park());
  let lastPublishedState: RendererSessionState | null = null;
  let pendingState: EmbeddedSessionState | null = null;
  let pendingStateTimer: ReturnType<typeof setTimeout> | null = null;
  const flushPendingState = () => {
    pendingStateTimer = null;
    const destroyed = (win as unknown as { isDestroyed?: () => boolean }).isDestroyed?.() ?? false;
    if (!pendingState || destroyed) {
      return;
    }
    const state = pendingState;
    pendingState = null;
    const startedAt = nowMs();
    const rendererState = { ...toRendererState(state), nativeLayoutGeneration: nativeViewport.generation };
    lastPublishedState = rendererState;
    const serializedBytes = shouldLogPerf() ? Buffer.byteLength(JSON.stringify(rendererState), "utf8") : 0;
    const serializeMs = nowMs() - startedAt;
    win.webContents.send("jusi:state", rendererState);
    perfLog({
      kind: "state",
      serializeMs: Number(serializeMs.toFixed(2)),
      bytes: serializedBytes,
      ...stateMetrics(rendererState),
    });
  };
  let tracedLayout = '';
  let nativeLayout = '';
  session.onStateChanged((state) => {
    if (browserTraceEnabled()) {
      const snapshot = session.getSnapshot();
      const layout = {tab:snapshot.currentTabId,tabs:snapshot.tabs.map(t=>({id:t.id,currentWindow:t.currentWindowId})),
        windows:snapshot.windows.map(w=>({id:w.id,tab:w.tabId,buffer:w.bufferId,grid:w.gridId}))};
      const serialized = JSON.stringify(layout);
      if (serialized !== tracedLayout) { tracedLayout = serialized; traceBrowser('layout', layout); }
    }
    const layoutKey = nativeLayoutKey(state, bufferId => session.getWebSession(bufferId));
    if (layoutKey !== nativeLayout) { nativeLayout = layoutKey; nativeViewport.invalidate(); }
    for (const guest of guests.values()) {
      if (guest.bufferId === undefined || !guest.sessionId) continue;
      if (session.getWebSession(guest.bufferId)?.sessionId !== guest.sessionId) {
        documents.forget(guest.sessionId);
        guest.ready = false;
        if (!guest.contents.isDestroyed()) guest.contents.close();
      }
    }
    pendingState = state;
    if (pendingStateTimer) {
      return;
    }
    pendingStateTimer = setTimeout(flushPendingState, 0);
  });
  session.onWebScroll((event) => {
    const destroyed = (win as unknown as { isDestroyed?: () => boolean }).isDestroyed?.() ?? false;
    if (destroyed) {
      return;
    }
    const current = session.getWebSession(event.bufferId);
    if (!current) return;
    const cursor = session.getSnapshot().windows.find(window => window.id === event.windowId
      && window.bufferId === event.bufferId)?.cursor ?? null;
    const target = { ...event, sessionId: current.sessionId, incarnation: current.incarnation,
      cursor, documentRevision: current.mirror?.version };
    if (nativePopups?.interact(target, { kind: 'scroll', lines: event.lines })) return;
    if (pendingStateTimer) clearTimeout(pendingStateTimer);
    flushPendingState();
    win.webContents.send("jusi:web-scroll", target);
  });
  session.onWebOpenLink((event) => {
    const destroyed = (win as unknown as { isDestroyed?: () => boolean }).isDestroyed?.() ?? false;
    if (destroyed) {
      return;
    }
    const current = session.getWebSession(event.bufferId);
    if (!current) return;
    const cursor = session.getSnapshot().windows.find(window => window.id === event.windowId
      && window.bufferId === event.bufferId)?.cursor ?? null;
    const target = { ...event, sessionId: current.sessionId, incarnation: current.incarnation,
      cursor, documentRevision: current.mirror?.version };
    if (nativePopups?.interact(target, { kind: 'link' })) return;
    if (pendingStateTimer) clearTimeout(pendingStateTimer);
    flushPendingState();
    win.webContents.send("jusi:web-open-link", target);
  });
  session.onWebRegion((event) => {
    const destroyed = (win as unknown as { isDestroyed?: () => boolean }).isDestroyed?.() ?? false;
    if (destroyed) {
      return;
    }
    const current = session.getWebSession(event.bufferId);
    if (!current) return;
    const cursor = session.getSnapshot().windows.find(window => window.id === event.windowId
      && window.bufferId === event.bufferId)?.cursor ?? null;
    const target = { ...event, sessionId: current.sessionId, incarnation: current.incarnation,
      cursor, documentRevision: current.mirror?.version };
    if (nativePopups?.interact(target, { kind: 'region', direction: event.direction })) return;
    if (pendingStateTimer) clearTimeout(pendingStateTimer);
    flushPendingState();
    win.webContents.send("jusi:web-region", target);
  });
  session.onWebEnterMode((event) => {
    const destroyed = (win as unknown as { isDestroyed?: () => boolean }).isDestroyed?.() ?? false;
    if (destroyed) {
      return;
    }
    if (nativePopups?.enter(event.bufferId, event.windowId)) return;
    if (pendingStateTimer) clearTimeout(pendingStateTimer);
    flushPendingState();
    win.webContents.send("jusi:web-enter-mode", event);
  });
  let neovimExited = false;
  session.onExit(() => {
    closing = true;
    for (const guest of guests.values()) if (guest.sessionId) documents.forget(guest.sessionId);
    neovimExited = true;
    const destroyed = (win as unknown as { isDestroyed?: () => boolean }).isDestroyed?.() ?? false;
    if (!destroyed) {
      win.close();
    }
  });
  if (shouldUseElectronClipboard()) {
    session.onClipboardCopy((event) => {
      clipboard.writeText(clipboardTextFromRegister(event.lines, event.regtype));
    });
    client.onRequest?.((request) => {
      if (request.method !== "jusi:clipboard-paste") {
        return undefined;
      }
      return clipboard.readText().then(registerFromClipboardText);
    });
  }

  const [contentWidth, contentHeight] = win.getContentSize();
  const grid = estimateGrid(contentWidth, contentHeight);
  await session.attachUi(grid.columns, grid.lines);
  if (shouldUseElectronClipboard()) {
    await session.installClipboardProvider(runtimePluginScript());
  }
  const pendingWebviewWindowCommands = new WeakMap<object, ReturnType<typeof setTimeout>>();
  const routedChildWebContents = new WeakSet<object>();
  const isHostedByWindow = (contents: any): boolean => {
    let host = contents.hostWebContents;
    while (host) {
      if (host === win.webContents) {
        return true;
      }
      host = host.hostWebContents;
    }
    return false;
  };
  const webContentsCreatedHandler = (_event: any, contents: any) => {
    if (!isHostedByWindow(contents) || routedChildWebContents.has(contents)) {
      return;
    }
    routedChildWebContents.add(contents);

    const leaveWebMode = () => {
      browserEvents.fullscreen.exit(contents);
      win.webContents.focus();
      win.webContents.send("jusi:leave-web-mode");
    };

    const modeKeys = new BrowserModeKeys();
    const resetKeys = () => {
      modeKeys.reset();
      popupControllers.get(contents.id)?.resetInput();
      const timer = pendingWebviewWindowCommands.get(contents);
      if (timer) clearTimeout(timer);
      pendingWebviewWindowCommands.delete(contents);
    };
    resetBrowserKeys.set(contents, resetKeys);
    resetBrowserInputOnFocusBoundary(contents, win, resetKeys);
    contents.on('did-start-navigation', (_event: unknown, _url: string, inPlace: boolean, main: boolean) => {
      if (main && !inPlace) resetKeys();
    });

    contents.on("before-input-event", (event: any, input: any) => {
      if (input.isComposing) { resetKeys(); return; }
      const modeAction = modeKeys.accept(input);
      if (modeAction) {
        event.preventDefault();
        if (modeAction === 'close') void session.command('JusiClose').finally(leaveWebMode);
        else if (modeAction === 'text') leaveWebMode();
        return;
      }

      if (isFullscreenToggleInput(input)) {
        event.preventDefault();
        toggleFullscreen(win, input.isAutoRepeat);
        return;
      }

      const command = browserCommandForInput(input, currentPlatform());
      if (command && dispatchBrowserCommand(contents, command, () => win.webContents.send('jusi:web-zoomed'), url => { void session.setRegister('*',url); })) {
        event.preventDefault();
        return;
      }

      if (shouldBlockShellAccelerator(input)) {
        event.preventDefault();
        return;
      }

      if (input.type !== "keyDown" || input.meta || input.alt) {
        return;
      }

      const key = typeof input.key === "string" ? input.key : "";

      if (input.control && isPhysicalKeyInput(input, "KeyJ")) {
        event.preventDefault();
        win.webContents.send("jusi:web-open-active-link");
        return;
      }

      if (input.control && isPhysicalKeyInput(input, "KeyL")) {
        event.preventDefault();
        const url = typeof contents.getURL === "function" ? contents.getURL() : "";
        void session.setRegister("*", url);
        return;
      }

      const pendingTimeout = pendingWebviewWindowCommands.get(contents);
      if (pendingTimeout && isModifierOnlyKey(key)) {
        return;
      }
      if (pendingTimeout) {
        clearTimeout(pendingTimeout);
        pendingWebviewWindowCommands.delete(contents);
      }

      if (input.control && isPhysicalKeyInput(input, "KeyW")) {
        if (pendingTimeout) {
          event.preventDefault();
          void session.command("wincmd w").finally(leaveWebMode);
          return;
        }
        event.preventDefault();
        const timeout = setTimeout(() => {
          pendingWebviewWindowCommands.delete(contents);
        }, 1200);
        pendingWebviewWindowCommands.set(contents, timeout);
        return;
      }

      if (pendingTimeout && isWindowCommandFollower(key)) {
        event.preventDefault();
        void session.command(`wincmd ${key}`).finally(leaveWebMode);
        return;
      }
    });
  };
  app.on("web-contents-created", webContentsCreatedHandler);
  if (shouldRunStartupDemo()) {
    const startupCommands = [
      "set laststatus=2 noruler",
      "enew",
      "setlocal buftype=nofile bufhidden=hide noswapfile",
      "call setline(1, ['jusi-neovim', '', 'Left split is a normal Neovim buffer.', 'Right split is a web buffer.', '', 'Keys currently go to Neovim.', 'Resize the window to see grid + web bounds stay in sync.'])",
      "vsplit",
      "wincmd l",
      "enew",
      "setlocal buftype=nofile bufhidden=hide noswapfile",
      "JusiWebBuffer https://example.com",
      "wincmd h",
      "normal! gg",
    ];
    for (const command of startupCommands) {
      try {
        await session.command(command);
      } catch (error) {
        console.error("[startup-command-failed]", command, error);
        throw error;
      }
    }
  }

  const invalidateViewport = (invalidate = true) => {
    if (invalidate) nativeViewport.invalidate();
    if (lastPublishedState && !pendingState && !win.webContents.isDestroyed()) {
      lastPublishedState = { ...lastPublishedState, nativeLayoutGeneration: nativeViewport.generation };
      win.webContents.send("jusi:state", lastPublishedState);
    }
  };
  const feedback = (message: string) => { void profileFeedback({ ok: true, message }); };
  const browserEvents = new BrowserDocumentEvents(win, client, session, new BrowserFullscreen(win, invalidateViewport), feedback);
  {
    nativePopups = new NativePopupCoordinator(win, client, session, invalidateViewport,
      browserEvents, feedback, processEnv().JUSI_DEBUG_UI === "1");
    await nativePopups.start();
    win.on("close", () => { browserEvents.fullscreen.dispose(); nativePopups?.dispose(); });
  }
  client.onRequest(request => {
    if (request.method !== 'jusi:mark-hints') return undefined;
    const [ticket, win, token, letters, choice] = request.args as [DocumentTicket, number, string, string, string?];
    const currentMirror = () => {
      const snapshot = session.getSnapshot();
      const view = session.getWebSession(ticket.bufferId);
      if (snapshot.tabs.find(tab => tab.id === snapshot.currentTabId)?.currentWindowId === win
        && view?.attachedWindowId === win && view.sessionId === ticket.sessionId
        && view.incarnation === ticket.incarnation && view.mirror?.version === ticket.revision) return view.mirror;
    };
    const mirror = currentMirror();
    if (!mirror || !/^[a-z]{0,26}$/.test(letters)) return false;
    const contents = nativePopups?.contentsFor(ticket.bufferId) ?? [...guests.values()].find(g =>
      g.bufferId === ticket.bufferId && g.sessionId === ticket.sessionId)?.contents;
    if (!contents || contents.isDestroyed()) return false;
    // Let Neovim continue even if a page's renderer stops responding.
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), 700); });
    return Promise.race([timeout, contents.executeJavaScript(markHintsSource(token, letters, choice))])
      .then(value => {
        if (currentMirror() !== mirror) return false;
        if (choice === undefined) return typeof value === 'string' && value.length && letters.startsWith(value) ? value : false;
        return typeof value === 'number' ? browserPosition(mirror, value) : false;
      }).catch(() => false).finally(() => clearTimeout(timer));
  });
  client.onNotification(notification => {
    if (notification.method !== 'jusi:browser-command') return;
    const request = notification.args[0] as {bufferId: number;windowId: number;incarnation: number;action: string};
    const current = request && session.getWebSession(request.bufferId);
    const snapshot = session.getSnapshot();
    if (!current || current.providerId !== 'web' || current.incarnation !== request.incarnation
      || !snapshot.windows.some(w => w.id === request.windowId && w.bufferId === request.bufferId && w.tabId === snapshot.currentTabId)) return;
    const guest = [...guests.values()].find(g => g.bufferId === current.bufferId && g.sessionId === current.sessionId);
    const contents = nativePopups?.contentsFor(current.bufferId) ?? guest?.contents;
    if (!contents || contents.isDestroyed()) return;
    const target = {bufferId:current.bufferId,windowId:request.windowId,sessionId:current.sessionId,incarnation:current.incarnation};
    traceBrowser('browser.command', {contents:contents.id,buffer:current.bufferId,window:request.windowId,incarnation:current.incarnation,action:request.action,autoRefresh:current.autoRefresh});
    if (request.action === 'allow-media') {
      const url = contents.getURL();
      if (!url.startsWith('https://')) {
        feedback('Open the site directly in an HTTPS browser buffer to allow microphone and camera access.');
        return;
      }
      void browserPermissions(contents.session).request(contents, 'media', {
        requestingUrl: url, isMainFrame: true, mediaTypes: ['audio', 'video'],
      }).then(allowed => feedback(allowed
        ? 'Microphone and camera allowed for ' + new URL(url).origin + ' this session. Reload the page if needed.'
        : 'Microphone and camera permission was not granted.'));
      return;
    }
    if (request.action === 'debug-mark') {
      void browserTraceMark({contents:contents.id,buffer:current.bufferId,window:request.windowId,tab:snapshot.currentTabId,
        fullscreen:win.isFullScreen(),focused:contents.isFocused(),url:traceBrowserUrl(contents.getURL()),autoRefresh:current.autoRefresh})
        .then(directory => profileFeedback({ok:!!directory,message:directory ? `Browser debug marker saved: ${directory}` : 'Browser tracing is off or unavailable. Restart with JUSI_BROWSER_TRACE=1.'}));
      return;
    }
    if (request.action === 'devtools') {
      const ok = dispatchBrowserCommand(contents, 'devtools', () => {});
      if (!ok) void profileFeedback({ok:false,message:'DevTools unavailable for this browser document.'});
      return;
    }
    if (request.action === 'copy-url') { void session.setRegister('*', contents.getURL()); return; }
    if (request.action === 'new-tab') {
      const revision=current.mirror?.version;
      const index=browserIndex(current.mirror,snapshot.windows.find(w=>w.id===request.windowId)?.cursor);
      if (index === null) return;
      void contents.executeJavaScript(mirrorLinkTargetSource(index)).then(async (link: {href?: unknown} | null) => {
        if (!link || !browserLinkUrl(link.href) || session.getWebSession(current.bufferId) !== current || current.mirror?.version !== revision
          || !session.getSnapshot().windows.some(w => w.id === request.windowId && w.bufferId === current.bufferId && w.tabId === session.getSnapshot().currentTabId)) return;
        traceBrowser('link.dispatch', {route:'text-command',contents:contents.id,buffer:current.bufferId,url:traceBrowserUrl(link.href)});
        const opened = await client.request('nvim_exec_lua', ['return require("jusi_web").open_link_tab(...)', [{bufferId:current.bufferId,incarnation:current.incarnation,windowId:request.windowId,tabId:snapshot.currentTabId,url:link.href}]]);
        traceBrowser('link.result', {route:'text-command',contents:contents.id,opened});
        if (!opened) return;
        win.webContents.focus(); win.webContents.send('jusi:leave-web-mode');
      }).catch((error: unknown)=>profileFeedback({ok:false,message:String(error)}));
      return;
    }
    if (request.action === 'pause' || request.action === 'resume') session.setBrowserAutoRefresh(current.bufferId, request.action === 'resume');
    if (request.action === 'allow-popup' || request.action === 'allow-page-popups') {
      const documentGrant = request.action === 'allow-page-popups';
      const ok = current.nativeChild ? nativePopups?.browserAction(current.bufferId, request.action)
        : popupControllers.get(contents.id)?.arm(current.privateBrowsing ? 'Private' : `Profile ${current.profile ?? 'default'}`, documentGrant);
      const message = documentGrant ? 'Popups allowed while this page is focused until reload or navigation.'
        : 'One popup allowed for 15 seconds. Repeat the page action.';
      void profileFeedback({ok: !!ok, message: ok ? message : 'Popup unavailable.'});
      return;
    }
    if (current.nativeChild) nativePopups?.browserAction(current.bufferId, request.action);
    else if (request.action === 'refresh') win.webContents.send('jusi:browser-refresh',target);
  });
  ipcMain.handle('jusi:browser-text-status', async (event: unknown, bufferId: number, sessionId: string, guestId: number, status: string) => {
    assertShell(event);
    if (!['ready','idle','building','disabled','error','limited'].includes(status)) return;
    const guest=guests.get(guestId), current=session.getWebSession(bufferId);
    if (!current || current.sessionId!==sessionId || guest?.bufferId!==bufferId || guest.sessionId!==sessionId) return;
    traceBrowser('text.status', {contents:guestId,buffer:bufferId,status,transport:'webview'});
    await session.setBrowserTextStatus(current,status);
  });
  win.on("resize", () => invalidateViewport());
  win.webContents.on("did-start-loading", () => nativeViewport.invalidate());
  win.webContents.on("render-process-gone", () => nativeViewport.invalidate());

  const assertShell = (event: unknown) => {
    if (!isTrustedShellSender(event, win.webContents)) throw new Error("Untrusted IPC sender");
  };
  ipcMain.handle("jusi:ack-native-popup", (event: unknown, token: string, generation: number) => {
    assertShell(event);
    return generation === nativeViewport.generation && !!nativeViewport.viewport
      && (nativePopups?.acknowledge(token, generation) ?? false);
  });
  ipcMain.handle("jusi:retry-native-text", (event: unknown, token: string) => {
    assertShell(event); return nativePopups?.retryText(token) ?? false;
  });
  ipcMain.handle("jusi:close-native-popup", (event: unknown, token: string) => {
    assertShell(event); return nativePopups?.close(token) ?? false;
  });
  ipcMain.handle("jusi:native-viewport", (event: unknown, report: unknown) => {
    assertShell(event);
    const [width, height] = win.getContentSize();
    const accepted = nativeViewport.accept(report, win.webContents.getZoomFactor(), width, height);
    if (accepted) nativePopups?.place(nativeViewport.viewport, nativeViewport.generation);
    return accepted;
  });
  ipcMain.handle("jusi:invalidate-native-viewport", (event: unknown) => {
    assertShell(event); invalidateViewport();
  });
  ipcMain.handle("jusi:get-initial-state", async (event: unknown) => {
    assertShell(event);
    return lastPublishedState ?? { ...toRendererState(session.getPresentationState()), nativeLayoutGeneration: nativeViewport.generation };
  });

  ipcMain.handle("jusi:read-browser-state", (event: unknown, windowId: number, ticket: DocumentTicket) => {
    assertShell(event);
    if (!ticket || !documents.isCurrent(ticket)) return null;
    return session.getInteractionView(windowId, ticket) ?? null;
  });

  ipcMain.handle("jusi:mouse", async (event: unknown, input: import("../core/mouse.js").NvimMouseInput) => {
    assertShell(event);
    return await session.mouseInput(input);
  });

  ipcMain.handle("jusi:input", async (_event: unknown, keys: string) => {
    assertShell(_event);
    await session.input(keys);
  });

  ipcMain.handle("jusi:window-input", async (_event: unknown, keys: string) => {
    assertShell(_event);
    await session.windowInput(keys);
  });

  ipcMain.handle("jusi:resize", async (_event: unknown, columns: number, lines: number) => {
    assertShell(_event);
    await session.resize(columns, lines);
  });

  ipcMain.handle("jusi:command", async (_event: unknown, command: string) => {
    assertShell(_event);
    await session.command(command);
  });

  ipcMain.handle('jusi:reset-browser-input', (event: unknown, guestId: number) => {
    assertShell(event);
    const guest = guests.get(guestId);
    if (guest && !guest.contents.isDestroyed()) resetBrowserKeys.get(guest.contents)?.();
  });

  ipcMain.handle("jusi:presentation-mode", async (event: unknown, bufferId: number, sessionId: string, windowId: number, mode: "rich" | "text") => {
    assertShell(event);
    if (mode !== "rich" && mode !== "text") return false;
    const view = session.getAttachedWebViews().find(view => view.bufferId === bufferId && view.sessionId === sessionId && view.windowId === windowId);
    const current = session.getWebSession(bufferId);
    if (!view || current?.sessionId !== sessionId || current.incarnation === undefined) return false;
    return await session.setPresentationMode(bufferId, current.incarnation, windowId, mode);
  });

  ipcMain.handle("jusi:focus-window", async (_event: unknown, windowId: number) => {
    assertShell(_event);
    await session.command(`call win_gotoid(${Number(windowId)})`);
  });

  ipcMain.handle("jusi:set-cursor", async (_event: unknown, windowId: number, row: number, col: number, ticket: DocumentTicket) => {
    assertShell(_event);
    if (!ticket || !Number.isSafeInteger(ticket.revision)) return;
    const current = session.getWebSession(ticket.bufferId);
    if (!current || current.sessionId !== ticket.sessionId || current.incarnation !== ticket.incarnation
      || current.mirror?.version !== ticket.revision || current.attachedWindowId !== windowId) return;
    await session.setCursor(Number(windowId), Number(row), Number(col), ticket);
  });

  ipcMain.handle("jusi:open-browser-link", async (event: unknown, guestId: number, token: string, bufferId: number, sessionId: string) => {
    assertShell(event);
    const selection = linkControllers.get(guestId)?.consume(token);
    const url = selection?.url;
    const guest = guests.get(guestId);
    const current = session.getWebSession(bufferId);
    if (!selection || !url || selection.target.bufferId !== bufferId || selection.target.sessionId !== sessionId || !guest?.ready || guest.contents.isDestroyed() || !current || current.providerId !== "web"
      || current.sessionId !== sessionId || current.incarnation === undefined
      || current.surface.uri.startsWith("jusi-directory:")
      || (guest.sessionId && guest.sessionId !== sessionId)
      || guest.contents.session !== electronSession.fromPartition(browserPartition(current.surface.uri,
        bufferId, current.profile, current.sessionId, current.privateBrowsing))) return false;
    try {
      traceBrowser('link.dispatch', {route:'context-menu',contents:guestId,buffer:bufferId,url:traceBrowserUrl(url)});
      const opened = await client.request("nvim_exec_lua", [
        'local request = ...; return require("jusi_web").open_link_tab(request)',
        [{ ...selection.target, url }],
      ]);
      traceBrowser('link.result', {route:'context-menu',contents:guestId,opened});
      if (!opened) throw new Error("Source presentation changed");
      win.focus();
      win.webContents.send("jusi:leave-web-mode");
      return true;
    } catch (error) {
      void profileFeedback({ ok: false, message: `Could not open link: ${String(error)}` });
      return false;
    }
  });

  ipcMain.handle("jusi:arm-popup", (event: unknown, bufferId: number, sessionId: string, guestId: number) => {
    assertShell(event);
    const current = session.getWebSession(bufferId);
    const guest = guests.get(guestId);
    if (!current || current.providerId !== "web" || current.sessionId !== sessionId || !guest?.ready || guest.contents.isDestroyed()
      || current.surface.uri.startsWith("jusi-directory:")) return false;
    const expected = electronSession.fromPartition(browserPartition(current.surface.uri, bufferId,
      current.profile, current.sessionId, current.privateBrowsing));
    if (guest.contents.session !== expected) return false;
    if (guest.sessionId && guest.sessionId !== sessionId) return false;
    const armed = popupControllers.get(guestId)?.arm(current.privateBrowsing ? "Private" : `Profile ${current.profile ?? "default"}`) ?? false;
    if (armed) void profileFeedback({ ok: true, message: "One native popup allowed for 15 seconds. Repeat the page action." });
    return armed;
  });
  ipcMain.handle("jusi:invalidate-document", async (event: unknown, bufferId: number, sessionId: string, guestId: number) => {
    assertShell(event);
    const guest = guests.get(guestId);
    const current = session.getWebSession(bufferId);
    if (!guest?.ready || guest.contents.isDestroyed() || guest.sessionId !== sessionId || guest.bufferId !== bufferId
      || current?.sessionId !== sessionId || current.incarnation === undefined
      || current.textSource === "worker" || current.textLayer === "off") return false;
    return !!await documents.advance({ bufferId, sessionId, incarnation: current.incarnation });
  });

  ipcMain.handle("jusi:acquire-document", async (event: unknown, bufferId: number, sessionId: string, guestId: number) => {
    assertShell(event);
    const guest = guests.get(guestId);
    const current = session.getWebSession(bufferId);
    if (!guest || !guest.ready || guest.contents.isDestroyed() || current?.sessionId !== sessionId
      || current.incarnation === undefined) return null;
    if (guest.sessionId && guest.sessionId !== sessionId) return null;
    if ([...guests.values()].some(other => other !== guest && other.sessionId === sessionId)) return null;
    if (!guest.sessionId) {
      guest.sessionId = sessionId;
      guest.bufferId = bufferId;
      void session.setBrowserLocation({bufferId, sessionId, incarnation: current.incarnation}, guest.contents.getURL())
        .catch(error => console.error('[browser-location]', error));
      return documents.advance({ bufferId, sessionId, incarnation: current.incarnation });
    }
    return documents.current(sessionId);
  });

  ipcMain.handle("jusi:build-worker-text", async (event: unknown, ticket: DocumentTicket) => {
    assertShell(event);
    if (!ticket || !documents.isCurrent(ticket) || session.getWebSession(ticket.bufferId)?.textLayer === "off") return false;
    const guest = [...guests.values()].find(value => value.sessionId === ticket.sessionId);
    if (!guest || guest.contents.isDestroyed() || guest.contents.getURL() !== session.getWebSession(ticket.bufferId)?.url) {
      throw new Error("Worker source does not match the displayed page");
    }
    const document = await session.extractWorkerText(ticket);
    if (!documents.isCurrent(ticket)) return false;
    const accepted = await documents.commit(ticket, () => session.writeWorkerText(ticket, document));
    if (accepted) session.publishWorkerText(ticket, document);
    return accepted;
  });

  ipcMain.handle("jusi:update-web-mirror", async (event: unknown, ticket: DocumentTicket, mirror: MirrorDocument) => {
    assertShell(event);
    if (!ticket || !documents.isCurrent(ticket) || session.getWebSession(ticket.bufferId)?.textSource === "worker") return false;
    const accepted = await documents.commit(ticket, () => session.writeWebMirror(ticket, mirror));
    if (accepted) session.publishWebMirror(ticket, mirror);
    return accepted;
  });

  ipcMain.on("jusi:perf", (_event: unknown, event: unknown) => {
    if (!isTrustedShellSender(_event, win.webContents)) return;
    if (!shouldLogPerf() || typeof event !== "object" || event === null) {
      return;
    }
    perfLog(event as Record<string, unknown>);
  });

  win.on("closed", async () => {
    ipcMain.removeHandler("jusi:get-initial-state");
    ipcMain.removeHandler("jusi:read-browser-state");
    ipcMain.removeHandler("jusi:native-viewport");
    ipcMain.removeHandler("jusi:ack-native-popup");
    ipcMain.removeHandler("jusi:close-native-popup");
    ipcMain.removeHandler("jusi:retry-native-text");
    ipcMain.removeHandler("jusi:invalidate-native-viewport");
    ipcMain.removeHandler("jusi:mouse");
    ipcMain.removeHandler("jusi:input");
    ipcMain.removeHandler("jusi:window-input");
    ipcMain.removeHandler("jusi:resize");
    ipcMain.removeHandler("jusi:command");
    ipcMain.removeHandler("jusi:focus-window");
    ipcMain.removeHandler("jusi:presentation-mode");
    ipcMain.removeHandler("jusi:reset-browser-input");
    ipcMain.removeHandler("jusi:set-cursor");
    ipcMain.removeHandler("jusi:browser-text-status");
    ipcMain.removeHandler("jusi:update-web-mirror");
    ipcMain.removeHandler("jusi:build-worker-text");
    ipcMain.removeHandler("jusi:acquire-document");
    ipcMain.removeHandler("jusi:invalidate-document");
    ipcMain.removeHandler("jusi:open-browser-link");
    ipcMain.removeHandler("jusi:arm-popup");
    ipcMain.removeAllListeners("jusi:perf");
    if (!neovimExited) {
      await session.dispose();
    }
  });

  await shellLoad;
  if (closing || win.isDestroyed()) return;
  await win.webContents.executeJavaScript(`(async () => {
    const renderer = await import(document.getElementById("renderer-module").href);
    await renderer.boot();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  })()`);
  if (closing || win.isDestroyed()) return;
  win.show();
  const diagnostics = await win.webContents.executeJavaScript(`
    ({
      hasJusi: typeof window.jusi !== "undefined",
      hasScreen: !!document.getElementById("terminal-screen"),
      statusTab: document.getElementById("status-tab")?.textContent ?? null,
      statusBuffers: document.getElementById("status-buffers")?.textContent ?? null,
      stateDumpLength: document.getElementById("state-dump")?.textContent?.length ?? 0,
      webViewCount: document.querySelectorAll("webview").length
    })
  `);
  console.log("[renderer-diagnostics]", JSON.stringify(diagnostics));
}

app.whenReady().then(async () => {
  try {
    await createWindow();
  } catch (error) {
    console.error("[create-window-failed]", error);
    dialog.showErrorBox("Jusi Neovim could not start", error instanceof Error ? error.message : String(error));
    app.exit(1);
    return;
  }
  app.on("activate", () => {
    // noop for now
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
