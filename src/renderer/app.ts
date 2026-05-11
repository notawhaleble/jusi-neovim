import { AttachedWebView, GridScreenState, HighlightAttrs, ScreenCell, ScreenLineRun } from "../core/types.js";
import { commandAreaHeight, placePopupmenu } from "./compositor.js";
import { RendererApi, RendererSessionState } from "./contracts.js";

declare global {
  interface Window {
    jusi: RendererApi;
  }

  interface HTMLElementTagNameMap {
    webview: HTMLElement & {
      src: string;
      allowpopups?: boolean;
      partition?: string;
      setAttribute(name: string, value: string): void;
      focus(): void;
      reload(): void;
    };
  }
}

let cellWidth = 9;
let cellHeight = 18;
const persistentViews = new Map<number, HTMLDivElement>();
const persistentFrames = new Map<number, HTMLDivElement>();
const persistentGridLayers = new Map<number, HTMLPreElement>();
let latestState: RendererSessionState | null = null;
let pendingRenderState: RendererSessionState | null = null;
let pendingRenderFrame: number | null = null;
let pendingWindowCommandTimer: ReturnType<typeof setTimeout> | null = null;

function parseHexColor(color: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) {
    return null;
  }
  const value = parseInt(match[1], 16);
  return [
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff,
  ];
}

