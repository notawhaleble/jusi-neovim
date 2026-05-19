import {
  AttachedWebView,
  CursorStyle,
  GridScreenState,
  HighlightAttrs,
  MirrorDocument,
  ScreenCell,
  ScreenLineRun,
} from "../core/types.js";
import { commandAreaHeight, placePopupmenu } from "./compositor.js";
import { PerfEvent, RendererApi, RendererSessionState } from "./contracts.js";

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
const latestAttachedViews = new Map<number, AttachedWebView>();
const mirrorVersions = new Map<number, number>();
const mirrorHashes = new Map<number, string>();
const mirrorTimers = new Map<number, ReturnType<typeof setTimeout>>();
const mirrorProjectionTimers = new Map<number, ReturnType<typeof setTimeout>>();
const mirrorProjectionTokens = new Map<number, number>();
const webModeFrameStates = new Map<number, boolean>();
const mirrorCursorSignatures = new Map<number, string>();
const mirrorSelectionSignatures = new Map<number, string>();
let webModeBufferId: number | null = null;
let latestState: RendererSessionState | null = null;
let pendingRenderState: RendererSessionState | null = null;
let pendingRenderFrame: number | null = null;
let pendingWindowCommandTimer: ReturnType<typeof setTimeout> | null = null;
let pointerHidden = false;
let terminalFontSize = 14;
let requestGridResize: () => void = () => {};
let messagePagerSignature: string | null = null;
let messagePagerDismissedSignature: string | null = null;
let messagePagerScroll = 0;

const minTerminalFontSize = 10;
const maxTerminalFontSize = 26;
const defaultTerminalFontSize = 14;
const terminalLineHeightRatio = 18 / 14;
const zoomStorageKey = "jusi-neovim:terminal-font-size";
const hitEnterPromptText = "Press ENTER or type command to continue";
const perfEnabled = new URLSearchParams(window.location.search).get("perf") === "1";

let pendingInput: { at: number; seq: number; key: string } | null = null;
let inputSeq = 0;
let renderWindowStartedAt = performance.now();
let renderWindowCount = 0;
let renderWindowTotalMs = 0;
let renderWindowMaxMs = 0;
let renderWindowSlowCount = 0;

function roundMs(value: number): number {
  return Number(value.toFixed(2));
}

function perfLog(event: PerfEvent): void {
  if (!perfEnabled) {
    return;
  }
  window.jusi.logPerf(event);
}

function stateRenderMetrics(state: RendererSessionState): Record<string, number> {
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
    messages: state.messages.entries.length,
  };
}

function noteRenderPerf(state: RendererSessionState, renderMs: number): void {
  if (!perfEnabled) {
    return;
  }
  renderWindowCount += 1;
  renderWindowTotalMs += renderMs;
  renderWindowMaxMs = Math.max(renderWindowMaxMs, renderMs);
  if (renderMs >= 20) {
    renderWindowSlowCount += 1;
  }

  const now = performance.now();
  const input = pendingInput;
  pendingInput = null;
  const inputToRenderMs = input === null ? null : now - input.at;
  const shouldSummarize = now - renderWindowStartedAt >= 5000;
  const reason = renderMs >= 20
    ? "slow"
    : inputToRenderMs !== null && inputToRenderMs >= 80
      ? "input"
      : shouldSummarize
        ? "summary"
        : null;
  if (reason !== null) {
    perfLog({
      kind: "render",
      reason,
      renderMs: roundMs(renderMs),
      inputToRenderMs: inputToRenderMs === null ? null : roundMs(inputToRenderMs),
      inputSeq: input?.seq ?? null,
      inputKey: input?.key ?? null,
      windowAvgRenderMs: roundMs(renderWindowTotalMs / renderWindowCount),
      windowMaxRenderMs: roundMs(renderWindowMaxMs),
      windowRenders: renderWindowCount,
      windowSlowRenders: renderWindowSlowCount,
      ...stateRenderMetrics(state),
    });
  }
  if (shouldSummarize) {
    renderWindowStartedAt = now;
    renderWindowCount = 0;
    renderWindowTotalMs = 0;
    renderWindowMaxMs = 0;
    renderWindowSlowCount = 0;
  }
}

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

function cursorColorForStyle(
  style: CursorStyle,
  highlights: Record<number, HighlightAttrs>,
  defaults: { foreground: string; background: string },
): string {
  const attrs = style.attrId === undefined ? undefined : highlights[style.attrId];
  if (!attrs) {
    return defaults.foreground;
  }
  if (attrs.reverse) {
    return attrs.foreground ?? defaults.foreground;
  }
  return attrs.background ?? attrs.foreground ?? defaults.foreground;
}

