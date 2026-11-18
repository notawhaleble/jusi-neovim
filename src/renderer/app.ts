import { cursorCell, cursorHighlight, hideCursor, updateCursorBlink, restartCursorBlink } from "./cursor.js";
import { styleForHighlight } from "./highlight.js";
import { byteOffsetToIndex, chunksText } from "../core/ui-text.js";
import { commandText, renderedGlyphRect, wrapHighlighted } from "./overlay-text.js";
import { installGridMouse } from "./mouse.js";
import { BrowserRegionNavigator, browserInteraction, sameBrowserTarget, type BrowserActionTarget, type BrowserInteractionPort } from "../backends/web/interaction.js";
import { presentationBackends } from "../backends/index.js";
import { createRendererSurface } from "../backends/renderer.js";
import type { RendererSurface } from "../presentation/renderer-surface.js";
import { TextLayerJob } from "../presentation/text-layer.js";
import {
  AttachedWebView,
  CursorStyle,
  GridScreenState,
  HighlightAttrs,
  HighlightChunk,
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


}

let cellWidth = 9;
let cellHeight = 18;
const surfaces = new Map<number, RendererSurface<MirrorDocument>>();
const surfaceFor = (host: HTMLElement | null | undefined) => host ? surfaces.get(Number(host.dataset.bufferId)) : undefined;
const persistentViews = new Map<number, HTMLDivElement>();
const persistentFrames = new Map<number, HTMLDivElement>();
const persistentGridLayers = new Map<number, HTMLPreElement>();
const latestAttachedViews = new Map<number, AttachedWebView>();
const textJobs = new Map<number, TextLayerJob>();
const mirrorTimers = new Map<number, ReturnType<typeof setTimeout>>();
const mirrorProjectionTimers = new Map<number, ReturnType<typeof setTimeout>>();
const webModeFrameStates = new Map<number, boolean>();
let webModeBufferId: number | null = null;
let latestState: RendererSessionState | null = null;
let pendingRenderState: RendererSessionState | null = null;
let pendingRenderFrame: number | null = null;
let pendingWindowCommandTimer: ReturnType<typeof setTimeout> | null = null;
let pointerHidden = false;
let terminalFontSize = 14;
let requestGridResize: () => void = () => {};
let messagePagerLineCount = 0;
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