function colorDistance(a: string, b: string): number {
  const left = parseHexColor(a);
  const right = parseHexColor(b);
  if (!left || !right) {
    return 999;
  }
  const dr = left[0] - right[0];
  const dg = left[1] - right[1];
  const db = left[2] - right[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function relativeLuminance(color: string): number {
  const parsed = parseHexColor(color);
  if (!parsed) {
    return 0;
  }
  const [red, green, blue] = parsed.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function readableTextColor(background: string): string {
  return relativeLuminance(background) > 0.45 ? "#000000" : "#d9dde7";
}

function resolveDefaultForeground(background: string, foreground: string | undefined): string {
  const candidate = foreground ?? readableTextColor(background);
  if (colorDistance(background, candidate) < 90) {
    return readableTextColor(background);
  }
  return candidate;
}

function measureCellMetrics(): void {
  const ruler = document.getElementById("cell-ruler");
  if (!ruler) {
    return;
  }
  const rect = ruler.getBoundingClientRect();
  if (rect.width > 0) {
    cellWidth = rect.width / 10;
  }
  if (rect.height > 0) {
    cellHeight = rect.height;
  }
}

function setText(selector: string, text: string): void {
  const node = document.querySelector(selector);
  if (node) {
    node.textContent = text;
  }
}

function preserveLeadingBlankCells(line: string): string {
  return line.replace(/^ +/, (spaces) => "\u00a0".repeat(spaces.length));
}

function formatGridLines(lines: string[]): string {
  return lines.map((line) => preserveLeadingBlankCells(line)).join("\n");
}

function displayCellText(text: string, column: number): string {
  if (column === 0 && text === " ") {
    return "\u00a0";
  }
  return text;
}

function displayRunText(text: string, column: number, highlighted: boolean): string {
  if (highlighted) {
    return text.replaceAll(" ", "\u00a0");
  }
  if (column === 0) {
    return text.replace(/^ +/, (spaces) => "\u00a0".repeat(spaces.length));
  }
  return text;
}

function styleForHighlight(
  attrs: HighlightAttrs | undefined,
  defaults: { foreground: string; background: string },
): string {
  if (!attrs) {
    return "";
  }

  const sourceForeground = attrs.foreground ?? defaults.foreground;
  const sourceBackground = attrs.background ?? defaults.background;
  const foreground = attrs.reverse ? sourceBackground : attrs.foreground;
  const background = attrs.reverse ? sourceForeground : attrs.background;
  const styles: string[] = [];
  if (foreground) {
    styles.push(`color:${foreground}`);
  }
  if (background) {
    styles.push(`background-color:${background}`);
  }
  if (attrs.bold) {
    styles.push("font-weight:700");
  }
  if (attrs.italic) {
    styles.push("font-style:italic");
  }
  if (attrs.underline || attrs.undercurl) {
    const decoration = attrs.undercurl ? "underline wavy" : "underline";
    const color = attrs.special ?? foreground ?? defaults.foreground;
    styles.push(`text-decoration:${decoration}`);
    styles.push(`text-decoration-color:${color}`);
  }
  return styles.join(";");
}

function renderCellsInto(
  target: HTMLElement,
  cells: ScreenCell[][],
  highlights: Record<number, HighlightAttrs>,
  defaults: { foreground: string; background: string },
): void {
  target.replaceChildren();

  cells.forEach((row, rowIndex) => {
    if (rowIndex > 0) {
      target.appendChild(document.createTextNode("\n"));
    }

    let currentHighlightId: number | null = null;
    let currentText = "";
    const flush = () => {
      if (currentText === "") {
        return;
      }
      if (currentHighlightId === null || currentHighlightId === 0 || !highlights[currentHighlightId]) {
        target.appendChild(document.createTextNode(currentText));
      } else {
        const span = document.createElement("span");
        span.textContent = currentText.replaceAll(" ", "\u00a0");
        const style = styleForHighlight(highlights[currentHighlightId], defaults);
        if (style) {
          span.setAttribute("style", style);
        }
        target.appendChild(span);
      }
      currentText = "";
    };

    row.forEach((cell, column) => {
      if (currentHighlightId !== cell.highlightId) {
        flush();
        currentHighlightId = cell.highlightId;
      }
      currentText += displayCellText(cell.text, column);
    });
    flush();
  });
}

function renderRunsInto(
  target: HTMLElement,
  runs: ScreenLineRun[][],
  highlights: Record<number, HighlightAttrs>,
  defaults: { foreground: string; background: string },
): void {
  target.replaceChildren();

  runs.forEach((row, rowIndex) => {
    if (rowIndex > 0) {
      target.appendChild(document.createTextNode("\n"));
    }

    let column = 0;
    for (const run of row) {
      const highlighted = run.highlightId !== 0 && Boolean(highlights[run.highlightId]);
      const text = displayRunText(run.text, column, highlighted);
      column += run.text.length;

      if (!highlighted) {
        target.appendChild(document.createTextNode(text));
        continue;
      }

      const span = document.createElement("span");
      span.textContent = text;
      const style = styleForHighlight(highlights[run.highlightId], defaults);
      if (style) {
        span.setAttribute("style", style);
      }
      target.appendChild(span);
    }
  });
}

function renderGridContent(
  target: HTMLElement,
  grid: GridScreenState | { lines: string[]; cells?: ScreenCell[][]; runs?: ScreenLineRun[][] },
  highlights: Record<number, HighlightAttrs>,
  defaults: { foreground: string; background: string },
): void {
  const signature = gridContentSignature(grid, highlights, defaults);
  if (target.dataset.renderSignature === signature) {
    return;
  }
  target.dataset.renderSignature = signature;

  if (grid.runs && grid.runs.some((row) => row.some((run) => run.highlightId !== 0))) {
    renderRunsInto(target, grid.runs, highlights, defaults);
    return;
  }
  if (grid.cells && grid.cells.some((row) => row.some((cell) => cell.highlightId !== 0))) {
    renderCellsInto(target, grid.cells, highlights, defaults);
    return;
  }
  target.textContent = formatGridLines(grid.lines);
}

function gridContentSignature(
  grid: GridScreenState | { lines: string[]; cells?: ScreenCell[][]; runs?: ScreenLineRun[][] },
  highlights: Record<number, HighlightAttrs>,
  defaults: { foreground: string; background: string },
): string {
  if (grid.runs) {
    return grid.runs
      .map((row) =>
        row
          .map((run) => {
            const style = run.highlightId === 0 ? "" : styleForHighlight(highlights[run.highlightId], defaults);
            return `${run.highlightId}:${style}:${run.text}`;
          })
          .join("\u001f"),
      )
      .join("\u001e");
  }
  if (grid.cells) {
    return grid.cells
      .map((row) => row.map((cell) => `${cell.highlightId}:${cell.text}`).join("\u001f"))
      .join("\u001e");
  }
  return grid.lines.join("\u001e");
}

function formatCmdline(state: RendererSessionState["cmdline"], maxColumns: number): string {
  const indent = state.indent > 0 ? " ".repeat(state.indent) : "";
  const base = `${indent}${state.prompt}${state.firstChar}${state.content}`;
  const prefixLength = indent.length + state.prompt.length + state.firstChar.length;
  const cursorIndex = Math.max(0, Math.min(base.length, prefixLength + state.position));
  const scrollToCursor = (text: string): string => {
    if (maxColumns <= 0 || text.length <= maxColumns) {
      return text;
    }
    const start = Math.max(0, cursorIndex - maxColumns + 1);
    return text.slice(start, start + maxColumns);
  };

  if (!state.specialChar) {
    return scrollToCursor(base);
  }

  if (state.specialShift) {
    return scrollToCursor(`${base.slice(0, cursorIndex)}${state.specialChar}${base.slice(cursorIndex)}`);
  }
  if (cursorIndex >= base.length) {
    return scrollToCursor(`${base}${state.specialChar}`);
  }
  return scrollToCursor(`${base.slice(0, cursorIndex)}${state.specialChar}${base.slice(cursorIndex + 1)}`);
}

function getCommandAreaHeight(state: RendererSessionState): number {
  return commandAreaHeight({
    cmdlineVisible: state.cmdline.visible,
    blockLineCount: state.cmdline.blockLines.length,
  }, { cellWidth, cellHeight });
}

function windowOrder(window: RendererSessionState["snapshot"]["windows"][number]): number {
  return (window.zIndex ?? 0) * 1000 + (window.compIndex ?? 0);
}

function windowKind(
  state: RendererSessionState,
  window: RendererSessionState["snapshot"]["windows"][number],
): "text" | "web" | null {
  const buffer = state.snapshot.buffers.find((entry) => entry.id === window.bufferId);
  return buffer?.kind ?? null;
}

function hitTestWindow(
  state: RendererSessionState,
  x: number,
  y: number,
): RendererSessionState["snapshot"]["windows"][number] | null {
  const windows = state.snapshot.windows
    .filter((window) => window.tabId === state.snapshot.currentTabId)
    .filter(
      (window) =>
        typeof window.row === "number" &&
        typeof window.col === "number" &&
        typeof window.width === "number" &&
        typeof window.height === "number",
    );

  for (let idx = windows.length - 1; idx >= 0; idx -= 1) {
    const window = windows[idx];
    const left = window.col! * cellWidth;
    const top = window.row! * cellHeight;
    const width = window.width! * cellWidth;
    const height = window.height! * cellHeight;
    if (x >= left && x < left + width && y >= top && y < top + height) {
      return window;
    }
  }

  return null;
}

function ensureViewHost(view: AttachedWebView): HTMLDivElement {
  const existing = persistentViews.get(view.bufferId);
  if (existing) {
    return existing;
  }

  const host = document.createElement("div");
  host.className = "web-view-box";
  host.dataset.bufferId = String(view.bufferId);
  host.dataset.windowId = String(view.windowId);

  const title = document.createElement("div");
  title.className = "web-view-box__title";
  title.addEventListener("mousedown", (event) => {
    const target = event.currentTarget as HTMLElement;
    const windowId = Number(target.parentElement?.dataset.windowId);
    if (Number.isFinite(windowId)) {
      void window.jusi.focusWindow(windowId);
    }
  });
  host.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "web-view-box__meta";
  meta.addEventListener("mousedown", (event) => {
    const target = event.currentTarget as HTMLElement;
    const windowId = Number(target.parentElement?.dataset.windowId);
    if (Number.isFinite(windowId)) {
      void window.jusi.focusWindow(windowId);
    }
  });
  host.appendChild(meta);

  const browser = document.createElement("webview");
  browser.className = "web-view-box__browser";
  browser.partition = `persist:jusi-buffer-${view.bufferId}`;
  browser.src = view.url;
  browser.dataset.currentUrl = view.url;
  host.appendChild(browser);

  persistentViews.set(view.bufferId, host);
  return host;
}

function updateViewHost(host: HTMLDivElement, view: AttachedWebView): void {
  host.dataset.windowId = String(view.windowId);
  const title = host.querySelector(".web-view-box__title");
  if (title) {
    title.textContent = view.title || view.url || "web buffer";
  }

  const meta = host.querySelector(".web-view-box__meta");
  if (meta) {
    const bounds = view.gridBounds;
    meta.textContent = bounds
      ? `buf ${view.bufferId} win ${view.windowId} ${bounds.width}x${bounds.height} @ ${bounds.row},${bounds.col}`
      : `buf ${view.bufferId} win ${view.windowId}`;
  }

  const browser = host.querySelector("webview");
  if (browser && browser.dataset.currentUrl !== view.url) {
    browser.dataset.currentUrl = view.url;
    browser.src = view.url;
  }
}

function parkViewHost(host: HTMLDivElement): void {
  host.classList.add("web-view-box--parked");
  host.style.left = "-20000px";
  host.style.top = "0";
  host.style.width = "800px";
  host.style.height = "600px";
}

function placeViewHost(host: HTMLDivElement, view: AttachedWebView): void {
  host.classList.remove("web-view-box--parked");
  const bounds = view.gridBounds;
  if (!bounds) {
    host.style.left = "24px";
    host.style.top = "24px";
    host.style.width = "480px";
    host.style.height = "320px";
    return;
  }
  host.style.left = `${bounds.col * cellWidth}px`;
  host.style.top = `${bounds.row * cellHeight}px`;
  host.style.width = `${bounds.width * cellWidth}px`;
  host.style.height = `${bounds.height * cellHeight}px`;
}

function renderAttachedViews(views: AttachedWebView[]): void {
  const root = document.getElementById("web-view-layer");
  if (!root) {
    return;
  }

  const currentTabId = Number(document.body.dataset.currentTabId || "0");
  const activeWindowId = Number(document.body.dataset.activeWindowId || "0");
  const active = new Set<number>();
  const orderedViews = [...views].sort((left, right) => {
    const leftOrder = ((left.gridBounds?.zIndex ?? 0) * 1000) + (left.gridBounds?.compIndex ?? 0);
    const rightOrder = ((right.gridBounds?.zIndex ?? 0) * 1000) + (right.gridBounds?.compIndex ?? 0);
    return leftOrder - rightOrder;
  });

  for (const view of orderedViews) {
    active.add(view.bufferId);
    const host = ensureViewHost(view);
    host.classList.toggle("web-view-box--active", view.windowId === activeWindowId);
    host.style.zIndex = String(100 + ((view.gridBounds?.zIndex ?? 0) * 1000) + (view.gridBounds?.compIndex ?? 0));
    updateViewHost(host, view);
    placeViewHost(host, view);
    if (host.parentElement !== root) {
      root.appendChild(host);
    }
  }

  for (const [bufferId, host] of persistentViews.entries()) {
    if (active.has(bufferId)) {
      continue;
    }
    if (host.parentElement !== root) {
      root.appendChild(host);
    }
    parkViewHost(host);
  }
}

function ensureWindowFrame(windowId: number): HTMLDivElement {
  const existing = persistentFrames.get(windowId);
  if (existing) {
    return existing;
  }

  const frame = document.createElement("div");
  frame.className = "window-frame";
  frame.dataset.windowId = String(windowId);
  frame.addEventListener("mousedown", (event) => {
    const target = event.currentTarget as HTMLElement;
    const nextWindowId = Number(target.dataset.windowId);
    if (Number.isFinite(nextWindowId)) {
      void window.jusi.focusWindow(nextWindowId);
    }
  });

  const label = document.createElement("div");
  label.className = "window-frame__label";
  label.addEventListener("mousedown", (event) => {
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    const nextWindowId = Number(target.parentElement?.dataset.windowId);
    if (Number.isFinite(nextWindowId)) {
      void window.jusi.focusWindow(nextWindowId);
    }
  });
  frame.appendChild(label);

  persistentFrames.set(windowId, frame);
  return frame;
}

function ensureGridLayer(gridId: number): HTMLPreElement {
  const existing = persistentGridLayers.get(gridId);
  if (existing) {
    return existing;
  }

  const layer = document.createElement("pre");
  layer.className = "grid-layer";
  layer.dataset.gridId = String(gridId);
  layer.addEventListener("mousedown", (event) => {
    const target = event.currentTarget as HTMLElement;
    const windowId = Number(target.dataset.windowId);
    if (Number.isFinite(windowId)) {
      void window.jusi.focusWindow(windowId);
    }
  });
  persistentGridLayers.set(gridId, layer);
  return layer;
}

function resolveWindowGrid(
  window: RendererSessionState["snapshot"]["windows"][number],
  grids: RendererSessionState["grids"],
) {
  if (typeof window.gridId === "number") {
    return grids.find((entry) => entry.gridId === window.gridId);
  }
  return undefined;
}

function resolveWindowGridBounds(window: RendererSessionState["snapshot"]["windows"][number]) {
  return window.gridBounds ?? null;
}

function renderGridLayers(state: RendererSessionState): void {
  const root = document.getElementById("grid-layer-root");
  if (!root) {
    return;
  }

  const active = new Set<number>();
  const orderedWindows = [...state.snapshot.windows]
    .filter((window) => window.tabId === state.snapshot.currentTabId)
    .sort((left, right) => windowOrder(left) - windowOrder(right));

  for (const window of orderedWindows) {
    const grid = resolveWindowGrid(window, state.grids);
    const bounds = resolveWindowGridBounds(window);
    if (!grid) {
      continue;
    }
    if (
      !bounds &&
      (typeof window.row !== "number" ||
        typeof window.col !== "number" ||
        typeof window.width !== "number" ||
        typeof window.height !== "number")
    ) {
      continue;
    }

    const row = bounds?.row ?? window.row!;
    const col = bounds?.col ?? window.col!;
    const width = bounds?.width ?? window.width!;
    const height = bounds?.height ?? window.height!;

    active.add(grid.gridId);
    const layer = ensureGridLayer(grid.gridId);
    layer.dataset.windowId = String(window.id);
    const background = state.screen.backgroundColor ?? "#16161d";
    const foreground = resolveDefaultForeground(background, state.screen.foregroundColor);
    renderGridContent(layer, grid, state.screen.highlights, {
      foreground,
      background,
    });
    layer.style.backgroundColor = background;
    layer.style.color = foreground;
    layer.style.zIndex = String(10 + windowOrder(window));
    layer.style.left = `${col * cellWidth}px`;
    layer.style.top = `${row * cellHeight}px`;
    layer.style.width = `${width * cellWidth}px`;
    layer.style.height = `${height * cellHeight}px`;
    if (layer.parentElement !== root) {
      root.appendChild(layer);
    }
  }

  for (const [gridId, layer] of persistentGridLayers.entries()) {
    if (active.has(gridId)) {
      continue;
    }
    layer.remove();
  }
}

function renderWindowFrames(state: RendererSessionState): void {
  const root = document.getElementById("window-frame-layer");
  if (!root) {
    return;
  }

  const currentTabId = state.snapshot.currentTabId;
  const activeTab = state.snapshot.tabs.find((tab) => tab.id === currentTabId);
  const activeWindowId = activeTab?.currentWindowId;
  const visibleWindows = state.snapshot.windows
    .filter((window) => window.tabId === currentTabId)
    .sort((left, right) => windowOrder(left) - windowOrder(right));
  const active = new Set<number>();

  for (const window of visibleWindows) {
    if (
      typeof window.row !== "number" ||
      typeof window.col !== "number" ||
      typeof window.width !== "number" ||
      typeof window.height !== "number"
    ) {
      continue;
    }

    active.add(window.id);
    const frame = ensureWindowFrame(window.id);
    frame.classList.toggle("window-frame--active", window.id === activeWindowId);
    frame.style.zIndex = String(1000 + windowOrder(window));
    frame.style.left = `${window.col * cellWidth}px`;
    frame.style.top = `${window.row * cellHeight}px`;
    frame.style.width = `${window.width * cellWidth}px`;
    frame.style.height = `${window.height * cellHeight}px`;

    const label = frame.querySelector(".window-frame__label");
    if (label) {
      label.textContent = `win ${window.id} buf ${window.bufferId}`;
    }

    if (frame.parentElement !== root) {
      root.appendChild(frame);
    }
  }

  for (const [windowId, frame] of persistentFrames.entries()) {
    if (active.has(windowId)) {
      continue;
    }
    frame.remove();
  }
}

function renderMessageLayers(state: RendererSessionState): void {
  const commandHeight = getCommandAreaHeight(state);
  const messageLayer = document.getElementById("message-layer");
  if (messageLayer) {
    (messageLayer as HTMLElement).style.bottom = `${commandHeight}px`;
    messageLayer.innerHTML = "";
    const visibleEntries = state.messages.entries.filter((entry) => entry.text !== "");
    if (visibleEntries.length > 0) {
      messageLayer.classList.add("message-layer--visible");
      visibleEntries.forEach((entry) => {
        const row = document.createElement("div");
        row.className = `message-entry message-entry--${entry.kind || "plain"}`;
        row.textContent = entry.text;
        messageLayer.appendChild(row);
      });
    } else {
      messageLayer.classList.remove("message-layer--visible");
    }
  }

  const statusLayer = document.getElementById("message-status-layer");
  if (statusLayer) {
    statusLayer.classList.remove("message-status-layer--visible");
    statusLayer.textContent = "";
  }

  const historyLayer = document.getElementById("message-history-layer");
  if (historyLayer) {
    historyLayer.innerHTML = "";
    if (state.messages.historyVisible && state.messages.history.length > 0) {
      historyLayer.classList.add("message-history-layer--visible");
      state.messages.history.forEach((entry) => {
        const row = document.createElement("div");
        row.className = `message-history-entry message-entry--${entry.kind || "plain"}`;
        row.textContent = entry.text;
        historyLayer.appendChild(row);
      });
    } else {
      historyLayer.classList.remove("message-history-layer--visible");
    }
  }
}

function renderCmdlineBlock(state: RendererSessionState): void {
  const block = document.getElementById("cmdline-block-layer");
  if (!block) {
    return;
  }

  block.innerHTML = "";
  const lines = state.cmdline.blockLines;
  if (lines.length === 0) {
    block.classList.remove("cmdline-block-layer--visible");
    return;
  }

  lines.forEach((line) => {
    const row = document.createElement("div");
    row.className = "cmdline-block-line";
    row.textContent = line;
    block.appendChild(row);
  });
  block.classList.add("cmdline-block-layer--visible");
}

function renderState(state: RendererSessionState): void {
  latestState = state;
  const activeTab = state.snapshot.tabs.find((tab) => tab.id === state.snapshot.currentTabId);
  document.body.dataset.currentTabId = String(state.snapshot.currentTabId ?? "");
  document.body.dataset.activeWindowId = String(activeTab?.currentWindowId ?? "");

  measureCellMetrics();
  const background = state.screen.backgroundColor ?? "#16161d";
  const foreground = resolveDefaultForeground(background, state.screen.foregroundColor);
  document.documentElement.style.setProperty("--bg", background);
  document.documentElement.style.setProperty("--text", foreground);

  const screen = document.getElementById("terminal-screen");
  if (screen) {
    renderGridContent(screen, state.screen, state.screen.highlights, {
      foreground,
      background,
    });
    screen.style.backgroundColor = background;
    screen.style.color = foreground;
  }

  const cursor = document.getElementById("terminal-cursor");
  if (cursor) {
    const activeGridCursor = state.grids.find((grid) => grid.cursor)?.cursor ?? state.screen.cursor;
    const activeWindow = activeGridCursor
      ? state.snapshot.windows.find(
          (window) =>
            window.tabId === state.snapshot.currentTabId &&
            window.gridId === activeGridCursor.gridId,
        )
      : null;
    if (
      activeGridCursor &&
      activeWindow &&
      (activeWindow.gridBounds ||
        (typeof activeWindow.row === "number" && typeof activeWindow.col === "number"))
    ) {
      const bounds = resolveWindowGridBounds(activeWindow);
      const row = bounds?.row ?? activeWindow.row!;
      const col = bounds?.col ?? activeWindow.col!;
      cursor.style.display = "block";
      cursor.style.width = `${cellWidth}px`;
      cursor.style.height = `${cellHeight}px`;
      cursor.style.left = `${(col + activeGridCursor.col) * cellWidth}px`;
      cursor.style.top = `${(row + activeGridCursor.row) * cellHeight}px`;
      cursor.style.backgroundColor = foreground;
    } else {
      cursor.style.display = "none";
    }
  }

  setText("#status-tab", String(state.snapshot.currentTabId ?? "none"));
  setText("#status-buffers", String(state.snapshot.buffers.length));
  setText("#status-windows", String(state.snapshot.windows.length));
  setText("#status-webviews", String(state.attachedWebViews.length));

  const pre = document.getElementById("state-dump");
  if (pre && state.debugUi) {
    pre.textContent = JSON.stringify(state, null, 2);
  } else if (pre && pre.textContent !== "") {
    pre.textContent = "";
  }

  const cmdline = document.getElementById("cmdline-layer");
  if (cmdline) {
    if (state.cmdline.visible) {
      const stage = document.querySelector(".stage");
      const maxColumns = stage instanceof HTMLElement ? Math.floor(stage.clientWidth / cellWidth) : state.screen.cols;
      cmdline.textContent = formatCmdline(state.cmdline, maxColumns);
      cmdline.classList.add("cmdline-layer--visible");
    } else {
      cmdline.textContent = "";
      cmdline.classList.remove("cmdline-layer--visible");
    }
  }

  renderCmdlineBlock(state);

  const popup = document.getElementById("popupmenu-layer");
  if (popup) {
    popup.innerHTML = "";
    if (state.popupmenu.visible) {
      const stage = document.querySelector(".stage");
      const stageHeight = stage instanceof HTMLElement ? stage.clientHeight : 0;
      const stageWidth = stage instanceof HTMLElement ? stage.clientWidth : 0;
      const commandHeight = getCommandAreaHeight(state);
      popup.classList.add("popupmenu-layer--visible");
      state.popupmenu.items.forEach((item, index) => {
        const row = document.createElement("div");
        row.className = "popupmenu-item";
        if (index === state.popupmenu.selected) {
          row.classList.add("popupmenu-item--selected");
        }
        row.textContent = item.word;
        popup.appendChild(row);
      });
      const popupHeight = popup.getBoundingClientRect().height || (state.popupmenu.items.length * cellHeight);
      const placement = placePopupmenu({
        popupmenu: state.popupmenu,
        snapshot: state.snapshot,
        stage: { width: stageWidth, height: stageHeight, cellWidth, cellHeight },
        commandAreaHeight: commandHeight,
        popupHeight,
      });
      popup.style.left = `${placement.left}px`;
      popup.style.top = `${placement.top}px`;
    } else {
      popup.classList.remove("popupmenu-layer--visible");
    }
  }

  renderMessageLayers(state);
  renderGridLayers(state);
  renderWindowFrames(state);
  renderAttachedViews(state.attachedWebViews);
}

function scheduleRenderState(state: RendererSessionState): void {
  pendingRenderState = state;
  document.body.classList.toggle("debug-ui", state.debugUi);
  if (pendingRenderFrame !== null) {
    return;
  }
  pendingRenderFrame = window.requestAnimationFrame(() => {
    pendingRenderFrame = null;
    const next = pendingRenderState;
    pendingRenderState = null;
    if (next) {
      renderState(next);
    }
  });
}

function installPointerRouting(): void {
  const stage = document.querySelector(".stage");
  if (!stage) {
    return;
  }

  stage.addEventListener(
    "mousedown",
    (event) => {
      const mouseEvent = event as MouseEvent;
      if (!latestState) {
        return;
      }
      const rect = stage.getBoundingClientRect();
      const hit = hitTestWindow(
        latestState,
        mouseEvent.clientX - rect.left,
        mouseEvent.clientY - rect.top,
      );
      if (!hit) {
        return;
      }
      if (windowKind(latestState, hit) !== "text") {
        return;
      }
      void window.jusi.focusWindow(hit.id);
      event.preventDefault();
      event.stopPropagation();
    },
    true,
  );
}

function isWindowCommandFollower(key: string): boolean {
  return /^[hjklwHJKLW<>+\-=|_]$/.test(key);
}

function isModifierOnlyKey(key: string): boolean {
  return key === "Shift" || key === "Control" || key === "Alt" || key === "Meta";
}

function armPendingWindowCommand(): void {
  if (pendingWindowCommandTimer) {
    clearTimeout(pendingWindowCommandTimer);
  }
  pendingWindowCommandTimer = setTimeout(() => {
    pendingWindowCommandTimer = null;
  }, 1200);
}

function consumePendingWindowCommand(): boolean {
  if (!pendingWindowCommandTimer) {
    return false;
  }
  clearTimeout(pendingWindowCommandTimer);
  pendingWindowCommandTimer = null;
  return true;
}

function hasPendingWindowCommand(): boolean {
  return pendingWindowCommandTimer !== null;
}

function encodeKey(event: KeyboardEvent): string | null {
  if (event.metaKey) {
    return null;
  }

  if (hasPendingWindowCommand()) {
    if (isModifierOnlyKey(event.key)) {
      return null;
    }
    if (event.ctrlKey && event.key.toLowerCase() === "w") {
      consumePendingWindowCommand();
      return "<C-W><C-W>";
    }
    consumePendingWindowCommand();
    if (isWindowCommandFollower(event.key)) {
      return `<C-W>${event.key}`;
    }
    if (event.key === "Escape") {
      return "<Esc>";
    }
    return null;
  }

  if (event.ctrlKey && event.key.toLowerCase() === "w") {
    armPendingWindowCommand();
    return null;
  }

  if (event.ctrlKey && event.key.length === 1) {
    const upper = event.key.toUpperCase();
    return `<C-${upper}>`;
  }

  switch (event.key) {
    case "Escape":
      return "<Esc>";
    case "Enter":
      return "<CR>";
    case "Backspace":
      return "<BS>";
    case "Tab":
      return "<Tab>";
    case "ArrowUp":
      return "<Up>";
    case "ArrowDown":
      return "<Down>";
    case "ArrowLeft":
      return "<Left>";
    case "ArrowRight":
      return "<Right>";
    default:
      break;
  }

  if (event.altKey) {
    if (event.key.length === 1) {
      return `<A-${event.key}>`;
    }
    return null;
  }

  if (event.key.length === 1) {
    return event.key;
  }

  return null;
}

async function dispatchKey(event: KeyboardEvent): Promise<boolean> {
  if (event.metaKey) {
    return false;
  }

  if (hasPendingWindowCommand()) {
    if (isModifierOnlyKey(event.key)) {
      return false;
    }

    if (event.ctrlKey && event.key.toLowerCase() === "w") {
      consumePendingWindowCommand();
      await window.jusi.runCommand("wincmd w");
      return true;
    }

    consumePendingWindowCommand();
    if (isWindowCommandFollower(event.key)) {
      await window.jusi.runCommand(`wincmd ${event.key}`);
      return true;
    }
    if (event.key === "Escape") {
      await window.jusi.sendInput("<Esc>");
      return true;
    }
    return false;
  }

  if (event.ctrlKey && event.key.toLowerCase() === "w") {
    armPendingWindowCommand();
    return true;
  }

  const key = encodeKey(event);
  if (!key) {
    return false;
  }
  await window.jusi.sendInput(key);
  return true;
}

function installResizeSync(): void {
  const stage = document.querySelector(".stage");
  if (!stage) {
    return;
  }

  let lastColumns = 0;
  let lastLines = 0;
  const sync = () => {
    const rect = stage.getBoundingClientRect();
    measureCellMetrics();
    const columns = Math.max(20, Math.floor(rect.width / cellWidth));
    const lines = Math.max(8, Math.floor(rect.height / cellHeight));
    if (columns === lastColumns && lines === lastLines) {
      return;
    }
    lastColumns = columns;
    lastLines = lines;
    void window.jusi.resize(columns, lines);
  };

  const observer = new ResizeObserver(() => {
    sync();
  });
  observer.observe(stage);
  sync();
}

async function boot(): Promise<void> {
  const initial = await window.jusi.getInitialState();
  renderState(initial);
  window.jusi.onStateChanged((state) => {
    scheduleRenderState(state);
  });
  installResizeSync();
  installPointerRouting();

  window.addEventListener("keydown", (event) => {
    void dispatchKey(event).then((handled) => {
      if (handled) {
        event.preventDefault();
      }
    });
  });
}

void boot();