function applyCursorStyle(
  element: HTMLElement,
  style: CursorStyle,
  originLeft: number,
  originTop: number,
  color: string,
): void {
  const percentage = Math.max(1, Math.min(100, style.cellPercentage || 100));
  const width = style.shape === "vertical"
    ? Math.max(2, Math.round((cellWidth * percentage) / 100))
    : cellWidth;
  const height = style.shape === "horizontal"
    ? Math.max(2, Math.round((cellHeight * percentage) / 100))
    : cellHeight;
  const top = style.shape === "horizontal" ? originTop + cellHeight - height : originTop;

  element.style.display = "block";
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  element.style.left = `${originLeft}px`;
  element.style.top = `${top}px`;
  element.style.backgroundColor = color;
  element.style.opacity = style.shape === "block" ? "0.65" : "0.95";
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

function clampTerminalFontSize(size: number): number {
  return Math.max(minTerminalFontSize, Math.min(maxTerminalFontSize, size));
}

function loadTerminalFontSize(): number {
  const stored = Number.parseFloat(window.localStorage.getItem(zoomStorageKey) ?? "");
  return Number.isFinite(stored) ? clampTerminalFontSize(stored) : defaultTerminalFontSize;
}

function applyTerminalFontSize(size: number, persist: boolean): void {
  terminalFontSize = clampTerminalFontSize(size);
  const lineHeight = Math.round(terminalFontSize * terminalLineHeightRatio);
  document.documentElement.style.setProperty("--terminal-font-size", `${terminalFontSize}px`);
  document.documentElement.style.setProperty("--terminal-line-height", `${lineHeight}px`);
  if (persist) {
    window.localStorage.setItem(zoomStorageKey, String(terminalFontSize));
  }
  measureCellMetrics();
}

function handleAppZoom(event: { action: "in" | "out" | "reset" }): void {
  const nextSize = event.action === "reset"
    ? defaultTerminalFontSize
    : terminalFontSize + (event.action === "in" ? 1 : -1);
  applyTerminalFontSize(nextSize, true);
  requestAnimationFrame(() => {
    requestGridResize();
    for (const host of persistentViews.values()) {
      scheduleMirrorRefresh(host);
      scheduleMirrorProjection(host, 120, true, true);
    }
    if (latestState) {
      scheduleRenderState(latestState);
    }
  });
}

function handleWebZoomed(): void {
  if (webModeBufferId === null) {
    return;
  }
  const host = persistentViews.get(webModeBufferId);
  const view = latestAttachedViews.get(webModeBufferId);
  if (!host || !view) {
    return;
  }
  scheduleMirrorRefresh(host);
  scheduleMirrorProjection(host, 300, true, true);
}

function handleWebOpenActiveLink(): void {
  if (webModeBufferId === null) {
    return;
  }
  const view = latestAttachedViews.get(webModeBufferId);
  if (!view) {
    return;
  }
  void handleWebOpenLink({
    bufferId: view.bufferId,
    windowId: view.windowId,
  });
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

interface CmdlineView {
  text: string;
  cursorColumn: number;
}

function formatCmdline(state: RendererSessionState["cmdline"], maxColumns: number): CmdlineView {
  const indent = state.indent > 0 ? " ".repeat(state.indent) : "";
  const base = `${indent}${state.prompt}${state.firstChar}${state.content}`;
  const prefixLength = indent.length + state.prompt.length + state.firstChar.length;
  const cursorIndex = Math.max(0, Math.min(base.length, prefixLength + state.position));
  const scrollToCursor = (text: string): CmdlineView => {
    if (maxColumns <= 0) {
      return { text: "", cursorColumn: 0 };
    }
    if (text.length <= maxColumns) {
      return { text, cursorColumn: Math.max(0, Math.min(cursorIndex, maxColumns - 1)) };
    }
    const start = Math.max(0, Math.min(cursorIndex - maxColumns + 1, text.length - maxColumns));
    return {
      text: text.slice(start, start + maxColumns),
      cursorColumn: Math.max(0, Math.min(cursorIndex - start, maxColumns - 1)),
    };
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
    cmdlineVisible: state.cmdline.visible || visibleMessageEntries(state).length > 0,
    blockLineCount: visibleCmdlineBlockLines(state).length,
  }, { cellWidth, cellHeight });
}

function visibleCmdlineBlockLines(state: RendererSessionState): string[] {
  const blockLines = commandBlockLines(state);
  const maxRows = Math.max(0, state.screen.rows);
  if (blockLines.length <= maxRows) {
    return blockLines;
  }
  return blockLines.slice(blockLines.length - maxRows);
}

function commandBlockLines(state: RendererSessionState): string[] {
  const lines = state.cmdline.blockLines.flatMap((line) => splitCommandBlockLine(line, state.screen.cols));
  lines.push(...visibleCommandMessageBlockLines(state));
  return lines;
}

function commandMessageBlockLines(state: RendererSessionState): string[] {
  const lines: string[] = [];
  const hasReturnPrompt = hasReturnPromptMessage(state);
  if (hasReturnPrompt) {
    lines.push(...state.messages.entries
      .filter((entry) => entry.text !== "" && !isReturnPromptMessage(entry))
      .flatMap((entry) => messageBlockLines(entry, state.screen.cols)));
  } else {
    lines.push(...state.messages.entries
      .filter((entry) => isCommandBlockMessageEntry(entry, state.screen.cols))
      .flatMap((entry) => messageBlockLines(entry, state.screen.cols)));
  }
  if (state.messages.historyVisible) {
    lines.push(...state.messages.history.flatMap((entry) => splitCommandBlockLine(entry.text, state.screen.cols)));
  }
  return lines;
}

function commandMessageSignature(state: RendererSessionState): string | null {
  const lines = commandMessageBlockLines(state);
  if (lines.length === 0) {
    return null;
  }
  return [
    state.messages.version,
    hasReturnPromptMessage(state) ? "native-prompt" : "synthetic-prompt",
    lines.join("\n"),
  ].join("\u001f");
}

function syncMessagePagerState(state: RendererSessionState): void {
  const signature = commandMessageSignature(state);
  if (signature !== messagePagerSignature) {
    messagePagerSignature = signature;
    messagePagerScroll = 0;
  }
  clampMessagePagerScroll(state);
}

function clampMessagePagerScroll(state: RendererSessionState): void {
  const maxRows = Math.max(1, state.screen.rows);
  const maxScroll = Math.max(0, commandMessageBlockLines(state).length - maxRows);
  messagePagerScroll = Math.max(0, Math.min(messagePagerScroll, maxScroll));
}

function isCommandMessageDismissed(state: RendererSessionState): boolean {
  const signature = commandMessageSignature(state);
  return signature !== null && signature === messagePagerDismissedSignature;
}

function visibleCommandMessageBlockLines(state: RendererSessionState): string[] {
  const signature = commandMessageSignature(state);
  if (signature === null || signature === messagePagerDismissedSignature) {
    return [];
  }
  const lines = commandMessageBlockLines(state);
  const maxRows = Math.max(0, state.screen.rows);
  if (lines.length <= maxRows) {
    return lines;
  }
  return lines.slice(messagePagerScroll, messagePagerScroll + maxRows);
}

function commandMessagePrompt(state: RendererSessionState): string | null {
  const signature = commandMessageSignature(state);
  if (signature === null || isCommandMessageDismissed(state)) {
    return null;
  }

  const returnPromptEntry = state.messages.entries.find(isReturnPromptMessage);
  if (returnPromptEntry) {
    return returnPromptEntry.text || hitEnterPromptText;
  }

  const lines = commandMessageBlockLines(state);
  const maxRows = Math.max(1, state.screen.rows);
  if (lines.length > maxRows && messagePagerScroll + maxRows < lines.length) {
    return "-- More --";
  }
  return hitEnterPromptText;
}

function visibleMessageEntries(state: RendererSessionState): RendererSessionState["messages"]["entries"] {
  const prompt = commandMessagePrompt(state);
  if (prompt) {
    return [{
      kind: "return_prompt",
      text: prompt,
      id: null,
    }];
  }
  if (isCommandMessageDismissed(state)) {
    return [];
  }

  const entriesWithText = state.messages.entries.filter((entry) => entry.text !== "");
  const returnPromptEntry = entriesWithText.find(isReturnPromptMessage);
  if (returnPromptEntry) {
    return [returnPromptEntry];
  }
  return entriesWithText.filter((entry) => !isCommandBlockMessageEntry(entry, state.screen.cols)).slice(-1);
}

function hasReturnPromptMessage(state: RendererSessionState): boolean {
  return state.messages.entries.some(isReturnPromptMessage);
}

function isReturnPromptMessage(entry: RendererSessionState["messages"]["entries"][number]): boolean {
  return entry.kind === "return_prompt" || /press\s+(enter|return)/i.test(entry.text);
}

function isMultilineMessageEntry(entry: RendererSessionState["messages"]["entries"][number]): boolean {
  return entry.text.includes("\n");
}

function isCommandBlockMessageEntry(
  entry: RendererSessionState["messages"]["entries"][number],
  maxColumns: number,
): boolean {
  return isMultilineMessageEntry(entry) || splitCommandBlockLine(entry.text, maxColumns).length > 1;
}

function messageBlockLines(entry: RendererSessionState["messages"]["entries"][number], maxColumns: number): string[] {
  const lines = splitCommandBlockLine(entry.text, maxColumns);
  while (lines.length > 0 && lines[0] === "") {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

function splitCommandBlockLine(line: string, maxColumns: number): string[] {
  const wrapColumns = Math.max(1, maxColumns);
  return line.split("\n").flatMap((part) => wrapCommandTextLine(part, wrapColumns));
}

function wrapCommandTextLine(line: string, maxColumns: number): string[] {
  if (line.length <= maxColumns) {
    return [line];
  }
  const lines: string[] = [];
  for (let index = 0; index < line.length; index += maxColumns) {
    lines.push(line.slice(index, index + maxColumns));
  }
  return lines;
}

function terminalGridHeight(state: RendererSessionState): number {
  return Math.max(0, state.screen.rows * cellHeight);
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

function focusHostSurface(): void {
  const stage = document.querySelector(".stage");
  if (stage instanceof HTMLElement) {
    stage.tabIndex = -1;
    stage.focus({ preventScroll: true });
  }
}

function updateWebModeClasses(): void {
  for (const [bufferId, host] of persistentViews.entries()) {
    host.classList.toggle("web-view-box--web-mode", webModeBufferId === bufferId);
  }
}

async function applyWebModeFrame(host: HTMLDivElement, visible: boolean, force = false): Promise<void> {
  const bufferId = Number(host.dataset.bufferId);
  if (!force && Number.isFinite(bufferId) && webModeFrameStates.get(bufferId) === visible) {
    return;
  }
  const browser = host.querySelector("webview") as HTMLElement | null;
  const executableBrowser = browser as (HTMLElement & { executeJavaScript?: (code: string) => Promise<unknown> }) | null;
  if (!browser || browser.dataset.domReady !== "1" || !executableBrowser || typeof executableBrowser.executeJavaScript !== "function") {
    return;
  }
  try {
    await executableBrowser.executeJavaScript(webModeFrameSource(visible));
    if (Number.isFinite(bufferId)) {
      webModeFrameStates.set(bufferId, visible);
    }
  } catch (_error) {
    // The webview can be temporarily unavailable while Electron swaps pages.
  }
}

async function applyWebPointerVisibility(host: HTMLDivElement): Promise<void> {
  const browser = host.querySelector("webview") as HTMLElement | null;
  const executableBrowser = browser as (HTMLElement & { executeJavaScript?: (code: string) => Promise<unknown> }) | null;
  if (!browser || browser.dataset.domReady !== "1" || !executableBrowser || typeof executableBrowser.executeJavaScript !== "function") {
    return;
  }
  try {
    await executableBrowser.executeJavaScript(pointerVisibilitySource(pointerHidden && webModeBufferId === null));
  } catch (_error) {
    // The webview can be temporarily unavailable while Electron swaps pages.
  }
}

function syncPointerVisibility(): void {
  for (const host of persistentViews.values()) {
    void applyWebPointerVisibility(host);
  }
}

function syncWebModeFrames(force = false): void {
  for (const [bufferId, host] of persistentViews.entries()) {
    void applyWebModeFrame(host, webModeBufferId === bufferId, force);
  }
}

function setWebMode(bufferId: number | null): void {
  const previousBufferId = webModeBufferId;
  webModeBufferId = bufferId;
  if (bufferId !== null) {
    showPointer();
  }
  updateWebModeClasses();
  syncWebModeFrames(previousBufferId !== bufferId);
  syncPointerVisibility();
  if (bufferId === null) {
    focusHostSurface();
  }
}

function hidePointerForKeyboardInput(): void {
  if (webModeBufferId !== null || pointerHidden) {
    return;
  }
  pointerHidden = true;
  document.body.classList.add("pointer-hidden");
  syncPointerVisibility();
}

function showPointer(): void {
  if (!pointerHidden) {
    return;
  }
  pointerHidden = false;
  document.body.classList.remove("pointer-hidden");
  syncPointerVisibility();
}

function syncWebModeToState(state: RendererSessionState): void {
  if (webModeBufferId === null) {
    return;
  }
  const activeTab = state.snapshot.tabs.find((tab) => tab.id === state.snapshot.currentTabId);
  const activeWindowId = activeTab?.currentWindowId;
  const activeView = state.attachedWebViews.find(
    (view) => view.bufferId === webModeBufferId && view.windowId === activeWindowId,
  );
  if (!activeView) {
    setWebMode(null);
  }
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
  browser.dataset.domReady = "0";
  browser.addEventListener("dom-ready", () => {
    browser.dataset.domReady = "1";
    webModeFrameStates.delete(view.bufferId);
    mirrorCursorSignatures.delete(view.bufferId);
    mirrorSelectionSignatures.delete(view.bufferId);
    void applyWebModeFrame(host, webModeBufferId === view.bufferId);
    void applyWebPointerVisibility(host);
    scheduleMirrorRefresh(host);
  });
  browser.addEventListener("did-finish-load", () => {
    scheduleMirrorRefresh(host);
  });
  browser.addEventListener("focus", () => {
    setWebMode(view.bufferId);
  });
  browser.addEventListener("mousedown", (event) => {
    setWebMode(view.bufferId);
    void moveMirrorCursorToClick(host, event as MouseEvent);
  });
  browser.addEventListener("wheel", () => {
    showPointer();
    scheduleMirrorProjection(host, 80, false, true);
  });
  browser.addEventListener("mousemove", showPointer);
  browser.addEventListener("pointerdown", showPointer);
  host.appendChild(browser);

  const mirrorCursor = document.createElement("div");
  mirrorCursor.className = "web-view-box__mirror-cursor";
  host.appendChild(mirrorCursor);

  const modeFrame = document.createElement("div");
  modeFrame.className = "web-view-box__mode-frame";
  host.appendChild(modeFrame);

  persistentViews.set(view.bufferId, host);
  return host;
}

function mirrorExtractorSource(): string {
  return `(() => {
    window.__jusiMirrorNodes = new Map();
    window.__jusiMirrorIndexMap = [];
    const maxChars = 200000;
    const collapsibleWhitespace = /[ \\t\\n\\f\\r]/;
    const lines = [];
    const indexMap = [];
    let currentLine = "";
    let currentLineStart = 0;
    let currentLineTop = null;
    let lastWasSpace = false;
    let charCount = 0;
    let currentBlock = null;
    let currentParent = null;
    const styleCache = new WeakMap();
    const lineHeight = (() => {
      const style = window.getComputedStyle(document.body || document.documentElement);
      const parsed = Number.parseFloat(style.lineHeight);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 16;
    })();
    window.__jusiMirrorLineHeight = lineHeight;
    const getStyle = (element) => {
      if (!styleCache.has(element)) {
        styleCache.set(element, window.getComputedStyle(element));
      }
      return styleCache.get(element);
    };
    const applyTextTransform = (text, transform) => {
      const mode = String(transform || "").toLowerCase();
      if (mode === "uppercase") {
        return text.toUpperCase();
      }
      if (mode === "lowercase") {
        return text.toLowerCase();
      }
      if (mode === "capitalize") {
        return text.replace(/\\b[a-z]/g, (match) => match.toUpperCase());
      }
      return text;
    };
    const normalizeNodeText = (text, whiteSpace, textTransform) => {
      const ws = String(whiteSpace || "").toLowerCase();
      const preserve = ws === "pre" || ws === "pre-wrap" || ws === "break-spaces";
      const preLine = ws === "pre-line";
      let normalized = "";
      const offsets = [];
      for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (char === "\\r") {
          continue;
        }
        if (collapsibleWhitespace.test(char)) {
          if (preserve) {
            normalized += char;
            offsets.push(index);
            lastWasSpace = char === " " || char === "\\t";
            continue;
          }
          if (preLine && char === "\\n") {
            normalized += "\\n";
            offsets.push(index);
            lastWasSpace = false;
            continue;
          }
          if (lastWasSpace) {
            continue;
          }
          normalized += " ";
          offsets.push(index);
          lastWasSpace = true;
          continue;
        }
        normalized += char;
        offsets.push(index);
        lastWasSpace = false;
      }
      const transformed = applyTextTransform(normalized, textTransform);
      return transformed.length === normalized.length
        ? { text: transformed, offsets }
        : { text: normalized, offsets };
    };
    const rectsForRange = (node, startOffset, endOffset) => {
      if (endOffset <= startOffset) {
        return [];
      }
      const range = document.createRange();
      try {
        range.setStart(node, Math.max(0, Math.min(startOffset, node.length)));
        range.setEnd(node, Math.max(0, Math.min(endOffset, node.length)));
        return Array.from(range.getClientRects())
          .filter((rect) => rect.width > 0 || rect.height > 0)
          .map((rect) => ({
            x: rect.x,
            y: rect.y,
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }));
      } catch (_error) {
        return [];
      } finally {
        range.detach();
      }
    };
    const firstRectForRange = (node, startOffset, endOffset) => {
      const rects = rectsForRange(node, startOffset, endOffset);
      return rects.length > 0 ? rects[0] : null;
    };
    const crossesVisualLines = (rects) => {
      if (rects.length <= 1) {
        return false;
      }
      const firstTop = rects[0].top;
      return rects.some((rect) => Math.abs(rect.top - firstTop) > lineHeight * 0.6);
    };
    const tokenize = (text) => {
      const tokens = [];
      let index = 0;
      while (index < text.length) {
        const char = text[index];
        if (char === "\\n") {
          tokens.push({ type: "newline", start: index, end: index + 1 });
          index += 1;
          continue;
        }
        if (char === " " || char === "\\t") {
          const start = index;
          while (index < text.length && (text[index] === " " || text[index] === "\\t")) {
            index += 1;
          }
          tokens.push({ type: "space", start, end: index });
          continue;
        }
        const start = index;
        while (index < text.length && text[index] !== " " && text[index] !== "\\t" && text[index] !== "\\n") {
          index += 1;
        }
        tokens.push({ type: "word", start, end: index });
      }
      return tokens;
    };
    const blockDisplayPattern = /^(block|list-item|table|table-row|table-cell|flex|grid|flow-root)$/;
    const blockAncestor = (node) => {
      let element = node.parentElement;
      const root = document.body || document.documentElement;
      while (element && element !== root && element !== document.documentElement) {
        const display = getStyle(element).display || "";
        if (blockDisplayPattern.test(display)) {
          return element;
        }
        element = element.parentElement;
      }
      return node.parentElement;
    };
    const separatorTags = new Set(["A", "BUTTON", "LI", "TD", "TH", "OPTION", "SUMMARY"]);
    const shouldSeparateInlineNodes = (previous, next) => {
      if (!previous || !next || previous === next || currentLine.length === 0 || currentLine.endsWith(" ")) {
        return false;
      }
      const previousTag = previous.tagName ? previous.tagName.toUpperCase() : "";
      const nextTag = next.tagName ? next.tagName.toUpperCase() : "";
      if (separatorTags.has(previousTag) || separatorTags.has(nextTag)) {
        return true;
      }
      const previousDisplay = getStyle(previous).display || "";
      const nextDisplay = getStyle(next).display || "";
      return previousDisplay.includes("inline-block") || nextDisplay.includes("inline-block");
    };
    const isTextNodeVisible = (node) => {
      if (!node || node.nodeType !== Node.TEXT_NODE || !node.parentElement) {
        return false;
      }
      const parent = node.parentElement;
      const tag = parent.tagName ? parent.tagName.toUpperCase() : "";
      if (["SCRIPT","STYLE","NOSCRIPT","TEMPLATE"].includes(tag)) {
        return false;
      }
      if (parent.closest && parent.closest('[aria-hidden="true"], #jusi-neovim-mirror-overlay, #jusi-neovim-web-mode-frame')) {
        return false;
      }
      const style = getStyle(parent);
      if (!style || style.display === "none" || style.visibility === "hidden") {
        return false;
      }
      return true;
    };
    const flushLine = (includeNewline = true, preserveEmpty = false) => {
      while (currentLine.endsWith(" ")) {
        currentLine = currentLine.slice(0, -1);
        indexMap.pop();
      }
      if (currentLine.length === 0 && !preserveEmpty) {
        currentLineTop = null;
        lastWasSpace = false;
        currentLineStart = indexMap.length;
        return;
      }
      const lineStart = currentLineStart;
      lines.push({
        lineNumber: lines.length,
        text: currentLine,
        startIndex: lineStart,
        endIndex: lineStart + currentLine.length,
        spans: [],
      });
      currentLine = "";
      currentLineTop = null;
      lastWasSpace = false;
      if (includeNewline) {
        indexMap.push(null);
      }
      currentLineStart = indexMap.length;
    };
    const pushSyntheticSpace = () => {
      if (currentLine.length === 0 || currentLine.endsWith(" ")) {
        return;
      }
      currentLine += " ";
      indexMap.push(null);
      charCount += 1;
    };
    const pushSpaceRun = (text) => {
      if (currentLine.length === 0) {
        return;
      }
      for (let index = 0; index < text.length && charCount < maxChars; index += 1) {
        if (currentLine.endsWith(" ") && text[index] === " ") {
          continue;
        }
        currentLine += text[index];
        indexMap.push(null);
        charCount += 1;
      }
    };
    const pushMappedChar = (node, char, offset, rect) => {
      if (char === "\\n") {
        flushLine(true, true);
        return;
      }
      if (char === " " && currentLine.length === 0) {
        return;
      }
      if (rect && currentLineTop !== null && Math.abs(rect.top - currentLineTop) > lineHeight * 0.6) {
        flushLine();
      }
      if (currentLine.length === 0) {
        currentLineStart = indexMap.length;
        currentLineTop = rect ? rect.top : null;
      }
      currentLine += char;
      indexMap.push({ node, offset });
      charCount += 1;
    };
    const pushMappedRun = (node, text, offsets, start, end, rect) => {
      if (rect && currentLineTop !== null && Math.abs(rect.top - currentLineTop) > lineHeight * 0.6) {
        flushLine();
      }
      if (currentLine.length === 0) {
        currentLineStart = indexMap.length;
        currentLineTop = rect ? rect.top : null;
      }
      for (let index = start; index < end && charCount < maxChars; index += 1) {
        currentLine += text[index];
        indexMap.push({ node, offset: offsets[index] });
        charCount += 1;
      }
    };
    const pushWrappedRun = (node, text, offsets, start, end) => {
      for (let index = start; index < end && charCount < maxChars; index += 1) {
        const char = text[index];
        const rect = firstRectForRange(node, offsets[index], offsets[index] + 1);
        pushMappedChar(node, char, offsets[index], rect);
      }
    };
    const pushToken = (node, text, offsets, token) => {
      if (token.type === "newline") {
        flushLine(true, true);
        return;
      }
      if (token.type === "space") {
        pushSpaceRun(text.slice(token.start, token.end));
        return;
      }
      const startOffset = offsets[token.start];
      const endOffset = offsets[token.end - 1] + 1;
      const rects = rectsForRange(node, startOffset, endOffset);
      if (crossesVisualLines(rects)) {
        pushWrappedRun(node, text, offsets, token.start, token.end);
        return;
      }
      pushMappedRun(node, text, offsets, token.start, token.end, rects.length > 0 ? rects[0] : null);
    };
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return isTextNodeVisible(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    let node = walker.nextNode();
    while (node && charCount < maxChars) {
      const parent = node.parentElement;
      const block = blockAncestor(node);
      if (currentBlock && block !== currentBlock && currentLine.length > 0) {
        flushLine();
      }
      currentBlock = block;
      if (shouldSeparateInlineNodes(currentParent, parent)) {
        pushSyntheticSpace();
      }
      currentParent = parent;
      const style = parent ? getStyle(parent) : null;
      const normalized = normalizeNodeText(node.nodeValue || "", style ? style.whiteSpace : "", style ? style.textTransform : "");
      const tokens = tokenize(normalized.text);
      for (const token of tokens) {
        if (charCount >= maxChars) {
          break;
        }
        pushToken(node, normalized.text, normalized.offsets, token);
      }
      node = walker.nextNode();
    }
    flushLine(false);
    window.__jusiMirrorIndexMap = indexMap;
    const totalTextLength = lines.length > 0 ? lines[lines.length - 1].endIndex : 0;
    return {
      version: Date.now(),
      lines,
      totalTextLength,
    };
  })()`;
}

function mirrorProjectionClearSource(): string {
  return `(() => {
    const caret = document.getElementById("jusi-neovim-mirror-caret");
    if (caret) {
      caret.style.display = "none";
    }
  })()`;
}

function mirrorSelectionClearSource(): string {
  return `(() => {
    const root = document.getElementById("jusi-neovim-mirror-selection");
    if (root) {
      root.replaceChildren();
    }
  })()`;
}

function webModeFrameSource(visible: boolean): string {
  return `(() => {
    const frame = document.getElementById("jusi-neovim-web-mode-frame");
    if (frame) {
      frame.remove();
    }
  })()`;
}

function pointerVisibilitySource(hidden: boolean): string {
  return `(() => {
    const id = "jusi-neovim-pointer-visibility";
    let style = document.getElementById(id);
    if (${hidden ? "true" : "false"}) {
      if (!style) {
        style = document.createElement("style");
        style.id = id;
        (document.head || document.documentElement).appendChild(style);
      }
      style.textContent = "html, body, * { cursor: none !important; }";
      return;
    }
    if (style) {
      style.remove();
    }
  })()`;
}

function mirrorSelectionProjectionSource(startIndex: number, endIndex: number): string {
  return `(() => {
    const indexMap = window.__jusiMirrorIndexMap || [];
    const startIndex = Math.max(0, Math.floor(${startIndex}));
    const endIndex = Math.max(startIndex, Math.floor(${endIndex}));
    const nearestMappedIndex = (start, direction) => {
      let cursor = Math.max(0, Math.min(start, indexMap.length - 1));
      while (cursor >= 0 && cursor < indexMap.length) {
        if (indexMap[cursor]) {
          return cursor;
        }
        cursor += direction;
      }
      return null;
    };
    const boundaryForIndex = (target, isEnd) => {
      if (indexMap.length === 0) {
        return null;
      }
      if (target <= 0) {
        const first = nearestMappedIndex(0, 1);
        return first === null ? null : indexMap[first];
      }
      if (target >= indexMap.length) {
        const last = nearestMappedIndex(indexMap.length - 1, -1);
        return last === null ? null : { node: indexMap[last].node, offset: indexMap[last].offset + 1 };
      }
      const mapped = indexMap[target];
      if (mapped) {
        return mapped;
      }
      if (isEnd) {
        const previous = nearestMappedIndex(target - 1, -1);
        return previous === null ? null : { node: indexMap[previous].node, offset: indexMap[previous].offset + 1 };
      }
      const next = nearestMappedIndex(target, 1);
      return next === null ? null : indexMap[next];
    };
    const ensureSelectionRoot = () => {
      let overlay = document.getElementById("jusi-neovim-mirror-overlay");
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "jusi-neovim-mirror-overlay";
        overlay.style.position = "fixed";
        overlay.style.left = "0px";
        overlay.style.top = "0px";
        overlay.style.width = "100vw";
        overlay.style.height = "100vh";
        overlay.style.overflow = "visible";
        overlay.style.pointerEvents = "none";
        overlay.style.zIndex = "2147483647";
        overlay.style.contain = "layout paint style";
        (document.body || document.documentElement).appendChild(overlay);
      }
      let root = document.getElementById("jusi-neovim-mirror-selection");
      if (!root) {
        root = document.createElement("div");
        root.id = "jusi-neovim-mirror-selection";
        root.style.position = "absolute";
        root.style.left = "0px";
        root.style.top = "0px";
        root.style.width = "100vw";
        root.style.height = "100vh";
        root.style.pointerEvents = "none";
        overlay.insertBefore(root, overlay.firstChild);
      }
      return root;
    };
    const root = ensureSelectionRoot();
    root.replaceChildren();
    if (endIndex <= startIndex) {
      return 0;
    }
    const start = boundaryForIndex(startIndex, false);
    const end = boundaryForIndex(endIndex, true);
    if (!start || !end || !start.node || !end.node) {
      return 0;
    }
    const range = document.createRange();
    try {
      range.setStart(start.node, Math.max(0, Math.min(start.offset, start.node.length)));
      range.setEnd(end.node, Math.max(0, Math.min(end.offset, end.node.length)));
    } catch (_error) {
      range.detach();
      return 0;
    }
    const rects = Array.from(range.getClientRects());
    let count = 0;
    for (const rect of rects) {
      if (rect.width <= 0 || rect.height <= 0) {
        continue;
      }
      const node = document.createElement("div");
      node.style.position = "absolute";
      node.style.left = Math.round(rect.left) + "px";
      node.style.top = Math.round(rect.top) + "px";
      node.style.width = Math.max(1, Math.round(rect.width)) + "px";
      node.style.height = Math.max(1, Math.round(rect.height)) + "px";
      node.style.background = "rgba(70, 130, 255, 0.36)";
      node.style.outline = "1px solid rgba(70, 130, 255, 0.22)";
      root.appendChild(node);
      count += 1;
    }
    range.detach();
    return count;
  })()`;
}

function mirrorProjectionSource(index: number, autoScroll: boolean): string {
  return `(() => {
    const indexMap = window.__jusiMirrorIndexMap || [];
    const requestedIndex = Math.max(0, Math.floor(${index}));
    const shouldAutoScroll = ${autoScroll ? "true" : "false"};
    const nearestMappedIndex = (start, direction) => {
      let cursor = Math.max(0, Math.min(start, indexMap.length - 1));
      while (cursor >= 0 && cursor < indexMap.length) {
        if (indexMap[cursor]) {
          return cursor;
        }
        cursor += direction;
      }
      return null;
    };
    const boundaryForIndex = (target) => {
      if (indexMap.length === 0) {
        return null;
      }
      if (target <= 0) {
        const first = nearestMappedIndex(0, 1);
        return first === null ? null : indexMap[first];
      }
      if (target >= indexMap.length) {
        const last = nearestMappedIndex(indexMap.length - 1, -1);
        return last === null ? null : { node: indexMap[last].node, offset: indexMap[last].offset + 1 };
      }
      const mapped = indexMap[target];
      if (mapped) {
        return mapped;
      }
      const previous = nearestMappedIndex(target - 1, -1);
      if (previous !== null) {
        return { node: indexMap[previous].node, offset: indexMap[previous].offset + 1 };
      }
      const next = nearestMappedIndex(target, 1);
      return next === null ? null : indexMap[next];
    };
    const boundary = boundaryForIndex(requestedIndex);
    if (!boundary || !boundary.node || boundary.node.nodeType !== Node.TEXT_NODE) {
      return null;
    }
    const ensureCaret = () => {
      let root = document.getElementById("jusi-neovim-mirror-overlay");
      if (!root) {
        root = document.createElement("div");
        root.id = "jusi-neovim-mirror-overlay";
        root.style.position = "fixed";
        root.style.left = "0px";
        root.style.top = "0px";
        root.style.width = "100vw";
        root.style.height = "100vh";
        root.style.overflow = "visible";
        root.style.pointerEvents = "none";
        root.style.zIndex = "2147483647";
        root.style.contain = "layout paint style";
        (document.body || document.documentElement).appendChild(root);
      }
      let caret = document.getElementById("jusi-neovim-mirror-caret");
      if (!caret) {
        caret = document.createElement("div");
        caret.id = "jusi-neovim-mirror-caret";
        caret.style.position = "absolute";
        caret.style.boxSizing = "border-box";
        caret.style.border = "1px solid #4f7cff";
        caret.style.background = "rgba(79, 124, 255, 0.2)";
        caret.style.boxShadow = "0 0 0 1px rgba(255,255,255,0.55), 0 0 6px rgba(79,124,255,0.45)";
        caret.style.pointerEvents = "none";
        root.appendChild(caret);
      }
      return caret;
    };
    const rectForBoundary = () => {
      const textNode = boundary.node;
      const offset = Math.max(0, Math.min(boundary.offset, textNode.length));
      const range = document.createRange();
      let rect = null;
      try {
        range.setStart(textNode, offset);
        range.setEnd(textNode, Math.min(offset + 1, textNode.length));
        const rects = range.getClientRects();
        for (const candidate of Array.from(rects)) {
          if (candidate.width > 0 || candidate.height > 0) {
            rect = candidate;
            break;
          }
        }
        if (!rect) {
          const candidate = range.getBoundingClientRect();
          if (candidate && (candidate.width > 0 || candidate.height > 0)) {
            rect = candidate;
          }
        }
      } catch (_error) {
        rect = null;
      } finally {
        range.detach();
      }
      return rect;
    };
    const scrollingElement = () => document.scrollingElement || document.documentElement || document.body;
    const canScrollElement = (element, axis) => {
      if (!element || element.nodeType !== Node.ELEMENT_NODE) {
        return false;
      }
      const style = window.getComputedStyle(element);
      const overflow = axis === "y" ? style.overflowY : style.overflowX;
      if (!["auto", "scroll", "overlay"].includes(overflow)) {
        return false;
      }
      return axis === "y"
        ? element.scrollHeight > element.clientHeight + 1
        : element.scrollWidth > element.clientWidth + 1;
    };
    const scrollCandidates = (axis) => {
      const candidates = [];
      let element = boundary.node.parentElement;
      while (element && element !== document.documentElement) {
        if (canScrollElement(element, axis)) {
          candidates.push(element);
        }
        element = element.parentElement;
      }
      candidates.push(window);
      return candidates;
    };
    const scrollBounds = (candidate) => {
      if (candidate === window) {
        return {
          top: 0,
          left: 0,
          bottom: window.innerHeight,
          right: window.innerWidth,
          width: window.innerWidth,
          height: window.innerHeight,
        };
      }
      const bounds = candidate.getBoundingClientRect();
      return {
        top: bounds.top,
        left: bounds.left,
        bottom: bounds.bottom,
        right: bounds.right,
        width: bounds.width,
        height: bounds.height,
      };
    };
    const deltaForAxis = (rect, bounds, axis) => {
      if (axis === "y") {
        const margin = Math.min(Math.max(18, (rect.height || window.__jusiMirrorLineHeight || 16) * 2), Math.max(0, bounds.height / 3));
        if (rect.top < bounds.top + margin) {
          return rect.top - (bounds.top + margin);
        }
        if (rect.bottom > bounds.bottom - margin) {
          return rect.bottom - (bounds.bottom - margin);
        }
        return 0;
      }
      const margin = Math.min(18, Math.max(0, bounds.width / 4));
      if (rect.left < bounds.left + margin) {
        return rect.left - (bounds.left + margin);
      }
      if (rect.right > bounds.right - margin) {
        return rect.right - (bounds.right - margin);
      }
      return 0;
    };
    const applyScroll = (candidate, axis, delta) => {
      if (!delta) {
        return false;
      }
      if (candidate === window) {
        const root = scrollingElement();
        const oldX = window.scrollX;
        const oldY = window.scrollY;
        const maxX = Math.max(0, root.scrollWidth - window.innerWidth);
        const maxY = Math.max(0, root.scrollHeight - window.innerHeight);
        const nextX = axis === "x" ? Math.max(0, Math.min(maxX, oldX + delta)) : oldX;
        const nextY = axis === "y" ? Math.max(0, Math.min(maxY, oldY + delta)) : oldY;
        if (Math.abs(nextX - oldX) < 0.5 && Math.abs(nextY - oldY) < 0.5) {
          return false;
        }
        window.scrollTo(nextX, nextY);
        return true;
      }
      if (axis === "y") {
        const old = candidate.scrollTop;
        const max = Math.max(0, candidate.scrollHeight - candidate.clientHeight);
        const next = Math.max(0, Math.min(max, old + delta));
        if (Math.abs(next - old) < 0.5) {
          return false;
        }
        candidate.scrollTop = next;
        return true;
      }
      const old = candidate.scrollLeft;
      const max = Math.max(0, candidate.scrollWidth - candidate.clientWidth);
      const next = Math.max(0, Math.min(max, old + delta));
      if (Math.abs(next - old) < 0.5) {
        return false;
      }
      candidate.scrollLeft = next;
      return true;
    };
    const scrollAxisIntoView = (rect, axis) => {
      for (const candidate of scrollCandidates(axis)) {
        const bounds = scrollBounds(candidate);
        const delta = deltaForAxis(rect, bounds, axis);
        if (applyScroll(candidate, axis, delta)) {
          return true;
        }
      }
      return false;
    };
    const scrollIntoView = (rect) => {
      if (!shouldAutoScroll || !rect) {
        return rect;
      }
      const movedY = scrollAxisIntoView(rect, "y");
      const movedX = scrollAxisIntoView(movedY ? rectForBoundary() || rect : rect, "x");
      if (movedX || movedY) {
        return rectForBoundary();
      }
      return rect;
    };
    let rect = scrollIntoView(rectForBoundary());
    if (!rect) {
      const caret = document.getElementById("jusi-neovim-mirror-caret");
      if (caret) {
        caret.style.display = "none";
      }
      return null;
    }
    const caret = ensureCaret();
    caret.style.display = "block";
    caret.style.left = Math.round(rect.left) + "px";
    caret.style.top = Math.round(rect.top) + "px";
    caret.style.width = Math.max(3, Math.round(rect.width || 8)) + "px";
    caret.style.height = Math.max(2, Math.round(rect.height || 16)) + "px";
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
  })()`;
}

function mirrorScrollSource(lines: number, index: number | null): string {
  return `(() => {
    const requestedIndex = ${index === null ? "null" : Math.max(0, Math.floor(index))};
    const indexMap = window.__jusiMirrorIndexMap || [];
    const lineHeight = Number(window.__jusiMirrorLineHeight) || (() => {
      const style = window.getComputedStyle(document.body || document.documentElement);
      const parsed = Number.parseFloat(style.lineHeight);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 16;
    })();
    const nearestMappedIndex = (start, direction) => {
      let cursor = Math.max(0, Math.min(start, indexMap.length - 1));
      while (cursor >= 0 && cursor < indexMap.length) {
        if (indexMap[cursor]) {
          return cursor;
        }
        cursor += direction;
      }
      return null;
    };
    const boundaryForIndex = (target) => {
      if (target === null || indexMap.length === 0) {
        return null;
      }
      if (target <= 0) {
        const first = nearestMappedIndex(0, 1);
        return first === null ? null : indexMap[first];
      }
      if (target >= indexMap.length) {
        const last = nearestMappedIndex(indexMap.length - 1, -1);
        return last === null ? null : indexMap[last];
      }
      const mapped = indexMap[target];
      if (mapped) {
        return mapped;
      }
      const next = nearestMappedIndex(target, 1);
      if (next !== null) {
        return indexMap[next];
      }
      const previous = nearestMappedIndex(target - 1, -1);
      return previous === null ? null : indexMap[previous];
    };
    const canScrollElement = (element) => {
      if (!element || element.nodeType !== Node.ELEMENT_NODE) {
        return false;
      }
      const style = window.getComputedStyle(element);
      if (!["auto", "scroll", "overlay"].includes(style.overflowY)) {
        return false;
      }
      return element.scrollHeight > element.clientHeight + 1;
    };
    const delta = ${lines} * lineHeight;
    const tryScrollElement = (element) => {
      const old = element.scrollTop;
      const max = Math.max(0, element.scrollHeight - element.clientHeight);
      const next = Math.max(0, Math.min(max, old + delta));
      if (Math.abs(next - old) < 0.5) {
        return false;
      }
      element.scrollTop = next;
      return true;
    };
    const boundary = boundaryForIndex(requestedIndex);
    let element = boundary && boundary.node ? boundary.node.parentElement : null;
    while (element && element !== document.documentElement) {
      if (canScrollElement(element) && tryScrollElement(element)) {
        return element.scrollTop;
      }
      element = element.parentElement;
    }
    const root = document.scrollingElement || document.documentElement || document.body;
    const old = window.scrollY;
    const max = Math.max(0, root.scrollHeight - window.innerHeight);
    const next = Math.max(0, Math.min(max, old + delta));
    if (Math.abs(next - old) >= 0.5) {
      window.scrollTo(window.scrollX, next);
    }
    return window.scrollY;
  })()`;
}

function mirrorClickIndexSource(x: number, y: number): string {
  return `(() => {
    const x = ${x};
    const y = ${y};
    const indexMap = window.__jusiMirrorIndexMap || [];
    const rangeFromPoint = () => {
      if (typeof document.caretRangeFromPoint === "function") {
        return document.caretRangeFromPoint(x, y);
      }
      if (typeof document.caretPositionFromPoint === "function") {
        const position = document.caretPositionFromPoint(x, y);
        if (!position) {
          return null;
        }
        const range = document.createRange();
        range.setStart(position.offsetNode, position.offset);
        range.collapse(true);
        return range;
      }
      return null;
    };
    const range = rangeFromPoint();
    if (!range) {
      return null;
    }
    let node = range.startContainer;
    let offset = range.startOffset;
    range.detach?.();
    if (!node) {
      return null;
    }
    if (node.nodeType !== Node.TEXT_NODE) {
      const child = node.childNodes ? node.childNodes[Math.min(offset, node.childNodes.length - 1)] : null;
      if (child && child.nodeType === Node.TEXT_NODE) {
        node = child;
        offset = 0;
      } else {
        return null;
      }
    }
    let bestPrevious = null;
    let bestNext = null;
    for (let index = 0; index < indexMap.length; index += 1) {
      const entry = indexMap[index];
      if (!entry || entry.node !== node) {
        continue;
      }
      if (entry.offset <= offset) {
        const distance = offset - entry.offset;
        if (!bestPrevious || distance < bestPrevious.distance) {
          bestPrevious = { index, distance };
        }
      } else {
        const distance = entry.offset - offset;
        if (!bestNext || distance < bestNext.distance) {
          bestNext = { index, distance };
        }
      }
    }
    return bestPrevious ? bestPrevious.index : bestNext ? bestNext.index : null;
  })()`;
}

function mirrorLinkTargetSource(index: number): string {
  return `(() => {
    const indexMap = window.__jusiMirrorIndexMap || [];
    const requestedIndex = Math.max(0, Math.floor(${index}));
    const nearestMappedIndex = (start, direction) => {
      let cursor = Math.max(0, Math.min(start, indexMap.length - 1));
      while (cursor >= 0 && cursor < indexMap.length) {
        if (indexMap[cursor]) {
          return cursor;
        }
        cursor += direction;
      }
      return null;
    };
    const targetIndex = indexMap[requestedIndex] ? requestedIndex : nearestMappedIndex(requestedIndex, -1) ?? nearestMappedIndex(requestedIndex, 1);
    if (targetIndex === null || !indexMap[targetIndex] || !indexMap[targetIndex].node) {
      return false;
    }
    let element = indexMap[targetIndex].node.parentElement;
    const link = element && element.closest ? element.closest("a[href], area[href]") : null;
    if (!link) {
      return null;
    }
    const rects = Array.from(link.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const visibleRect = rects.find((rect) =>
      rect.right > 0 && rect.bottom > 0 && rect.left < viewportWidth && rect.top < viewportHeight
    ) || rects[0];
    if (!visibleRect) {
      return null;
    }
    return {
      href: typeof link.href === "string" ? link.href : null,
      x: Math.max(0, Math.floor(visibleRect.left + Math.min(visibleRect.width / 2, Math.max(1, visibleRect.width - 1)))),
      y: Math.max(0, Math.floor(visibleRect.top + Math.min(visibleRect.height / 2, Math.max(1, visibleRect.height - 1)))),
    };
  })()`;
}

function mirrorActivateLinkSource(index: number): string {
  return `(() => {
    const indexMap = window.__jusiMirrorIndexMap || [];
    const requestedIndex = Math.max(0, Math.floor(${index}));
    const nearestMappedIndex = (start, direction) => {
      let cursor = Math.max(0, Math.min(start, indexMap.length - 1));
      while (cursor >= 0 && cursor < indexMap.length) {
        if (indexMap[cursor]) {
          return cursor;
        }
        cursor += direction;
      }
      return null;
    };
    const targetIndex = indexMap[requestedIndex] ? requestedIndex : nearestMappedIndex(requestedIndex, -1) ?? nearestMappedIndex(requestedIndex, 1);
    if (targetIndex === null || !indexMap[targetIndex] || !indexMap[targetIndex].node) {
      return false;
    }
    const element = indexMap[targetIndex].node.parentElement;
    const link = element && element.closest ? element.closest("a[href], area[href]") : null;
    if (!link) {
      return false;
    }
    link.click();
    return true;
  })()`;
}

function mirrorHash(mirror: MirrorDocument): string {
  return mirror.lines.map((line) => line.text).join("\n");
}

async function refreshMirror(host: HTMLDivElement): Promise<void> {
  const startedAt = performance.now();
  const bufferId = Number(host.dataset.bufferId);
  const browser = host.querySelector("webview") as (HTMLElement & { executeJavaScript?: (code: string) => Promise<unknown> }) | null;
  if (!Number.isFinite(bufferId) || !browser || typeof browser.executeJavaScript !== "function") {
    return;
  }
  try {
    const mirror = await browser.executeJavaScript(mirrorExtractorSource()) as MirrorDocument;
    const hash = mirrorHash(mirror);
    if (mirrorHashes.get(bufferId) === hash) {
      return;
    }
    const version = (mirrorVersions.get(bufferId) ?? 0) + 1;
    mirror.version = version;
    mirrorVersions.set(bufferId, version);
    mirrorHashes.set(bufferId, hash);
    await window.jusi.updateWebMirror(bufferId, mirror);
    perfLog({
      kind: "mirror-refresh",
      bufferId,
      ms: roundMs(performance.now() - startedAt),
      lines: mirror.lines.length,
      chars: mirror.totalTextLength,
    });
  } catch (error) {
    console.warn("[mirror-refresh-failed]", error);
    perfLog({
      kind: "mirror-refresh-error",
      bufferId: Number.isFinite(bufferId) ? bufferId : null,
      ms: roundMs(performance.now() - startedAt),
    });
  }
}

function scheduleMirrorRefresh(host: HTMLDivElement): void {
  const bufferId = Number(host.dataset.bufferId);
  if (!Number.isFinite(bufferId)) {
    return;
  }
  const existing = mirrorTimers.get(bufferId);
  if (existing) {
    clearTimeout(existing);
  }
  mirrorTimers.set(bufferId, setTimeout(() => {
    mirrorTimers.delete(bufferId);
    void refreshMirror(host);
  }, 250));
}

function scheduleMirrorProjection(host: HTMLDivElement, delay: number, autoScroll = true, force = false): void {
  const bufferId = Number(host.dataset.bufferId);
  if (!Number.isFinite(bufferId)) {
    return;
  }
  const existing = mirrorProjectionTimers.get(bufferId);
  if (existing) {
    clearTimeout(existing);
  }
  mirrorProjectionTimers.set(bufferId, setTimeout(() => {
    mirrorProjectionTimers.delete(bufferId);
    const view = latestAttachedViews.get(bufferId);
    if (!view || !latestState) {
      return;
    }
    const activeTab = latestState.snapshot.tabs.find((tab) => tab.id === latestState?.snapshot.currentTabId);
    void projectMirrorCursor(host, view, view.windowId === activeTab?.currentWindowId ? view.cursor ?? null : null, autoScroll, force);
  }, delay));
}

function mirrorPositionForIndex(mirror: MirrorDocument, index: number): { row: number; col: number } | null {
  if (mirror.lines.length === 0) {
    return null;
  }
  const target = Math.max(0, Math.floor(index));
  for (const line of mirror.lines) {
    if (target <= line.endIndex) {
      return {
        row: line.lineNumber,
        col: Math.max(0, Math.min(line.text.length, target - line.startIndex)),
      };
    }
  }
  const last = mirror.lines[mirror.lines.length - 1];
  return {
    row: last.lineNumber,
    col: last.text.length,
  };
}

function mirrorIndexForPosition(
  mirror: MirrorDocument,
  position: { row: number; col: number },
  endInclusive = false,
): number | null {
  const line = mirror.lines[position.row];
  if (!line) {
    return null;
  }
  const col = Math.max(0, Math.min(position.col, line.text.length));
  return line.startIndex + col + (endInclusive && col < line.text.length ? 1 : 0);
}

async function moveMirrorCursorToClick(host: HTMLDivElement, event: MouseEvent): Promise<void> {
  const bufferId = Number(host.dataset.bufferId);
  const view = Number.isFinite(bufferId) ? latestAttachedViews.get(bufferId) : null;
  const browser = host.querySelector("webview") as HTMLElement | null;
  const executableBrowser = browser as (HTMLElement & { executeJavaScript?: (code: string) => Promise<unknown> }) | null;
  if (!view || !view.mirror || !browser || !executableBrowser || typeof executableBrowser.executeJavaScript !== "function") {
    return;
  }

  await window.jusi.focusWindow(view.windowId);

  if (browser.dataset.domReady !== "1") {
    return;
  }

  const rect = browser.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  let index: number | null = null;
  try {
    index = await executableBrowser.executeJavaScript(mirrorClickIndexSource(x, y)) as number | null;
  } catch (_error) {
    return;
  }
  if (typeof index !== "number" || !Number.isFinite(index)) {
    return;
  }
  const position = mirrorPositionForIndex(view.mirror, index);
  if (!position) {
    return;
  }
  await window.jusi.setCursor(view.windowId, position.row, position.col);
}

async function handleWebScroll(event: { bufferId: number; windowId: number; lines: number }): Promise<void> {
  const host = persistentViews.get(event.bufferId);
  const view = latestAttachedViews.get(event.bufferId);
  const browser = host?.querySelector("webview") as HTMLElement | null;
  const executableBrowser = browser as (HTMLElement & { executeJavaScript?: (code: string) => Promise<unknown> }) | null;
  if (
    !host ||
    !view ||
    view.windowId !== event.windowId ||
    !browser ||
    browser.dataset.domReady !== "1" ||
    !executableBrowser ||
    typeof executableBrowser.executeJavaScript !== "function"
  ) {
    return;
  }

  let index: number | null = null;
  if (view.cursor && view.mirror) {
    const line = view.mirror.lines[view.cursor.row];
    if (line) {
      index = line.startIndex + Math.max(0, Math.min(view.cursor.col, line.text.length));
    }
  }
  try {
    await executableBrowser.executeJavaScript(mirrorScrollSource(event.lines, index));
  } catch (_error) {
    return;
  }
  await projectMirrorCursor(host, view, view.cursor ?? null, false, true);
}

async function handleWebOpenLink(event: { bufferId: number; windowId: number }): Promise<void> {
  const host = persistentViews.get(event.bufferId);
  const view = latestAttachedViews.get(event.bufferId);
  const browser = host?.querySelector("webview") as HTMLElement | null;
  const executableBrowser = browser as (HTMLElement & { executeJavaScript?: (code: string) => Promise<unknown> }) | null;
  if (
    !host ||
    !view ||
    view.windowId !== event.windowId ||
    !view.cursor ||
    !view.mirror ||
    !browser ||
    browser.dataset.domReady !== "1" ||
    !executableBrowser ||
    typeof executableBrowser.executeJavaScript !== "function"
  ) {
    return;
  }

  const line = view.mirror.lines[view.cursor.row];
  if (!line) {
    return;
  }
  const index = line.startIndex + Math.max(0, Math.min(view.cursor.col, line.text.length));
  try {
    const target = await executableBrowser.executeJavaScript(mirrorLinkTargetSource(index)) as { href?: string | null } | null;
    const navigationBrowser = browser as HTMLElement & {
      loadURL?: (url: string) => void;
    };
    if (!target) {
      return;
    }
    const href = typeof target.href === "string" ? target.href : "";
    if (href !== "" && !href.toLowerCase().startsWith("javascript:") && typeof navigationBrowser.loadURL === "function") {
      navigationBrowser.loadURL(href);
      return;
    }
    await executableBrowser.executeJavaScript(mirrorActivateLinkSource(index));
  } catch (_error) {
    return;
  }
}

async function handleWebEnterMode(event: { bufferId: number; windowId: number }): Promise<void> {
  const host = persistentViews.get(event.bufferId);
  const view = latestAttachedViews.get(event.bufferId);
  const browser = host?.querySelector("webview") as (HTMLElement & { focus?: () => void }) | null;
  if (!host || !view || view.windowId !== event.windowId || !browser) {
    return;
  }
  setWebMode(event.bufferId);
  browser.focus?.();
  await projectMirrorCursor(host, view, view.cursor ?? null, false, true);
}

async function projectMirrorSelection(host: HTMLDivElement, view: AttachedWebView): Promise<void> {
  const startedAt = performance.now();
  const bufferId = Number(host.dataset.bufferId);
  const browser = host.querySelector("webview") as HTMLElement | null;
  const executableBrowser = browser as (HTMLElement & { executeJavaScript?: (code: string) => Promise<unknown> }) | null;
  if (!browser || !executableBrowser || typeof executableBrowser.executeJavaScript !== "function") {
    return;
  }
  if (browser.dataset.domReady !== "1") {
    return;
  }

  if (!view.mirror || !view.selection) {
    if (Number.isFinite(bufferId) && mirrorSelectionSignatures.get(bufferId) === "clear") {
      return;
    }
    try {
      await executableBrowser.executeJavaScript(mirrorSelectionClearSource());
      if (Number.isFinite(bufferId)) {
        mirrorSelectionSignatures.set(bufferId, "clear");
      }
    } catch (_error) {
      // The webview can become temporarily non-executable while Electron swaps pages.
    }
    return;
  }

  const startLine = view.mirror.lines[view.selection.start.row];
  const endLine = view.mirror.lines[view.selection.end.row];
  if (!startLine || !endLine) {
    if (Number.isFinite(bufferId) && mirrorSelectionSignatures.get(bufferId) === "clear") {
      return;
    }
    try {
      await executableBrowser.executeJavaScript(mirrorSelectionClearSource());
      if (Number.isFinite(bufferId)) {
        mirrorSelectionSignatures.set(bufferId, "clear");
      }
    } catch (_error) {
      // The webview can become temporarily non-executable while Electron swaps pages.
    }
    return;
  }

  let startIndex = view.selection.linewise
    ? startLine.startIndex
    : mirrorIndexForPosition(view.mirror, view.selection.start) ?? startLine.startIndex;
  let endIndex = view.selection.linewise
    ? endLine.endIndex
    : mirrorIndexForPosition(view.mirror, view.selection.end, true) ?? endLine.endIndex;

  if (endIndex < startIndex) {
    const tmp = startIndex;
    startIndex = endIndex;
    endIndex = tmp;
  }

  const signature = `${view.mirror.version}:${startIndex}:${endIndex}:${view.selection.linewise ? 1 : 0}`;
  if (Number.isFinite(bufferId) && mirrorSelectionSignatures.get(bufferId) === signature) {
    return;
  }

  try {
    await executableBrowser.executeJavaScript(mirrorSelectionProjectionSource(startIndex, endIndex));
    if (Number.isFinite(bufferId)) {
      mirrorSelectionSignatures.set(bufferId, signature);
    }
    const elapsed = performance.now() - startedAt;
    if (elapsed >= 15) {
      perfLog({
        kind: "mirror-selection",
        bufferId,
        ms: roundMs(elapsed),
        selectedChars: Math.abs(endIndex - startIndex),
      });
    }
  } catch (_error) {
    return;
  }
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
    browser.dataset.domReady = "0";
    webModeFrameStates.delete(view.bufferId);
    mirrorCursorSignatures.delete(view.bufferId);
    mirrorSelectionSignatures.delete(view.bufferId);
    browser.src = view.url;
  }
}

async function projectMirrorCursor(
  host: HTMLDivElement,
  view: AttachedWebView,
  cursor: { row: number; col: number } | null,
  autoScroll = true,
  force = false,
): Promise<void> {
  const startedAt = performance.now();
  const bufferId = Number(host.dataset.bufferId);
  const marker = host.querySelector(".web-view-box__mirror-cursor") as HTMLElement | null;
  if (!marker) {
    return;
  }
  marker.classList.remove("web-view-box__mirror-cursor--visible");
  const browser = host.querySelector("webview") as HTMLElement | null;
  const executableBrowser = browser as (HTMLElement & { executeJavaScript?: (code: string) => Promise<unknown> }) | null;
  if (!browser || !executableBrowser || typeof executableBrowser.executeJavaScript !== "function") {
    return;
  }
  if (browser.dataset.domReady !== "1") {
    return;
  }

  if (!cursor || !view.mirror) {
    if (!force && Number.isFinite(bufferId) && mirrorCursorSignatures.get(bufferId) === "clear") {
      return;
    }
    try {
      await executableBrowser.executeJavaScript(mirrorProjectionClearSource());
      if (Number.isFinite(bufferId)) {
        mirrorCursorSignatures.set(bufferId, "clear");
      }
    } catch (_error) {
      // The webview can become temporarily non-executable while Electron swaps pages.
    }
    return;
  }
  const line = view.mirror.lines[cursor.row];
  if (!line) {
    if (!force && Number.isFinite(bufferId) && mirrorCursorSignatures.get(bufferId) === "clear") {
      return;
    }
    try {
      await executableBrowser.executeJavaScript(mirrorProjectionClearSource());
      if (Number.isFinite(bufferId)) {
        mirrorCursorSignatures.set(bufferId, "clear");
      }
    } catch (_error) {
      // The webview can become temporarily non-executable while Electron swaps pages.
    }
    return;
  }
  const col = Math.max(0, Math.min(cursor.col, line.text.length));
  const index = line.startIndex + col;
  const signature = `${view.mirror.version}:${index}:${autoScroll ? 1 : 0}`;
  if (!force && Number.isFinite(bufferId) && mirrorCursorSignatures.get(bufferId) === signature) {
    return;
  }

  const token = (mirrorProjectionTokens.get(view.bufferId) ?? 0) + 1;
  mirrorProjectionTokens.set(view.bufferId, token);
  let rect: { x: number; y: number; width: number; height: number } | null = null;
  try {
    rect = await executableBrowser.executeJavaScript(
      mirrorProjectionSource(index, autoScroll),
    ) as { x: number; y: number; width: number; height: number } | null;
  } catch (_error) {
    return;
  }
  if (mirrorProjectionTokens.get(view.bufferId) !== token || !rect) {
    try {
      await executableBrowser.executeJavaScript(mirrorProjectionClearSource());
      if (Number.isFinite(bufferId)) {
        mirrorCursorSignatures.set(bufferId, "clear");
      }
    } catch (_error) {
      // The webview can become temporarily non-executable while Electron swaps pages.
    }
    return;
  }
  if (Number.isFinite(bufferId)) {
    mirrorCursorSignatures.set(bufferId, signature);
  }
  const elapsed = performance.now() - startedAt;
  if (elapsed >= 15) {
    perfLog({
      kind: "mirror-cursor",
      bufferId,
      ms: roundMs(elapsed),
      autoScroll,
      forced: force,
      row: cursor.row,
      col: cursor.col,
    });
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
    latestAttachedViews.set(view.bufferId, view);
    const host = ensureViewHost(view);
    host.classList.toggle("web-view-box--active", view.windowId === activeWindowId);
    host.classList.toggle("web-view-box--web-mode", webModeBufferId === view.bufferId);
    void applyWebModeFrame(host, webModeBufferId === view.bufferId, webModeBufferId === null);
    host.style.zIndex = String(100 + ((view.gridBounds?.zIndex ?? 0) * 1000) + (view.gridBounds?.compIndex ?? 0));
    updateViewHost(host, view);
    placeViewHost(host, view);
    void projectMirrorCursor(host, view, view.windowId === activeWindowId ? view.cursor ?? null : null);
    void projectMirrorSelection(host, view.windowId === activeWindowId ? view : { ...view, selection: undefined });
    if (host.parentElement !== root) {
      root.appendChild(host);
    }
  }

  for (const [bufferId, host] of persistentViews.entries()) {
    if (active.has(bufferId)) {
      continue;
    }
    latestAttachedViews.delete(bufferId);
    if (host.parentElement !== root) {
      root.appendChild(host);
    }
    void applyWebModeFrame(host, false);
    void projectMirrorCursor(host, {
      bufferId,
      windowId: 0,
      tabId: null,
      url: "",
    }, null);
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
    persistentGridLayers.delete(gridId);
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
    persistentFrames.delete(windowId);
  }
}

function renderMessageLayers(state: RendererSessionState): void {
  const commandTop = terminalGridHeight(state);
  const messageLayer = document.getElementById("message-layer");
  if (messageLayer) {
    (messageLayer as HTMLElement).style.bottom = "auto";
    (messageLayer as HTMLElement).style.top = `${commandTop}px`;
    (messageLayer as HTMLElement).style.height = `${cellHeight}px`;
    (messageLayer as HTMLElement).style.overflow = "hidden";
    messageLayer.innerHTML = "";
    const visibleEntries = visibleMessageEntries(state);
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
    const statusElement = statusLayer as HTMLElement;
    statusElement.style.bottom = "auto";
    statusElement.style.top = `${commandTop}px`;
    statusElement.style.height = `${cellHeight}px`;
    statusElement.style.lineHeight = `${cellHeight}px`;
    statusElement.style.fontSize = `${terminalFontSize}px`;
    const showmodeSlot = document.createElement("div");
    showmodeSlot.dataset.role = "showmode";
    const showcmdSlot = document.createElement("div");
    showcmdSlot.className = "message-status__center";
    showcmdSlot.dataset.role = "showcmd";
    const rulerSlot = document.createElement("div");
    rulerSlot.className = "message-status__right";
    rulerSlot.dataset.role = "ruler";
    statusLayer.replaceChildren(showmodeSlot, showcmdSlot, rulerSlot);
    const showmode = state.messages.showmode;
    const showcmd = state.messages.showcmd;
    const ruler = state.messages.ruler;
    const visible = !state.cmdline.visible && visibleMessageEntries(state).length === 0 && (showmode !== "" || showcmd !== "" || ruler !== "");
    if (visible) {
      showmodeSlot.textContent = showmode;
      showcmdSlot.textContent = showcmd;
      rulerSlot.textContent = ruler;
      statusLayer.classList.add("message-status-layer--visible");
    } else {
      statusLayer.classList.remove("message-status-layer--visible");
    }
  }

  const historyLayer = document.getElementById("message-history-layer");
  if (historyLayer) {
    historyLayer.innerHTML = "";
    historyLayer.classList.remove("message-history-layer--visible");
  }
}

function renderCmdlineBlock(state: RendererSessionState): void {
  const block = document.getElementById("cmdline-block-layer");
  if (!block) {
    return;
  }

  const blockElement = block as HTMLElement;
  const lines = visibleCmdlineBlockLines(state);
  const blockHeight = lines.length * cellHeight;
  blockElement.style.top = `${Math.max(0, terminalGridHeight(state) - blockHeight)}px`;
  blockElement.style.bottom = "auto";
  blockElement.style.height = `${blockHeight}px`;
  blockElement.style.maxHeight = `${Math.max(0, state.screen.rows * cellHeight)}px`;
  blockElement.style.overflow = "hidden";
  block.innerHTML = "";
  if (lines.length === 0) {
    block.classList.remove("cmdline-block-layer--visible");
    return;
  }

  lines.forEach((line) => {
    const row = document.createElement("div");
    row.className = "cmdline-block-line";
    row.style.height = `${cellHeight}px`;
    row.style.lineHeight = `${cellHeight}px`;
    row.textContent = line;
    block.appendChild(row);
  });
  block.classList.add("cmdline-block-layer--visible");
}

function layoutTerminalSurfaces(state: RendererSessionState): void {
  const gridHeight = terminalGridHeight(state);
  for (const id of ["terminal-screen", "grid-layer-root", "window-frame-layer", "web-view-layer"]) {
    const element = document.getElementById(id);
    if (element instanceof HTMLElement) {
      element.style.bottom = "auto";
      element.style.height = `${gridHeight}px`;
    }
  }
}

function renderState(state: RendererSessionState): void {
  const renderStartedAt = performance.now();
  latestState = state;
  syncMessagePagerState(state);
  const activeTab = state.snapshot.tabs.find((tab) => tab.id === state.snapshot.currentTabId);
  syncWebModeToState(state);
  document.body.dataset.currentTabId = String(state.snapshot.currentTabId ?? "");
  document.body.dataset.activeWindowId = String(activeTab?.currentWindowId ?? "");

  measureCellMetrics();
  const background = state.screen.backgroundColor ?? "#16161d";
  const foreground = resolveDefaultForeground(background, state.screen.foregroundColor);
  document.documentElement.style.setProperty("--bg", background);
  document.documentElement.style.setProperty("--text", foreground);
  layoutTerminalSurfaces(state);

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
      windowKind(state, activeWindow) !== "web" &&
      (activeWindow.gridBounds ||
        (typeof activeWindow.row === "number" && typeof activeWindow.col === "number"))
    ) {
      const bounds = resolveWindowGridBounds(activeWindow);
      const row = bounds?.row ?? activeWindow.row!;
      const col = bounds?.col ?? activeWindow.col!;
      const cursorStyle = state.screen.mode.cursor;
      applyCursorStyle(
        cursor,
        cursorStyle,
        (col + activeGridCursor.col) * cellWidth,
        (row + activeGridCursor.row) * cellHeight,
        cursorColorForStyle(cursorStyle, state.screen.highlights, { foreground, background }),
      );
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
    const cmdlineElement = cmdline as HTMLElement;
    cmdlineElement.style.top = `${terminalGridHeight(state)}px`;
    cmdlineElement.style.bottom = "auto";
    cmdlineElement.style.height = `${cellHeight}px`;
    cmdlineElement.style.minHeight = `${cellHeight}px`;
    cmdlineElement.style.lineHeight = `${cellHeight}px`;
    cmdlineElement.style.fontSize = `${terminalFontSize}px`;
    if (state.cmdline.visible) {
      const stage = document.querySelector(".stage");
      const maxColumns = stage instanceof HTMLElement ? Math.floor(stage.clientWidth / cellWidth) : state.screen.cols;
      const view = formatCmdline(state.cmdline, maxColumns);
      cmdline.textContent = view.text;
      const commandCursor = document.createElement("span");
      commandCursor.className = "cmdline-cursor";
      const cursorStyle = state.screen.mode.cursor;
      applyCursorStyle(
        commandCursor,
        cursorStyle,
        view.cursorColumn * cellWidth,
        0,
        cursorColorForStyle(cursorStyle, state.screen.highlights, { foreground, background }),
      );
      cmdline.appendChild(commandCursor);
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
      const commandAreaTop = terminalGridHeight(state) - (visibleCmdlineBlockLines(state).length * cellHeight);
      popup.style.maxHeight = "";
      popup.style.maxWidth = "";
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
      const popupWidth = popup.getBoundingClientRect().width || 0;
      const placement = placePopupmenu({
        popupmenu: state.popupmenu,
        snapshot: state.snapshot,
        stage: { width: stageWidth, height: stageHeight, cellWidth, cellHeight },
        commandAreaHeight: commandHeight,
        commandAreaTop,
        popupHeight,
        popupWidth,
      });
      popup.style.left = `${placement.left}px`;
      popup.style.top = `${placement.top}px`;
      popup.style.maxHeight = placement.maxHeight === undefined ? "" : `${placement.maxHeight}px`;
      popup.style.maxWidth = placement.maxWidth === undefined ? "" : `${placement.maxWidth}px`;
      popup.querySelector(".popupmenu-item--selected")?.scrollIntoView({ block: "nearest" });
    } else {
      popup.classList.remove("popupmenu-layer--visible");
      popup.style.maxHeight = "";
      popup.style.maxWidth = "";
    }
  }

  renderMessageLayers(state);
  renderGridLayers(state);
  renderWindowFrames(state);
  renderAttachedViews(state.attachedWebViews);
  noteRenderPerf(state, performance.now() - renderStartedAt);
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
      setWebMode(null);
      void window.jusi.focusWindow(hit.id);
      event.preventDefault();
      event.stopPropagation();
    },
    true,
  );
}

