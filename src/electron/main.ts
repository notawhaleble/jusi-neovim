import { app, BrowserWindow, clipboard, ipcMain, Menu, nativeImage, protocol, session as electronSession } from "electron";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PromisedNvimRpcClient } from "../bridge/promised-client.js";
import { EmbeddedNvimSession, EmbeddedSessionState } from "../bridge/rpc-session.js";
import { MirrorDocument, UiSnapshot } from "../core/types.js";
import { RendererSessionState } from "../renderer/contracts.js";
import { isCtrlAInput, isPhysicalKeyInput, isTabKey, isWindowCommandFollower, shouldBlockShellAccelerator } from "./key-routing.js";

const appDisplayName = "Jusi Neovim";
const appLogoFile = "jusi-neovim-logo.png";
const linuxExecutableName = "jusi-neovim";
const linuxDesktopFileName = `${linuxExecutableName}.desktop`;
const directoryScheme = "jusi-directory";
const directoryProtocolRegistries = new WeakSet<object>();

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

type ProtocolRegistry = {
  handle: (
    scheme: string,
    handler: (request: { url: string }) => Response | Promise<Response>,
  ) => void;
  isProtocolHandled?: (scheme: string) => boolean;
};

async function registerDirectoryProtocol(registry: ProtocolRegistry = protocol): Promise<void> {
  if (directoryProtocolRegistries.has(registry)) {
    return;
  }
  directoryProtocolRegistries.add(registry);
  if (registry.isProtocolHandled?.(directoryScheme)) {
    return;
  }
  try {
    registry.handle(directoryScheme, handleDirectoryProtocolRequest);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Failed to register protocol")) {
      return;
    }
    throw error;
  }
}

async function handleDirectoryProtocolRequest(request: { url: string }): Promise<Response> {
  const url = new URL(request.url);
  const filePath = url.searchParams.get("path");
  if (!filePath) {
    return htmlResponse("Directory not found", 404);
  }

  try {
    const stats = statSync(filePath);
    if (stats.isDirectory()) {
      return htmlResponse(directoryListingHtml(filePath), 200);
    }
    if (stats.isFile()) {
      return fileResponse(filePath, stats.size);
    }
    return htmlResponse("Path is not a regular file or directory", 404);
  } catch (_error) {
    return htmlResponse("Path not found", 404);
  }
}

function htmlResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}

function directoryListingHtml(filePath: string): string {
  const entries = readdirSync(filePath, { withFileTypes: true })
    .map((entry) => {
      const childPath = join(filePath, entry.name);
      const isDirectory = entry.isDirectory();
      return {
        href: localPathUrl(childPath),
        name: entry.name + (isDirectory ? "/" : ""),
        isDirectory,
      };
    })
    .sort((left, right) => {
      if (left.isDirectory !== right.isDirectory) {
        return left.isDirectory ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });

  const parent = dirname(filePath);
  const parentLink = parent !== filePath
    ? `<li><a href="${escapeAttribute(localPathUrl(parent))}">../</a></li>`
    : "";
  const items = entries.map((entry) => {
    return `<li><a href="${escapeAttribute(entry.href)}">${escapeHtml(entry.name)}</a></li>`;
  }).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(filePath)}</title>
  <style>
    ${localFilePageCss()}
    h1 { font-size: 18px; margin: 0 0 16px; }
    ul { list-style: none; padding: 0; margin: 0; }
    li { padding: 3px 0; }
  </style>
</head>
<body>
  <h1>${escapeHtml(basename(filePath) || filePath)}</h1>
  <ul>${parentLink}${items}</ul>
</body>
</html>`;
}

function fileResponse(filePath: string, size: number): Response {
  const maxPreviewBytes = 2 * 1024 * 1024;
  if (size > maxPreviewBytes) {
    return rawFileResponse(filePath);
  }
  if (isMarkdownPath(filePath)) {
    return htmlResponse(markdownFileHtml(filePath, readFileSync(filePath, "utf8")), 200);
  }
  if (shouldServeRawByExtension(filePath)) {
    return rawFileResponse(filePath);
  }

  const content = readFileSync(filePath);
  if (!isTextBuffer(content)) {
    return rawFileResponse(filePath, content);
  }

  return htmlResponse(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(filePath)}</title>
  <style>
    ${localFilePageCss()}
    h1 { font-size: 16px; margin: 0 0 16px; }
    pre { font: 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; line-height: 1.45; margin: 0; white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body>
  <h1>${escapeHtml(basename(filePath) || filePath)}</h1>
  <pre>${escapeHtml(content.toString("utf8"))}</pre>
</body>
</html>`, 200);
}

