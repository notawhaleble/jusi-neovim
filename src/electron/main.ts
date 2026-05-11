import { app, BrowserWindow, ipcMain } from "electron";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PromisedNvimRpcClient } from "../bridge/promised-client.js";
import { EmbeddedNvimSession, EmbeddedSessionState } from "../bridge/rpc-session.js";
import { RendererSessionState } from "../renderer/contracts.js";
import { isTabKey, isWindowCommandFollower, shouldBlockShellAccelerator } from "./key-routing.js";

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

function processEnv(): Record<string, string | undefined> {
  return (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
}

function shouldLaunchCleanNvim(): boolean {
  return processEnv().JUSI_NVIM_CLEAN !== "0";
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
  const lines = Math.max(8, Math.floor(height / 18));
  return { columns, lines };
}

function isEscapeKey(key: string): boolean {
  return key === "Escape";
}

function isModifierOnlyKey(key: string): boolean {
  return key === "Shift" || key === "Control" || key === "Alt" || key === "Meta";
}

async function createWindow(): Promise<void> {
  const client = await PromisedNvimRpcClient.spawn({ clean: shouldLaunchCleanNvim() });
  const session = new EmbeddedNvimSession(client);
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadScript(),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });
  (win as unknown as { setMenu?: (menu: null) => void }).setMenu?.(null);

  win.webContents.on("console-message", (_event, _level, message) => {
    console.log("[renderer]", message);
  });
  win.webContents.on("before-input-event", (event, input) => {
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

  const [contentWidth, contentHeight] = win.getContentSize();
  const grid = estimateGrid(contentWidth, contentHeight);
  await session.attachUi(grid.columns, grid.lines);
  const pendingWebviewWindowCommands = new WeakMap<object, ReturnType<typeof setTimeout>>();
  const webContentsCreatedHandler = (_event: any, contents: any) => {
    if (contents.getType() !== "webview") {
      return;
    }
    const host = contents.hostWebContents;
    if (host !== win.webContents) {
      return;
    }

    contents.on("before-input-event", (event: any, input: any) => {
      if (shouldBlockShellAccelerator(input)) {
        event.preventDefault();
        return;
      }

      if (input.type !== "keyDown" || input.meta || input.alt) {
        return;
      }

      const key = typeof input.key === "string" ? input.key : "";
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
          void session.command("wincmd w");
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
        void session.command(`wincmd ${key}`);
        return;
      }

      if (isTabKey(key)) {
        event.preventDefault();
        void session.input("<Tab>");
        return;
      }

      if (isEscapeKey(key)) {
        event.preventDefault();
        void session.input("<Esc>");
      }
    });
  };
  app.on("web-contents-created", webContentsCreatedHandler);
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

  win.on("closed", async () => {
    ipcMain.removeHandler("jusi:get-initial-state");
    ipcMain.removeHandler("jusi:input");
    ipcMain.removeHandler("jusi:resize");
    ipcMain.removeHandler("jusi:command");
    ipcMain.removeHandler("jusi:focus-window");
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