function isWindowCommandFollower(key: string): boolean {
  return key.length === 1;
}

function isModifierOnlyKey(key: string): boolean {
  return key === "Shift" || key === "Control" || key === "Alt" || key === "Meta";
}

function isPhysicalKey(event: KeyboardEvent, code: string): boolean {
  return event.code === code;
}

function physicalCtrlNotation(event: KeyboardEvent): string | null {
  if (!event.ctrlKey || event.metaKey || event.altKey) {
    return null;
  }
  const match = /^Key([A-Z])$/.exec(event.code);
  if (match) {
    return match[1];
  }
  switch (event.code) {
    case "BracketLeft":
      return "[";
    case "BracketRight":
      return "]";
    case "Backslash":
      return "\\";
    case "Digit6":
      return "^";
    case "Minus":
      return "_";
    default:
      return null;
  }
}

function encodeLiteralKey(key: string): string | null {
  if (key === "<") {
    return "<lt>";
  }
  if (key.length === 1) {
    return key;
  }
  return null;
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
    if (event.ctrlKey && isPhysicalKey(event, "KeyW")) {
      consumePendingWindowCommand();
      return "<C-W><C-W>";
    }
    consumePendingWindowCommand();
    if (isWindowCommandFollower(event.key)) {
      const follower = encodeLiteralKey(event.key);
      return follower ? `<C-W>${follower}` : null;
    }
    if (event.key === "Escape") {
      return "<Esc>";
    }
    return null;
  }

  if (event.ctrlKey && isPhysicalKey(event, "KeyW")) {
    armPendingWindowCommand();
    return null;
  }

  const ctrlNotation = physicalCtrlNotation(event);
  if (ctrlNotation) {
    return `<C-${ctrlNotation}>`;
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
    if (event.key === "<") {
      return "<A-lt>";
    }
    if (event.key.length === 1) {
      return `<A-${event.key}>`;
    }
    return null;
  }

  return encodeLiteralKey(event.key);
}