function markdownFileHtml(filePath: string, source: string): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(filePath)}</title>
  <style>
    ${localFilePageCss()}
    main { max-width: 900px; }
    h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.35em 0 0.55em; }
    h1 { border-bottom: 1px solid #30363d; font-size: 2em; padding-bottom: 0.3em; }
    h2 { border-bottom: 1px solid #30363d; font-size: 1.5em; padding-bottom: 0.25em; }
    h3 { font-size: 1.25em; }
    p, ul, ol, blockquote, pre { margin: 0 0 16px; }
    ul, ol { padding-left: 1.6em; }
    blockquote { border-left: 3px solid #3b434e; color: #9da7b3; padding-left: 12px; }
    code, pre { font: 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    code { background: #161b22; border-radius: 4px; padding: 0.15em 0.3em; }
    pre { background: #161b22; border-radius: 6px; overflow: auto; padding: 12px; }
    pre code { background: transparent; padding: 0; }
    img { max-width: 100%; }
    table { border-collapse: collapse; margin: 0 0 16px; }
    th, td { border: 1px solid #30363d; padding: 6px 10px; }
    @media (prefers-color-scheme: light) {
      h1, h2 { border-bottom-color: #d0d7de; }
      blockquote { border-left-color: #d0d7de; color: #57606a; }
      code, pre { background: #f6f8fa; }
      th, td { border-color: #d0d7de; }
    }
  </style>
</head>
<body>
  <main>${renderMarkdown(source, dirname(filePath))}</main>
</body>
</html>`;
}

function rawFileResponse(filePath: string, content = readFileSync(filePath)): Response {
  return new Response(new Uint8Array(content), {
    status: 200,
    headers: {
      "content-type": mimeTypeForPath(filePath),
      "content-disposition": `inline; filename="${escapeHeaderValue(basename(filePath) || "file")}"`,
    },
  });
}

function localFilePageCss(): string {
  return `
    :root { color-scheme: light dark; }
    body { background: #0d1117; color: #e6edf3; font: 14px system-ui, sans-serif; margin: 24px; }
    a { color: #8ab4f8; text-decoration: none; }
    a:hover { text-decoration: underline; }
    @media (prefers-color-scheme: light) {
      body { background: #ffffff; color: #1f2328; }
      a { color: #0969da; }
    }
  `;
}

function isTextBuffer(content: Buffer): boolean {
  return !content.includes(0);
}

function isMarkdownPath(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return ext === ".md" || ext === ".markdown";
}

function shouldServeRawByExtension(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return [
    ".pdf",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".svg",
    ".ico",
    ".mp4",
    ".webm",
    ".mp3",
    ".wav",
    ".wasm",
  ].includes(ext);
}

function renderMarkdown(source: string, basePath: string): string {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let inFence = false;
  let fenceLines: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) {
      return;
    }
    blocks.push(`<p>${renderMarkdownInline(paragraph.join(" "), basePath)}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!listType) {
      return;
    }
    blocks.push(`<${listType}>${listItems.join("")}</${listType}>`);
    listItems = [];
    listType = null;
  };

  for (const line of lines) {
    const fence = /^```/.exec(line);
    if (fence) {
      if (inFence) {
        blocks.push(`<pre><code>${escapeHtml(fenceLines.join("\n"))}</code></pre>`);
        fenceLines = [];
        inFence = false;
      } else {
        flushParagraph();
        flushList();
        inFence = true;
      }
      continue;
    }
    if (inFence) {
      fenceLines.push(line);
      continue;
    }

    if (/^\s*$/.test(line)) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderMarkdownInline(heading[2].trim(), basePath)}</h${level}>`);
      continue;
    }

    const unordered = /^\s*[-*+]\s+(.+)$/.exec(line);
    if (unordered) {
      flushParagraph();
      if (listType !== "ul") {
        flushList();
        listType = "ul";
      }
      listItems.push(`<li>${renderMarkdownInline(unordered[1], basePath)}</li>`);
      continue;
    }

    const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (ordered) {
      flushParagraph();
      if (listType !== "ol") {
        flushList();
        listType = "ol";
      }
      listItems.push(`<li>${renderMarkdownInline(ordered[1], basePath)}</li>`);
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      flushList();
      blocks.push(`<blockquote>${renderMarkdownInline(quote[1], basePath)}</blockquote>`);
      continue;
    }

    paragraph.push(line.trim());
  }

  if (inFence) {
    blocks.push(`<pre><code>${escapeHtml(fenceLines.join("\n"))}</code></pre>`);
  }
  flushParagraph();
  flushList();
  return blocks.join("\n");
}

function renderMarkdownInline(source: string, basePath: string): string {
  const tokens: string[] = [];
  let text = source.replace(/`([^`]+)`/g, (_match, code: string) => {
    const token = `\u0000${tokens.length}\u0000`;
    tokens.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  text = escapeHtml(text)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt: string, href: string) => {
      return `<img alt="${escapeAttribute(alt)}" src="${escapeAttribute(markdownUrl(href, basePath))}">`;
    })
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
      return `<a href="${escapeAttribute(markdownUrl(href, basePath))}">${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");

  return text.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => tokens[Number(index)] ?? "");
}

function markdownUrl(rawHref: string, basePath: string): string {
  const href = rawHref.trim();
  if (href.startsWith("#")) {
    return href;
  }
  try {
    const parsed = new URL(href);
    if (parsed.protocol === "file:") {
      return localPathUrl(fileURLToPath(parsed));
    }
    if (parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:") {
      return href;
    }
    return "#";
  } catch (_error) {
    const hashIndex = href.indexOf("#");
    const pathPart = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
    const hashPart = hashIndex >= 0 ? href.slice(hashIndex) : "";
    return localPathUrl(resolve(basePath, pathPart)) + hashPart;
  }
}

function mimeTypeForPath(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".pdf":
      return "application/pdf";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".ico":
      return "image/x-icon";
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".wasm":
      return "application/wasm";
    case ".json":
      return "application/json; charset=utf-8";
    case ".html":
    case ".htm":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function escapeHeaderValue(value: string): string {
  return value.replace(/["\\\r\n]/g, "_");
}

function localPathUrl(filePath: string): string {
  const url = new URL(`${directoryScheme}://open/`);
  url.searchParams.set("path", filePath);
  return url.href;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "\"":
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
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

function isFullscreenToggleInput(input: { type?: string; key?: string; code?: string; control?: boolean; meta?: boolean }): boolean {
  if (input.type !== "keyDown") {
    return false;
  }
  const key = String(input.key ?? "");
  return key === "F11" || (input.control === true && input.meta === true && isPhysicalKeyInput(input, "KeyF"));
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

function isWebviewReloadInput(input: { type?: string; code?: string; control?: boolean; meta?: boolean }): boolean {
  return (input.meta === true || input.control === true) && isPhysicalKeyInput(input, "KeyR");
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
  win.setIcon?.(appIcon());
  (win as unknown as { setMenu?: (menu: null) => void }).setMenu?.(null);

  win.webContents.on("console-message", (_event, _level, message) => {
    console.log("[renderer]", message);
  });
  win.webContents.on("will-attach-webview", (_event, _webPreferences, params) => {
    const partition = typeof params.partition === "string" ? params.partition : "";
    if (partition) {
      void registerDirectoryProtocol(electronSession.fromPartition(partition).protocol as ProtocolRegistry);
    }
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
    const rendererState = toRendererState(state);
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
  let neovimExited = false;
  session.onExit(() => {
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
      return registerFromClipboardText(clipboard.readText());
    });
  }

  const [contentWidth, contentHeight] = win.getContentSize();
  const grid = estimateGrid(contentWidth, contentHeight);
  await session.attachUi(grid.columns, grid.lines);
  if (shouldUseElectronClipboard()) {
    await session.installClipboardProvider(runtimePluginScript());
  }
  const pendingWebviewWindowCommands = new WeakMap<object, ReturnType<typeof setTimeout>>();
  const pendingWebviewNormalModeCommands = new WeakMap<object, ReturnType<typeof setTimeout>>();
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
        if (input.control && isPhysicalKeyInput(input, "KeyN")) {
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

      if (input.control && isPhysicalKeyInput(input, "KeyO")) {
        event.preventDefault();
        if (typeof contents.canGoBack !== "function" || contents.canGoBack()) {
          contents.goBack?.();
        }
        return;
      }

      if (input.control && (isPhysicalKeyInput(input, "KeyI") || key === "Tab")) {
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

  ipcMain.handle("jusi:window-input", async (_event: unknown, keys: string) => {
    await session.windowInput(keys);
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

  ipcMain.on("jusi:perf", (_event: unknown, event: unknown) => {
    if (!shouldLogPerf() || typeof event !== "object" || event === null) {
      return;
    }
    perfLog(event as Record<string, unknown>);
  });

  win.on("closed", async () => {
    ipcMain.removeHandler("jusi:get-initial-state");
    ipcMain.removeHandler("jusi:input");
    ipcMain.removeHandler("jusi:window-input");
    ipcMain.removeHandler("jusi:resize");
    ipcMain.removeHandler("jusi:command");
    ipcMain.removeHandler("jusi:focus-window");
    ipcMain.removeHandler("jusi:set-cursor");
    ipcMain.removeHandler("jusi:update-web-mirror");
    ipcMain.removeAllListeners("jusi:perf");
    if (!neovimExited) {
      await session.dispose();
    }
  });

  await win.loadFile(rendererHtml(), {
    query: rendererQuery(),
  });
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
    await registerDirectoryProtocol();
    app.on("web-contents-created", (_event, contents) => {
      void registerDirectoryProtocol(contents.session.protocol as ProtocolRegistry);
    });
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
