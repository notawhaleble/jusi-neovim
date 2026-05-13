import { app, BrowserWindow, ipcMain, Menu } from "electron";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PromisedNvimRpcClient } from "../bridge/promised-client.js";
import { EmbeddedNvimSession, EmbeddedSessionState } from "../bridge/rpc-session.js";
import { MirrorDocument } from "../core/types.js";
import { RendererSessionState } from "../renderer/contracts.js";
import { isTabKey, isWindowCommandFollower, shouldBlockShellAccelerator } from "./key-routing.js";

const appDisplayName = "Jusi Neovim";
const appLogoFile = "jusi-neovim-logo.png";

app.setName(appDisplayName);

function currentDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

function projectRoot(): string {
  return resolve(currentDir(), "..", "..");
}

function rendererHtml(): string {
  return join(projectRoot(), "src", "renderer", "index.html");
}

function preloadScript(): string {
  return join(projectRoot(), "src", "electron", "preload.cjs");
}

function appIcon(): string {
  return join(projectRoot(), "assets", appLogoFile);
}

function currentPlatform(): string {
  return (globalThis as unknown as { process?: { platform?: string } }).process?.platform ?? "";
}

function configureAppIdentity(): void {
  app.setName(appDisplayName);
  app.setAboutPanelOptions?.({
    applicationName: appDisplayName,
    iconPath: appIcon(),
  });
  app.dock?.setIcon(appIcon());

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

function toRendererState(state: EmbeddedSessionState): RendererSessionState {
  const env = processEnv();
  const debugUi = env?.JUSI_DEBUG_UI === "1";
  return {
    debugUi,
    snapshot: state.snapshot,
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

function isFullscreenToggleInput(input: { type?: string; key?: string; control?: boolean; meta?: boolean }): boolean {
  if (input.type !== "keyDown") {
    return false;
  }
  const key = String(input.key ?? "");
  return key === "F11" || (input.control === true && input.meta === true && key.toLowerCase() === "f");
}

function appZoomActionForInput(input: { type?: string; key?: string; code?: string; control?: boolean; meta?: boolean }): "in" | "out" | "reset" | null {
  if (input.type !== "keyDown" || (input.meta !== true && input.control !== true)) {
    return null;
  }
  const key = String(input.key ?? "");
  const code = String(input.code ?? "");
  if (key === "+" || key === "=" || code === "Equal" || code === "NumpadAdd") {
    return "in";
  }
  if (key === "-" || code === "Minus" || code === "NumpadSubtract") {
    return "out";
  }
  if (key === "0" || code === "Digit0" || code === "Numpad0") {
    return "reset";
  }
  return null;
}

function isWebviewReloadInput(input: { type?: string; key?: string; control?: boolean; meta?: boolean }): boolean {
  return input.type === "keyDown" && (input.meta === true || input.control === true) && String(input.key ?? "").toLowerCase() === "r";
}

function toggleFullscreen(win: BrowserWindow): void {
  const fullscreenWindow = win as unknown as {
    isFullScreen?: () => boolean;
    setFullScreen?: (fullscreen: boolean) => void;
  };
  fullscreenWindow.setFullScreen?.(!(fullscreenWindow.isFullScreen?.() ?? false));
}

function applyWebviewZoom(contents: any, action: "in" | "out" | "reset"): void {
  const current = typeof contents.getZoomFactor === "function" ? Number(contents.getZoomFactor()) : 1;
  const base = Number.isFinite(current) && current > 0 ? current : 1;
  const next = action === "reset"
    ? 1
    : action === "in"
      ? base * 1.1
      : base / 1.1;
  const clamped = Math.max(0.3, Math.min(3, next));
  contents.setZoomFactor?.(clamped);
}

async function createWindow(): Promise<void> {
  configureAppIdentity();
  const client = await PromisedNvimRpcClient.spawn({ clean: shouldLaunchCleanNvim() });
  const session = new EmbeddedNvimSession(client);
  const win = new BrowserWindow({
    title: appDisplayName,
    icon: appIcon(),
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadScript(),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });
  win.setTitle?.(appDisplayName);
  (win as unknown as { setMenu?: (menu: null) => void }).setMenu?.(null);

  win.webContents.on("console-message", (_event, _level, message) => {
    console.log("[renderer]", message);
  });
  win.webContents.on("before-input-event", (event, input) => {
    if (isFullscreenToggleInput(input)) {
      event.preventDefault();
      toggleFullscreen(win);
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
      void session.input("<Tab>");
      return;
    }

    if (shouldBlockShellAccelerator(input)) {
      event.preventDefault();
    }
  });

  session.start();
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
    win.webContents.send("jusi:state", toRendererState(state));
  };
  session.onStateChanged((state) => {
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
    win.webContents.send("jusi:web-scroll", event);
  });
  session.onWebOpenLink((event) => {
    const destroyed = (win as unknown as { isDestroyed?: () => boolean }).isDestroyed?.() ?? false;
    if (destroyed) {
      return;
    }
    win.webContents.send("jusi:web-open-link", event);
  });
  session.onWebEnterMode((event) => {
    const destroyed = (win as unknown as { isDestroyed?: () => boolean }).isDestroyed?.() ?? false;
    if (destroyed) {
      return;
    }
    win.webContents.send("jusi:web-enter-mode", event);
  });

  const [contentWidth, contentHeight] = win.getContentSize();
  const grid = estimateGrid(contentWidth, contentHeight);
  await session.attachUi(grid.columns, grid.lines);
  const pendingWebviewWindowCommands = new WeakMap<object, ReturnType<typeof setTimeout>>();
  const pendingWebviewNormalModeCommands = new WeakMap<object, ReturnType<typeof setTimeout>>();
  const webContentsCreatedHandler = (_event: any, contents: any) => {
    if (contents.getType() !== "webview") {
      return;
    }
    const host = contents.hostWebContents;
    if (host !== win.webContents) {
      return;
    }

    const leaveWebMode = () => {
      win.webContents.focus();
      win.webContents.send("jusi:leave-web-mode");
    };

    contents.on("before-input-event", (event: any, input: any) => {
      if (isFullscreenToggleInput(input)) {
        event.preventDefault();
        toggleFullscreen(win);
        return;
      }

      const zoomAction = appZoomActionForInput(input);
      if (zoomAction) {
        event.preventDefault();
        applyWebviewZoom(contents, zoomAction);
        win.webContents.send("jusi:web-zoomed");
        return;
      }

      if (isWebviewReloadInput(input)) {
        event.preventDefault();
        contents.reload?.();
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
      const pendingNormalTimeout = pendingWebviewNormalModeCommands.get(contents);
      if (pendingNormalTimeout && isModifierOnlyKey(key)) {
        return;
      }
      if (pendingNormalTimeout) {
        clearTimeout(pendingNormalTimeout);
        pendingWebviewNormalModeCommands.delete(contents);
        if (input.control && key.toLowerCase() === "n") {
          event.preventDefault();
          leaveWebMode();
          return;
        }
      }

      if (input.control && (key === "\\" || key === "Backslash" || input.code === "Backslash")) {
        event.preventDefault();
        const timeout = setTimeout(() => {
          pendingWebviewNormalModeCommands.delete(contents);
        }, 1200);
        pendingWebviewNormalModeCommands.set(contents, timeout);
        return;
      }

      if (input.control && key.toLowerCase() === "j") {
        event.preventDefault();
        win.webContents.send("jusi:web-open-active-link");
        return;
      }

      if (input.control && key.toLowerCase() === "l") {
        event.preventDefault();
        const url = typeof contents.getURL === "function" ? contents.getURL() : "";
        void session.setRegister("*", url);
        return;
      }

      if (input.control && key.toLowerCase() === "o") {
        event.preventDefault();
        if (typeof contents.canGoBack !== "function" || contents.canGoBack()) {
          contents.goBack?.();
        }
        return;
      }

      if (input.control && (key.toLowerCase() === "i" || key === "Tab")) {
        event.preventDefault();
        if (typeof contents.canGoForward !== "function" || contents.canGoForward()) {
          contents.goForward?.();
        }
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

      if (input.control && key.toLowerCase() === "w") {
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
      "set laststatus=2 noshowmode noruler",
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

  ipcMain.handle("jusi:get-initial-state", async () => {
    return toRendererState({
      snapshot: session.getSnapshot(),
      attachedWebViews: session.getAttachedWebViews(),
      screen: session.getScreenState(),
      grids: session.getGridStates(),
      cmdline: session.getCmdlineState(),
      popupmenu: session.getPopupmenuState(),
      messages: session.getMessageState(),
    });
  });

  ipcMain.handle("jusi:input", async (_event: unknown, keys: string) => {
    await session.input(keys);
  });

  ipcMain.handle("jusi:resize", async (_event: unknown, columns: number, lines: number) => {
    await session.resize(columns, lines);
  });

  ipcMain.handle("jusi:command", async (_event: unknown, command: string) => {
    await session.command(command);
  });

  ipcMain.handle("jusi:focus-window", async (_event: unknown, windowId: number) => {
    await session.command(`call win_gotoid(${Number(windowId)})`);
  });

  ipcMain.handle("jusi:set-cursor", async (_event: unknown, windowId: number, row: number, col: number) => {
    await session.setCursor(Number(windowId), Number(row), Number(col));
  });

  ipcMain.handle("jusi:update-web-mirror", async (_event: unknown, bufferId: number, mirror: unknown) => {
    await session.updateWebMirror(Number(bufferId), mirror as MirrorDocument);
  });

  win.on("closed", async () => {
    ipcMain.removeHandler("jusi:get-initial-state");
    ipcMain.removeHandler("jusi:input");
    ipcMain.removeHandler("jusi:resize");
    ipcMain.removeHandler("jusi:command");
    ipcMain.removeHandler("jusi:focus-window");
    ipcMain.removeHandler("jusi:set-cursor");
    ipcMain.removeHandler("jusi:update-web-mirror");
    await session.dispose();
  });

  await win.loadFile(rendererHtml());
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
    throw error;
  }
  app.on("activate", () => {
    // noop for now
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