function dismissCommandMessagePager(): void {
  if (!latestState) {
    return;
  }
  const signature = commandMessageSignature(latestState);
  if (!signature) {
    return;
  }
  messagePagerDismissedSignature = signature;
  messagePagerScroll = 0;
  scheduleRenderState(latestState);
}

async function dismissCommandMessagePagerWithInput(event: KeyboardEvent): Promise<void> {
  const shouldForward = latestState ? hasReturnPromptMessage(latestState) : false;
  dismissCommandMessagePager();
  if (!shouldForward) {
    return;
  }
  const encoded = encodeKey(event);
  if (encoded) {
    await window.jusi.sendInput(encoded);
  }
}

function scrollCommandMessagePager(delta: number): void {
  if (!latestState) {
    return;
  }
  const maxRows = Math.max(1, latestState.screen.rows);
  const maxScroll = Math.max(0, commandMessageBlockLines(latestState).length - maxRows);
  messagePagerScroll = Math.max(0, Math.min(messagePagerScroll + delta, maxScroll));
  scheduleRenderState(latestState);
}

async function dispatchCommandMessagePagerKey(event: KeyboardEvent): Promise<boolean> {
  if (!latestState || event.metaKey || isModifierOnlyKey(event.key)) {
    return false;
  }

  const signature = commandMessageSignature(latestState);
  if (!signature || signature === messagePagerDismissedSignature) {
    return false;
  }

  const lines = commandMessageBlockLines(latestState);
  if (lines.length === 0) {
    return false;
  }

  const maxRows = Math.max(1, latestState.screen.rows);
  const maxScroll = Math.max(0, lines.length - maxRows);
  const key = event.key;
  const lowerKey = key.toLowerCase();

  if (key === "Escape" || lowerKey === "q") {
    dismissCommandMessagePager();
    return true;
  }

  if (maxScroll > 0) {
    if (key === "PageDown" || key === " " || (event.ctrlKey && isPhysicalKey(event, "KeyF"))) {
      if (messagePagerScroll >= maxScroll) {
        await dismissCommandMessagePagerWithInput(event);
      } else {
        scrollCommandMessagePager(maxRows);
      }
      return true;
    }
    if (key === "Enter") {
      if (messagePagerScroll >= maxScroll) {
        await dismissCommandMessagePagerWithInput(event);
      } else {
        scrollCommandMessagePager(1);
      }
      return true;
    }
    if (key === "ArrowDown" || lowerKey === "j" || (event.ctrlKey && isPhysicalKey(event, "KeyE"))) {
      if (messagePagerScroll >= maxScroll) {
        dismissCommandMessagePager();
        const encoded = encodeKey(event);
        if (encoded) {
          await window.jusi.sendInput(encoded);
        }
      } else {
        scrollCommandMessagePager(1);
      }
      return true;
    }
    if (key === "ArrowUp" || lowerKey === "k" || (event.ctrlKey && isPhysicalKey(event, "KeyY"))) {
      scrollCommandMessagePager(-1);
      return true;
    }
    if ((event.ctrlKey && isPhysicalKey(event, "KeyD")) || lowerKey === "d") {
      scrollCommandMessagePager(Math.max(1, Math.floor(maxRows / 2)));
      return true;
    }
    if ((event.ctrlKey && isPhysicalKey(event, "KeyU")) || lowerKey === "u") {
      scrollCommandMessagePager(-Math.max(1, Math.floor(maxRows / 2)));
      return true;
    }
    if (key === "PageUp" || (event.ctrlKey && isPhysicalKey(event, "KeyB"))) {
      scrollCommandMessagePager(-maxRows);
      return true;
    }
    if (lowerKey === "g") {
      messagePagerScroll = key === "G" ? maxScroll : 0;
      scheduleRenderState(latestState);
      return true;
    }
  }

  if (key === "Enter") {
    await dismissCommandMessagePagerWithInput(event);
    return true;
  }

  dismissCommandMessagePager();
  const encoded = encodeKey(event);
  if (!encoded) {
    return true;
  }
  await window.jusi.sendInput(encoded);
  return true;
}