function applyCursorStyle(
  element: HTMLElement,
  style: CursorStyle,
  originLeft: number,
  originTop: number,
  attrs: HighlightAttrs,
  glyph: { text: string; width: number; offset: number },
  identity: string,
): void {
  const percentage = Math.max(1, Math.min(100, style.cellPercentage || 100));
  const width = style.shape === "vertical"
    ? Math.max(2, Math.round((cellWidth * percentage) / 100))
    : glyph.width;
  const height = style.shape === "horizontal"
    ? Math.max(2, Math.round((cellHeight * percentage) / 100))
    : cellHeight;
  const top = style.shape === "horizontal" ? originTop + cellHeight - height : originTop;

  element.style.cssText = styleForHighlight(attrs, { foreground: "#d9dde7", background: "#16161d" });
  element.style.display = "block";
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  element.style.left = `${originLeft - (style.shape === "block" ? glyph.offset : 0)}px`;
  element.style.top = `${top}px`;
  element.style.opacity = "1";
  element.style.fontFamily = '"Iosevka Term", "SF Mono", monospace';
  element.style.fontSize = `${terminalFontSize}px`;
  element.style.lineHeight = `${cellHeight}px`;
  element.style.whiteSpace = "pre";
  element.style.overflow = "hidden";
  element.style.fontVariantLigatures = "none";
  element.textContent = style.shape === "block" ? glyph.text : "";
  updateCursorBlink(element, style, identity);
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
  void window.jusi.invalidateNativeViewport();
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
  // Shared document change tracking handles resize/reflow. A delayed forced
  // extraction here can outlive navigation and reset the new document cursor.
  surfaceFor(host)?.resetProjection();
  scheduleMirrorProjection(host, 0, true, true);
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
    sessionId: view.sessionId,
    incarnation: view.incarnation,
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
      column += run.columns ?? run.text.length;

      if (!highlighted && run.columns === undefined) {
        target.appendChild(document.createTextNode(text));
        continue;
      }

      const span = document.createElement("span");
      span.textContent = text;
      const style = styleForHighlight(highlights[run.highlightId], defaults);
      if (style) {
        span.setAttribute("style", style);
      }
      if (run.columns !== undefined) {
        span.style.display = 'inline-block';
        span.style.width = `${run.columns * cellWidth}px`;
        span.style.verticalAlign = 'top';
        span.style.whiteSpace = 'pre';
        span.style.direction = 'ltr';
        span.style.unicodeBidi = 'isolate';
        span.dataset.columns = String(run.columns);
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

  if (grid.runs && grid.runs.some((row) => row.some((run) => run.highlightId !== 0 || run.columns !== undefined))) {
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
            return `${cellWidth}:${run.columns}:${run.highlightId}:${style}:${run.text}`;
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

function renderOverlayChunks(target: HTMLElement, chunks: HighlightChunk[], state: RendererSessionState): void {
  target.replaceChildren();
  const background = state.screen.backgroundColor ?? '#16161d';
  const foreground = resolveDefaultForeground(background, state.screen.foregroundColor);
  for (const chunk of chunks) {
    const span = document.createElement('span');
    span.textContent = chunk.text;
    span.dataset.highlightId = String(chunk.highlightId);
    span.style.cssText = styleForHighlight(chunk.attrs ?? state.screen.highlights[chunk.highlightId], { foreground, background });
    target.appendChild(span);
  }
}

const textMeasureContext = document.createElement('canvas').getContext('2d');
let textMeasureFont = '';
const textMeasureCache = new Map<string, number>();
const wrappedTextCache = new WeakMap<HighlightChunk[], { key: string; lines: HighlightChunk[][] }>();
const entryTextCache = new WeakMap<object, HighlightChunk[]>();
function wrapOverlayChunks(chunks: HighlightChunk[], maxColumns: number): HighlightChunk[][] {
  const font = `${terminalFontSize}px "Iosevka Term", "SF Mono", monospace`;
  if (textMeasureFont !== font) { textMeasureFont = font; textMeasureCache.clear(); }
  const key = `${font}:${cellWidth}:${maxColumns}`;
  const cached = wrappedTextCache.get(chunks);
  if (cached?.key === key) return cached.lines;
  if (textMeasureContext) textMeasureContext.font = font;
  const lines = wrapHighlighted(chunks, Math.max(1, maxColumns) * cellWidth, (text, width) => {
    if (text === '\t') return (8 - (Math.round(width / cellWidth) % 8)) * cellWidth;
    let size = textMeasureCache.get(text);
    if (size === undefined) {
      size = textMeasureContext?.measureText(text).width ?? cellWidth;
      if (textMeasureCache.size >= 4096) textMeasureCache.clear();
      textMeasureCache.set(text, size);
    }
    return size;
  });
  wrappedTextCache.set(chunks, { key, lines });
  return lines;
}

function entryChunks(entry: RendererSessionState['messages']['entries'][number]): HighlightChunk[] {
  const cached = entryTextCache.get(entry);
  if (cached) return cached;
  const chunks = entry.chunks ?? [{ highlightId: 0, text: entry.text }];
  const result = entry.truncated ? [{ highlightId: 0, text: '[earlier output truncated]\n' }, ...chunks] : chunks;
  entryTextCache.set(entry, result);
  return result;
}

function hasInteractiveMessage(state: RendererSessionState): boolean {
  return state.messages.entries.some(entry => ['confirm', 'confirm_sub', 'number_prompt'].includes(entry.kind));
}

function getCommandAreaHeight(state: RendererSessionState): number {
  return commandAreaHeight({
    cmdlineVisible: state.cmdline.visible || visibleMessageEntries(state).length > 0,
    blockLineCount: visibleCmdlineBlockLines(state).length,
  }, { cellWidth, cellHeight });
}

function visibleCmdlineBlockLines(state: RendererSessionState): HighlightChunk[][] {
  const blockLines = commandBlockLines(state);
  const maxRows = Math.max(0, state.screen.rows);
  if (blockLines.length <= maxRows) {
    return blockLines;
  }
  return blockLines.slice(blockLines.length - maxRows);
}

function commandBlockLines(state: RendererSessionState): HighlightChunk[][] {
  const blocks = state.cmdline.blockChunks ?? state.cmdline.blockLines.map(text => [{ highlightId: 0, text }]);
  const lines = blocks.flatMap(line => wrapOverlayChunks(line, state.screen.cols));
  lines.push(...visibleCommandMessageBlockLines(state));
  return lines;
}

function commandMessageBlockLines(state: RendererSessionState): HighlightChunk[][] {
  const lines: HighlightChunk[][] = [];
  const entries = state.messages.entries.filter(entry => entry.text && !isReturnPromptMessage(entry));
  if (entries.length > 1 || hasReturnPromptMessage(state) || entries.some(entry => isCommandBlockMessageEntry(entry, state.screen.cols))) {
    lines.push(...entries.flatMap(entry => messageBlockLines(entry, state.screen.cols)));
  }
  if (state.messages.historyVisible) {
    lines.push(...state.messages.history.flatMap((entry) => wrapOverlayChunks(entryChunks(entry), state.screen.cols)));
  }
  return lines;
}

function syncMessagePagerState(state: RendererSessionState): void {
  const lineCount = commandMessageBlockLines(state).length;
  const maxRows = Math.max(1, state.screen.rows);
  if (messagePagerScroll >= Math.max(0, messagePagerLineCount - maxRows)) {
    messagePagerScroll = Math.max(0, lineCount - maxRows);
  }
  messagePagerLineCount = lineCount;
  const maxScroll = Math.max(0, lineCount - maxRows);
  messagePagerScroll = Math.max(0, Math.min(messagePagerScroll, maxScroll));
}

function visibleCommandMessageBlockLines(state: RendererSessionState): HighlightChunk[][] {
  const lines = commandMessageBlockLines(state);
  const maxRows = Math.max(0, state.screen.rows);
  if (lines.length <= maxRows) {
    return lines;
  }
  return lines.slice(messagePagerScroll, messagePagerScroll + maxRows);
}

function visibleMessageEntries(state: RendererSessionState): RendererSessionState["messages"]["entries"] {
  const entriesWithText = state.messages.entries.filter(entry => entry.text !== "");
  const prompt = state.messages.entries.find(isReturnPromptMessage);
  if (prompt) return [prompt.text ? prompt : { ...prompt, text: hitEnterPromptText, chunks: undefined }];
  return commandMessageBlockLines(state).length ? [] : entriesWithText.slice(-1);
}

function hasReturnPromptMessage(state: RendererSessionState): boolean {
  return state.messages.entries.some(isReturnPromptMessage);
}

function isReturnPromptMessage(entry: RendererSessionState["messages"]["entries"][number]): boolean {
  return entry.kind === "return_prompt";
}

function isMultilineMessageEntry(entry: RendererSessionState["messages"]["entries"][number]): boolean {
  return entry.text.includes("\n");
}

function isCommandBlockMessageEntry(
  entry: RendererSessionState["messages"]["entries"][number],
  maxColumns: number,
): boolean {
  return entry.truncated === true || isMultilineMessageEntry(entry) || wrapOverlayChunks(entryChunks(entry), maxColumns).length > 1;
}

function messageBlockLines(entry: RendererSessionState["messages"]["entries"][number], maxColumns: number): HighlightChunk[][] {
  const lines = [...wrapOverlayChunks(entryChunks(entry), maxColumns)];
  while (lines.length > 0 && chunksText(lines[0]) === "") {
    lines.shift();
  }
  while (lines.length > 0 && chunksText(lines[lines.length - 1]) === "") {
    lines.pop();
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
  const surface = surfaceFor(host);
  if (!surface?.ready) {
    return;
  }
  try {
    await surface.setMode(visible ? "rich" : "text");
    if (Number.isFinite(bufferId)) {
      webModeFrameStates.set(bufferId, visible);
    }
  } catch (_error) {
    // The webview can be temporarily unavailable while Electron swaps pages.
  }
}

async function applyWebPointerVisibility(host: HTMLDivElement): Promise<void> {
  const surface = surfaceFor(host);
  if (!surface?.ready) {
    return;
  }
  try {
    await surface.setPointerHidden(pointerHidden && webModeBufferId === null);
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
  if (previousBufferId !== bufferId) {
    for (const [id, mode] of [[previousBufferId, "text"], [bufferId, "rich"]] as const) {
      const view = id === null ? undefined : latestAttachedViews.get(id);
      if (view?.sessionId) void window.jusi.setPresentationMode(view.bufferId, view.sessionId, view.windowId, mode)
        .catch(error => console.error("Presentation mode synchronization failed", error));
    }
  }
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
  if (existing && existing.dataset.sessionId === view.sessionId && surfaces.get(view.bufferId)?.matches(view)) {
    return existing;
  }
  if (existing) disposeView(view.bufferId, existing);

  const host = document.createElement("div");
  host.className = "web-view-box";
  host.dataset.bufferId = String(view.bufferId);
  host.dataset.providerId = view.providerId ?? "";
  host.dataset.sessionId = view.sessionId ?? "";
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

  host.dataset.textLayer = view.textLayer ?? "auto";
  host.dataset.textSource = view.textSource ?? "dom";
  const surface = createRendererSurface(view, {
    textStatusChanged: status => {
      if (host.dataset.textSource === "worker") return;
      if (view.providerId === 'web') {
        // Status callbacks may run before the guest handle exists during construction.
        queueMicrotask(() => { const current = surfaces.get(view.bufferId);
          if (current?.ready && current.matches(view)) void window.jusi.reportBrowserTextStatus(view.bufferId, view.sessionId, current.documentHandle(), status).catch(() => {});
        });
      }
      const element = host.querySelector<HTMLElement>(".presentation-text-status");
      if (element) {
        element.dataset.status = status;
        element.textContent = { disabled: "Text off", idle: "Text pending", building: "Building text…", ready: "Text ready", error: "Text failed · retry", limited: "Text limit reached · retry" }[status];
      }
    },
    textChanged: async () => {


    },
    invalidated: () => textJobs.get(view.bufferId)?.invalidate(host.dataset.textLayer !== "off"),
    ready: () => {
      // Identity binding is needed by browser commands even when no text job runs.
      if (view.providerId === 'web' && view.textLayer === 'off') {
        const current = surfaces.get(view.bufferId);
        if (current?.matches(view)) void window.jusi.acquireDocument(view.bufferId, view.sessionId, current.documentHandle()).catch(() => {});
      }
      webModeFrameStates.delete(view.bufferId);


      void applyWebModeFrame(host, webModeBufferId === view.bufferId);
      void applyWebPointerVisibility(host);
      if (host.dataset.textSource === "worker") scheduleMirrorRefresh(host);
    },
    crashed: () => {
      textJobs.get(view.bufferId)?.fail();
      const status = host.querySelector(".presentation-text-status");
      if (status) status.textContent = "Viewer stopped · reload";
    },
    loaded: () => { if (host.dataset.textSource === "worker") scheduleMirrorRefresh(host); },
    focused: () => setWebMode(view.bufferId),
    blurred: () => { void window.jusi.resetBrowserInput(surface.documentHandle()).catch(() => {}); },
    scrolled: () => { showPointer(); scheduleMirrorProjection(host, 80, false, true); },
    pointerVisible: showPointer,
  });
  surfaces.set(view.bufferId, surface);
  surface.attach(host);

  const textStatus = document.createElement("button");
  textStatus.className = "presentation-text-status";
  textStatus.type = "button";
  textStatus.setAttribute("aria-live", "polite");
  textStatus.title = "Click to rebuild the text layer";
  textStatus.addEventListener("click", () => {
    if (surface.crashed) surface.reload();
    else scheduleMirrorRefresh(host);
  });
  host.appendChild(textStatus);
  if (view.providerId === "web") {
    const identity = document.createElement("span");
    identity.className = "browser-profile-label";
    identity.textContent = view.surface.uri.startsWith("jusi-directory:") ? "Local · isolated"
      : view.privateBrowsing ? "Private · this buffer" : `Profile · ${view.profile ?? "default"}`;
    host.appendChild(identity);
    if (!view.surface.uri.startsWith("jusi-directory:")) {
      const popup = document.createElement("button");
      popup.className = "browser-popup-permission";
      popup.textContent = "Allow next popup";
      popup.title = "Allow one native browser popup for 15 seconds; then repeat the page action";
      popup.addEventListener("click", () => {
        void window.jusi.armBrowserPopup(view.bufferId, view.sessionId, surface.documentHandle()).then(allowed => {
          popup.title = allowed ? "One popup allowed for 15 seconds; repeat the page action"
            : "Popup unavailable: close the existing child or wait for the page to load";
        }).catch(() => { popup.textContent = "Popup unavailable"; });
      });
      host.appendChild(popup);
    }
  }
  const job = new TextLayerJob((status) => {
    textStatus.dataset.status = status;
    textStatus.textContent = { disabled: "Text off", idle: "Text pending", building: "Building text…", ready: "Text ready", error: "Text failed · retry", limited: "Text limit reached · retry" }[status];
  });
  if (view.textSource === "worker") {
    textJobs.set(view.bufferId, job);
    job.invalidate(view.textLayer !== "off");
  } else {
    textStatus.dataset.status = view.textLayer === "off" ? "disabled" : "idle";
    textStatus.textContent = view.textLayer === "off" ? "Text off" : "Text pending";
    const acquire = () => window.jusi.acquireDocument(view.bufferId, view.sessionId, surface.documentHandle());
    surface.configureText({
      invalidate: async () => {
        if (!surface.ready) return; // main already revokes navigation/crash tickets
        if (await acquire()) await window.jusi.invalidateDocument(view.bufferId, view.sessionId, surface.documentHandle());
      },
      acquire,
      publish: (ticket, mirror) => window.jusi.updateWebMirror(ticket, mirror),
    });
  }

  const mirrorCursor = document.createElement("div");
  mirrorCursor.className = "web-view-box__mirror-cursor";
  host.appendChild(mirrorCursor);

  const modeFrame = document.createElement("div");
  modeFrame.className = "web-view-box__mode-frame";
  host.appendChild(modeFrame);

  persistentViews.set(view.bufferId, host);
  return host;
}

async function refreshMirror(host: HTMLDivElement): Promise<void> {
  const bufferId = Number(host.dataset.bufferId);
  const surface = surfaceFor(host);
  const job = textJobs.get(bufferId);
  if (!surface?.ready) return;
  if (host.dataset.textSource !== "worker") {
    const port = browserPort(bufferId), target = port?.read();
    if (port && target) await browserInteraction(port, target, { kind: 'retry' });
    return;
  }
  if (!job) return;
  if (host.dataset.textSource === "worker") {
    await job.run(async signal => {
      const ticket = await window.jusi.acquireDocument(bufferId, host.dataset.sessionId ?? "", surface.documentHandle());
      if (!ticket || signal.aborted) throw new Error("Document changed");
      if (!await window.jusi.buildWorkerText(ticket)) throw new Error("Worker document changed before commit");
    }, async () => {});
    return;
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

function browserPort(bufferId: number): BrowserInteractionPort | undefined {
  const surface = surfaces.get(bufferId);
  if (!surface) return;
  return {
    read: () => {
      // Interaction consumes the newest authoritative state, independent of paint.
      const state = pendingRenderState ?? latestState;
      const view = state?.attachedWebViews.find(view => view.bufferId === bufferId);
      return surface.ready && view && view.tabId === state?.snapshot.currentTabId
        && surfaces.get(bufferId) === surface && surface.matches(view) ? view : undefined;
    },
    scroll: (lines, index) => surface.scroll(lines, index),
    region: (index, direction) => surface.region(index, direction),
    activateLink: index => surface.activateLink(index),
    hitTest: (x, y) => surface.hitTest(x, y),
    rebuildText: () => surface.rebuildText(),
    projectCursor: (mirror, cursor, auto, force) => surface.projectCursor(mirror, cursor, auto, force),
  };
}

async function moveMirrorCursorToClick(event: BrowserActionTarget & { x: number; y: number }): Promise<void> {
  const port = browserPort(event.bufferId);
  const view = port?.read();
  if (!view || !port || !sameBrowserTarget(view, event)) return;
  setWebMode(event.bufferId);
  try {
    const position = await browserInteraction(port, event, { kind: 'hit', x: event.x, y: event.y });
    if (position && view.mirror && view.incarnation !== undefined) await window.jusi.setCursor(view.windowId, position.row, position.col,
      { bufferId: view.bufferId, sessionId: view.sessionId, incarnation: view.incarnation, revision: view.mirror.version });
  } catch { /* Navigation revokes in-flight interaction. */ }
}

async function handleWebScroll(event: BrowserActionTarget & { lines: number }): Promise<void> {
  const port = browserPort(event.bufferId);
  if (!port) return;
  try { await browserInteraction(port, event, { kind: 'scroll', lines: event.lines }); }
  catch { /* Navigation revokes in-flight interaction. */ }
}

const regionNavigator = new BrowserRegionNavigator();
async function handleWebRegion(event: BrowserActionTarget & { direction: number }): Promise<void> {
  const port = browserPort(event.bufferId);
  if (!port || event.incarnation === undefined || event.documentRevision === undefined) return;
  const ticket = { bufferId: event.bufferId, sessionId: event.sessionId, incarnation: event.incarnation, revision: event.documentRevision };
  try {
    await regionNavigator.navigate(port, event, event.direction, async () => {
      return await window.jusi.readBrowserState(event.windowId, ticket) ?? undefined;
    }, position => window.jusi.setCursor(event.windowId, position.row, position.col, ticket));
  } catch { /* Navigation revokes in-flight interaction. */ }
}

async function handleWebOpenLink(event: BrowserActionTarget): Promise<void> {
  const port = browserPort(event.bufferId);
  if (!port) return;
  const shouldReturnFocus = webModeBufferId === null;
  try {
    await browserInteraction(port, event, { kind: 'link' });
    if (shouldReturnFocus && webModeBufferId === null) focusHostSurface();
  } catch { /* Navigation revokes in-flight interaction. */ }
}

async function handleWebEnterMode(event: { bufferId: number; windowId: number }): Promise<void> {
  // Enter can follow a window change before its animation-frame paint. Apply that
  // authoritative layout first so an older frame cannot immediately steal focus.
  if (pendingRenderState) {
    const state = pendingRenderState;
    pendingRenderState = null;
    renderState(state);
  }
  const host = persistentViews.get(event.bufferId);
  const view = latestAttachedViews.get(event.bufferId);
  const surface = surfaceFor(host);
  if (!host || !view || view.windowId !== event.windowId || !surface) return;
  setWebMode(event.bufferId);
  surface.focus();
  await projectMirrorCursor(host, view, view.cursor ?? null, false, true);
}

async function projectMirrorSelection(host: HTMLDivElement, view: AttachedWebView): Promise<void> {
  const surface = surfaceFor(host);
  if (!surface?.ready) return;
  try { await surface.projectSelection(view.mirror, view.selection); } catch { /* Navigation revokes projection. */ }
}

function updateViewHost(host: HTMLDivElement, view: AttachedWebView): void {
  host.dataset.windowId = String(view.windowId);
  if (host.dataset.textLayer !== (view.textLayer ?? "auto")) {
    host.dataset.textLayer = view.textLayer ?? "auto";
  host.dataset.textSource = view.textSource ?? "dom";
    textJobs.get(view.bufferId)?.invalidate(view.textLayer !== "off");
    if (view.textLayer !== "off") scheduleMirrorRefresh(host);
  }
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

  if (surfaceFor(host)?.update(view)) {
    webModeFrameStates.delete(view.bufferId);


  }
}

async function projectMirrorCursor(host: HTMLDivElement, view: AttachedWebView | null,
  cursor: { row: number; col: number } | null, autoScroll = true, force = false): Promise<void> {
  host.querySelector(".web-view-box__mirror-cursor")?.classList.remove("web-view-box__mirror-cursor--visible");
  const surface = surfaceFor(host);
  if (!surface?.ready) return;
  try { await surface.projectCursor(view?.mirror, cursor, autoScroll, force); } catch { /* Navigation revokes projection. */ }
}

function disposeView(bufferId: number, host: HTMLDivElement): void {
  textJobs.get(bufferId)?.invalidate(false);
  textJobs.delete(bufferId);
  clearTimeout(mirrorTimers.get(bufferId));
  clearTimeout(mirrorProjectionTimers.get(bufferId));
  mirrorTimers.delete(bufferId);
  mirrorProjectionTimers.delete(bufferId);



  webModeFrameStates.delete(bufferId);
  latestAttachedViews.delete(bufferId);
  persistentViews.delete(bufferId);
  if (webModeBufferId === bufferId) setWebMode(null);
  surfaces.get(bufferId)?.dispose();
  surfaces.delete(bufferId);
  host.remove();
}

function parkViewHost(host: HTMLDivElement): void {
  surfaceFor(host)?.detach();
  surfaceFor(host)?.resize(800, 600);
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
    parkViewHost(host);
    return;
  }
  surfaceFor(host)?.attach(host);
  surfaceFor(host)?.resize(bounds.width * cellWidth, bounds.height * cellHeight);
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
    try { presentationBackends.resolve(view.surface); }
    catch (error) { console.error("[presentation-backend]", error); continue; }
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
    if (latestState && !latestState.presentationBufferIds.includes(bufferId)) {
      disposeView(bufferId, host);
      continue;
    }
    if (active.has(bufferId)) {
      continue;
    }
    latestAttachedViews.delete(bufferId);
    if (host.parentElement !== root) {
      root.appendChild(host);
    }
    void applyWebModeFrame(host, false);
    void projectMirrorCursor(host, null, null);
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
    layer.style.pointerEvents = bounds?.mouseEnabled === false ? "none" : "auto";
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
        renderOverlayChunks(row, entryChunks(entry), state);
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
      renderOverlayChunks(showmodeSlot, state.messages.statusChunks?.showmode ?? [{ highlightId: 0, text: showmode }], state);
      renderOverlayChunks(showcmdSlot, state.messages.statusChunks?.showcmd ?? [{ highlightId: 0, text: showcmd }], state);
      renderOverlayChunks(rulerSlot, state.messages.statusChunks?.ruler ?? [{ highlightId: 0, text: ruler }], state);
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

function renderCmdlineBlock(state: RendererSessionState, commandTop: number): void {
  const block = document.getElementById("cmdline-block-layer");
  if (!block) {
    return;
  }

  const blockElement = block as HTMLElement;
  const allLines = visibleCmdlineBlockLines(state);
  const lines = allLines.slice(Math.max(0, allLines.length - Math.floor(commandTop / cellHeight)));
  const blockHeight = lines.length * cellHeight;
  blockElement.style.top = `${Math.max(0, commandTop - blockHeight)}px`;
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
    renderOverlayChunks(row, line, state);
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

let nativeViewportSequence = 0;
function reportNativeViewport(state: RendererSessionState): void {
  if (!state.nativeLayoutGeneration) return;
  const stage = document.querySelector(".stage");
  if (!(stage instanceof HTMLElement)) return;
  const rect = stage.getBoundingClientRect();
  const blocked = state.cmdline.visible || state.popupmenu.visible || state.messages.historyVisible
    || visibleCmdlineBlockLines(state).length > 0;
  // The one-line message/status area starts below this viewport; it does not occlude a float.
  void window.jusi.reportNativeViewport({ generation: state.nativeLayoutGeneration,
    sequence: ++nativeViewportSequence, x: rect.left, y: rect.top,
    width: rect.width, height: Math.min(rect.height, terminalGridHeight(state)),
    cellWidth, cellHeight, blocked });
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
      !state.screen.busy && !state.cmdline.visible &&
      activeGridCursor &&
      activeWindow &&
      windowKind(state, activeWindow) !== "web" &&
      (activeWindow.gridBounds ||
        (typeof activeWindow.row === "number" && typeof activeWindow.col === "number"))
    ) {
      const bounds = resolveWindowGridBounds(activeWindow);
      const row = bounds?.row ?? activeWindow.row!;
      const col = bounds?.col ?? activeWindow.col!;
      cursor.style.zIndex = String(11 + windowOrder(activeWindow));
      const cursorStyle = state.screen.mode.cursor;
      const grid = state.grids.find(grid => grid.gridId === activeGridCursor.gridId) ?? state.screen;
      const cell = cursorCell(grid.runs[activeGridCursor.row] ?? [], activeGridCursor.col);
      applyCursorStyle(
        cursor,
        cursorStyle,
        (col + activeGridCursor.col) * cellWidth,
        (row + activeGridCursor.row) * cellHeight,
        cursorHighlight(cursorStyle, state.screen.highlights[cell.highlightId], state.screen.highlights, { foreground, background }),
        { text: cell.text, width: cell.columns * cellWidth, offset: cell.offset * cellWidth },
        JSON.stringify([activeGridCursor, cell.text, state.screen.mode.name]),
      );
    } else {
      hideCursor(cursor);
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

  let commandPopupLeft: number | undefined;
  let commandTop = terminalGridHeight(state);
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
      const view = commandText(state.cmdline);
      const content = document.createElement('span');
      content.className = 'cmdline-content';
      renderOverlayChunks(content, view.chunks, state);
      const commandCursor = cmdline.querySelector<HTMLElement>(".cmdline-cursor") ?? document.createElement("span");
      const flow = document.createElement('div');
      const end = document.createElement('span');
      end.className = 'cmdline-end';
      end.style.width = `${cellWidth}px`;
      flow.append(content, end);
      cmdline.replaceChildren(flow);
      cmdline.scrollTop = 0;
      const height = Math.min(flow.offsetHeight, commandTop + cellHeight);
      commandTop -= Math.max(0, height - cellHeight);
      cmdlineElement.style.height = `${height}px`;
      cmdlineElement.style.top = `${commandTop}px`;
      const origin = flow.getBoundingClientRect();
      const text = chunksText(view.chunks);
      const glyph = new Intl.Segmenter(undefined, {granularity: 'grapheme'}).segment(text.slice(view.cursorIndex))[Symbol.iterator]().next().value?.segment ?? ' ';
      const caret = renderedGlyphRect(content, view.cursorIndex, glyph.length, end);
      const cursorTop = Math.floor((caret.top + caret.height / 2 - origin.top) / cellHeight) * cellHeight;
      cmdline.scrollTop = Math.max(0, cursorTop + cellHeight - height);
      if (state.popupmenu.grid === -1) {
        const anchor = view.prefixLength + byteOffsetToIndex(state.cmdline.content, state.popupmenu.col);
        const anchorRect = renderedGlyphRect(content, anchor, 1, end);
        const viewport = cmdlineElement.getBoundingClientRect();
        if (anchorRect.bottom > viewport.top && anchorRect.top < viewport.bottom) {
          commandPopupLeft = anchorRect.left - origin.left;
        }
      }
      let index = 0;
      const chunk = view.chunks.find(chunk => { index += chunk.text.length; return index > view.cursorIndex; });
      const attrs = chunk?.attrs ?? state.screen.highlights[chunk?.highlightId ?? 0];
      const glyphWidth = Math.max(cellWidth, caret.width);
      commandCursor.className = "cmdline-cursor";
      const cursorStyle = state.screen.mode.cursor;
      applyCursorStyle(
        commandCursor,
        cursorStyle,
        caret.left - origin.left,
        cursorTop,
        cursorHighlight(cursorStyle, attrs, state.screen.highlights, { foreground, background }),
        {text: glyph, width: glyphWidth, offset: 0},
        JSON.stringify([state.cmdline.level, view.cursorIndex, text, state.screen.mode.name]),
      );
      if (state.screen.busy) hideCursor(commandCursor);
      cmdline.appendChild(commandCursor);
      cmdline.classList.add("cmdline-layer--visible");
    } else {
      const commandCursor = cmdline.querySelector<HTMLElement>(".cmdline-cursor");
      if (commandCursor) hideCursor(commandCursor);
      cmdline.textContent = "";
      cmdline.classList.remove("cmdline-layer--visible");
    }
  }

  renderCmdlineBlock(state, commandTop);

  const popup = document.getElementById("popupmenu-layer");
  if (popup) {
    popup.innerHTML = "";
    if (state.popupmenu.visible) {
      const stage = document.querySelector(".stage");
      const stageHeight = stage instanceof HTMLElement ? stage.clientHeight : 0;
      const stageWidth = stage instanceof HTMLElement ? stage.clientWidth : 0;
      const commandHeight = getCommandAreaHeight(state);
      const commandAreaTop = commandTop - (visibleCmdlineBlockLines(state).length * cellHeight);
      popup.style.removeProperty("--popup-available-width");
      popup.style.maxHeight = "";
      popup.style.maxWidth = "";
      popup.classList.add("popupmenu-layer--visible");
      state.popupmenu.items.forEach((item, index) => {
        const row = document.createElement("div");
        row.className = "popupmenu-item";
        if (index === state.popupmenu.selected) {
          row.classList.add("popupmenu-item--selected");
        }
        row.textContent = [item.word, item.kind, item.menu].filter(Boolean).join('  ');
        if (index === state.popupmenu.selected && item.info) {
          const info = document.createElement('div'); info.className = 'popupmenu-info';
          info.textContent = item.info; row.appendChild(info);
        }
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
        commandAnchorLeft: commandPopupLeft,
      });
      popup.style.left = `${placement.left}px`;
      popup.style.top = `${placement.top}px`;
      popup.style.maxHeight = placement.maxHeight === undefined ? "" : `${placement.maxHeight}px`;
      popup.style.maxWidth = placement.maxWidth === undefined ? "" : `${placement.maxWidth}px`;
      popup.style.setProperty("--popup-available-width", popup.style.maxWidth);
      const visible = Boolean(placement.maxHeight && placement.maxWidth);
      popup.classList.toggle("popupmenu-layer--visible", visible);
      if (visible) popup.querySelector(".popupmenu-item--selected")?.scrollIntoView({ block: "nearest" });
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
  reportNativeViewport(state);
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
  if (!(stage instanceof HTMLElement)) return;
  installGridMouse(stage, {
    metrics: () => ({ width: cellWidth, height: cellHeight }),
    blocked: () => !latestState || latestState.cmdline.visible || latestState.popupmenu.visible
      || latestState.messages.historyVisible || visibleCmdlineBlockLines(latestState).length > 0,
    activate: () => { setWebMode(null); focusHostSurface(); },
    send: input => window.jusi.sendMouse(input),
    target: element => {
      if (!(element instanceof Element) || !latestState?.snapshot.currentTabId) return null;
      const layer = element.closest<HTMLElement>('.grid-layer');
      if (layer) {
        const owner = latestState.snapshot.windows.find(w => w.id === Number(layer.dataset.windowId)
          && w.gridId === Number(layer.dataset.gridId) && w.tabId === latestState!.snapshot.currentTabId);
        if (!owner || owner.gridBounds?.mouseEnabled === false) return null;
        return { element: layer, grid: owner.gridId!, windowId: owner.id, tabId: owner.tabId };
      }
      if (!element.closest('#terminal-screen') && element.id !== 'grid-layer-root') return null;
      const terminal = document.getElementById('terminal-screen');
      return terminal ? { element: terminal, grid: 1, tabId: latestState.snapshot.currentTabId } : null;
    },
  });
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
      return event.shiftKey ? "<S-Tab>" : "<Tab>";
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

function scrollCommandMessagePager(delta: number): void {
  if (!latestState) {
    return;
  }
  const maxRows = Math.max(1, latestState.screen.rows);
  const maxScroll = Math.max(0, commandMessageBlockLines(latestState).length - maxRows);
  messagePagerScroll = Math.max(0, Math.min(messagePagerScroll + delta, maxScroll));
  scheduleRenderState(latestState);
}

function dispatchCommandMessagePagerKey(event: KeyboardEvent): boolean {
  if (!latestState || latestState.cmdline.visible || hasInteractiveMessage(latestState)
    || event.metaKey || isModifierOnlyKey(event.key)) {
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

  if (maxScroll > 0) {
    const paging = hasReturnPromptMessage(latestState);
    if (key === "PageDown" || (paging && (key === " " || (event.ctrlKey && isPhysicalKey(event, "KeyF"))))) {
      if (messagePagerScroll >= maxScroll) return false;
      scrollCommandMessagePager(maxRows);
      return true;
    }
    if (key === "ArrowDown" || (paging && (key === "Enter" || lowerKey === "j" || (event.ctrlKey && isPhysicalKey(event, "KeyE"))))) {
      if (messagePagerScroll >= maxScroll) return false;
      scrollCommandMessagePager(1);
      return true;
    }
    if (!paging && !["ArrowUp", "PageUp"].includes(key)) return false;
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

  return false;
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

  if (dispatchCommandMessagePagerKey(event)) {
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
    void window.jusi.invalidateNativeViewport();
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
  window.jusi.onNativePopupControls((controls) => {
    document.getElementById("native-popup-controls")?.remove();
    const root = document.createElement("div"); root.id = "native-popup-controls";
    for (const control of controls) {
      if (control.generation !== latestState?.nativeLayoutGeneration) continue;
      const bar = document.createElement("div");
      bar.className = "native-popup-control"; bar.dataset.bufferId = String(control.bufferId);
      bar.style.cssText = `position:fixed;left:${control.x}px;top:${control.y}px;width:${control.width}px;height:${control.height}px;z-index:2000000;display:flex;align-items:center;background:#202634;color:white;font:12px sans-serif;`;
      const label = document.createElement("span");
      label.textContent = `${control.scope} · ${control.origin}`;
      label.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
      label.title = label.textContent;
      const close = document.createElement("button"); close.textContent = "Close";
      close.style.cssText = "height:100%;padding:0 8px;font:inherit;line-height:1";
      close.onclick = () => { void window.jusi.closeNativePopup(control.token); };
      const status = document.createElement("button"); status.className = "native-popup-text-status";
      status.type = "button";
      status.disabled = control.textStatus === "disabled" || control.textStatus === "building";
      status.title = "Click to rebuild the text layer";
      status.onclick = () => { void window.jusi.retryNativeText(control.token); };
      status.dataset.status = control.textStatus;
      status.textContent = ({ idle: "Text pending", building: "Building text…", ready: "Text ready",
        disabled: "Text off", error: "Text failed · retry", limited: "Text limit reached · retry" })[control.textStatus];
      status.style.cssText = "padding:0 8px;white-space:nowrap";
      status.setAttribute("aria-live", "polite");
      bar.append(label, status, close);
      if (!latestState?.debugUi) bar.style.display = "none";
      root.append(bar);
    }
    document.body.append(root);
    // Do not reveal native content until its trusted controls have been laid out.
    requestAnimationFrame(() => {
      if (document.getElementById("native-popup-controls") !== root) return;
      for (const control of controls) {
        if (control.generation === latestState?.nativeLayoutGeneration)
          void window.jusi.acknowledgeNativePopup(control.token, control.generation);
      }
    });
  });
  window.jusi.onStateChanged((state) => {
    scheduleRenderState(state);
  });
  window.jusi.onBrowserPointer(event => { void moveMirrorCursorToClick(event); });
  window.jusi.onWebScroll((event) => {
    void handleWebScroll(event);
  });
  window.jusi.onBrowserRefresh(event => { const port=browserPort(event.bufferId); if (port) void browserInteraction(port,event,{kind:'retry'}).catch(()=>{}); });
  window.jusi.onWebRegion(event => { void handleWebRegion(event); });
window.jusi.onWebOpenLink((event) => {
    void handleWebOpenLink(event);
  });
  window.jusi.onWebEnterMode((event) => {
    void handleWebEnterMode(event);
  });
  window.jusi.onBrowserLinkSelected(({ guestId, token }) => {
    for (const [bufferId, surface] of surfaces) {
      if (!surface.ready || surface.documentHandle() !== guestId) continue;
      const host = persistentViews.get(bufferId);
      if (host) void window.jusi.openBrowserLink(guestId, token, bufferId, host.dataset.sessionId ?? "");
      break;
    }
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

// Input restarts the initial visible interval, even when the cursor does not move.
window.addEventListener('keydown', () => {
  for (const cursor of document.querySelectorAll<HTMLElement>('#terminal-cursor, .cmdline-cursor')) restartCursorBlink(cursor);
}, {capture: true});