async function dispatchKey(event: KeyboardEvent): Promise<boolean> {
  if (!isModifierOnlyKey(event.key)) {
    pendingInput = {
      at: performance.now(),
      seq: inputSeq + 1,
      key: event.key,
    };
    inputSeq += 1;
  }
  if (event.metaKey) {
    return false;
  }

  if (await dispatchCommandMessagePagerKey(event)) {
    return true;
  }

  if (hasPendingWindowCommand()) {
    if (isModifierOnlyKey(event.key)) {
      return false;
    }

    const key = encodeKey(event);
    if (!key) {
      return false;
    }
    await window.jusi.sendWindowInput(key);
    return true;
  }

  if (event.ctrlKey && isPhysicalKey(event, "KeyW")) {
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
    const lines = Math.max(8, Math.floor(rect.height / cellHeight) - 1);
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
  requestGridResize = sync;
  observer.observe(stage);
  sync();
}

function installPointerVisibility(): void {
  window.addEventListener("mousemove", showPointer);
  window.addEventListener("pointerdown", showPointer);
  window.addEventListener("wheel", showPointer);
}

async function boot(): Promise<void> {
  applyTerminalFontSize(loadTerminalFontSize(), false);
  const initial = await window.jusi.getInitialState();
  renderState(initial);
  window.jusi.onStateChanged((state) => {
    scheduleRenderState(state);
  });
  window.jusi.onWebScroll((event) => {
    void handleWebScroll(event);
  });
  window.jusi.onWebOpenLink((event) => {
    void handleWebOpenLink(event);
  });
  window.jusi.onWebEnterMode((event) => {
    void handleWebEnterMode(event);
  });
  window.jusi.onLeaveWebMode(() => {
    setWebMode(null);
  });
  window.jusi.onAppZoom((event) => {
    handleAppZoom(event);
  });
  window.jusi.onWebZoomed(() => {
    handleWebZoomed();
  });
  window.jusi.onWebOpenActiveLink(() => {
    handleWebOpenActiveLink();
  });
  installResizeSync();
  installPointerRouting();
  installPointerVisibility();

  window.addEventListener("keydown", (event) => {
    void dispatchKey(event).then((handled) => {
      if (handled) {
        hidePointerForKeyboardInput();
        event.preventDefault();
      }
    });
  });
}

void boot();
