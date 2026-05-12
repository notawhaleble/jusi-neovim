import {
  AttachedWebView,
  GridScreenState,
  HighlightAttrs,
  MirrorDocument,
  ScreenCell,
  ScreenLineRun,
} from "../core/types.js";
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
const latestAttachedViews = new Map<number, AttachedWebView>();
const mirrorVersions = new Map<number, number>();
const mirrorHashes = new Map<number, string>();
const mirrorTimers = new Map<number, ReturnType<typeof setTimeout>>();
const mirrorProjectionTimers = new Map<number, ReturnType<typeof setTimeout>>();
const mirrorProjectionTokens = new Map<number, number>();
let webModeBufferId: number | null = null;
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

async function applyWebModeFrame(host: HTMLDivElement, visible: boolean): Promise<void> {
  const browser = host.querySelector("webview") as HTMLElement | null;
  const executableBrowser = browser as (HTMLElement & { executeJavaScript?: (code: string) => Promise<unknown> }) | null;
  if (!browser || browser.dataset.domReady !== "1" || !executableBrowser || typeof executableBrowser.executeJavaScript !== "function") {
    return;
  }
  try {
    await executableBrowser.executeJavaScript(webModeFrameSource(visible));
  } catch (_error) {
    // The webview can be temporarily unavailable while Electron swaps pages.
  }
}

function syncWebModeFrames(): void {
  for (const [bufferId, host] of persistentViews.entries()) {
    void applyWebModeFrame(host, webModeBufferId === bufferId);
  }
}

function setWebMode(bufferId: number | null): void {
  webModeBufferId = bufferId;
  updateWebModeClasses();
  syncWebModeFrames();
  if (bufferId === null) {
    focusHostSurface();
  }
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
    void applyWebModeFrame(host, webModeBufferId === view.bufferId);
    scheduleMirrorRefresh(host);
  });
  browser.addEventListener("did-finish-load", () => {
    scheduleMirrorRefresh(host);
  });
  browser.addEventListener("focus", () => {
    setWebMode(view.bufferId);
    scheduleMirrorRefresh(host);
  });
  browser.addEventListener("mousedown", (event) => {
    setWebMode(view.bufferId);
    void moveMirrorCursorToClick(host, event as MouseEvent);
  });
  browser.addEventListener("click", () => {
    scheduleMirrorRefresh(host);
  });
  browser.addEventListener("keyup", () => {
    scheduleMirrorRefresh(host);
  });
  browser.addEventListener("wheel", () => {
    scheduleMirrorProjection(host, 80, false);
  });
  host.appendChild(browser);

  const mirrorCursor = document.createElement("div");
  mirrorCursor.className = "web-view-box__mirror-cursor";
  host.appendChild(mirrorCursor);

  persistentViews.set(view.bufferId, host);
  return host;
}

function mirrorExtractorSource(): string {
  return `(() => {
    window.__jusiMirrorNodes = new Map();
    window.__jusiMirrorIndexMap = [];
    const idForNode = (() => {
      let next = 1;
      const ids = new WeakMap();
      return (node) => {
        if (!ids.has(node)) {
          ids.set(node, "dom-" + next++);
        }
        const id = ids.get(node);
        window.__jusiMirrorNodes.set(id, node);
        return id;
      };
    })();
    const maxChars = 200000;
    const collapsibleWhitespace = /[ \\t\\n\\f\\r]/;
    const lines = [];
    const indexMap = [];
    let currentLine = "";
    let currentSpans = [];
    let currentLineStart = 0;
    let currentLineTop = null;
    let lastRect = null;
    let lastWasSpace = false;
    let charCount = 0;
    const lineHeight = (() => {
      const style = window.getComputedStyle(document.body || document.documentElement);
      const parsed = Number.parseFloat(style.lineHeight);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 16;
    })();
    window.__jusiMirrorLineHeight = lineHeight;
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
    const isTextNodeVisible = (node) => {
      if (!node || node.nodeType !== Node.TEXT_NODE || !node.parentElement) {
        return false;
      }
      const parent = node.parentElement;
      const tag = parent.tagName ? parent.tagName.toUpperCase() : "";
      if (["SCRIPT","STYLE","NOSCRIPT","TEMPLATE"].includes(tag)) {
        return false;
      }
      const style = window.getComputedStyle(parent);
      if (!style || style.display === "none" || style.visibility === "hidden") {
        return false;
      }
      if (parent.closest && parent.closest('[aria-hidden="true"]')) {
        return false;
      }
      return true;
    };
    const rectForCharacter = (node, offset) => {
      const range = document.createRange();
      try {
        range.setStart(node, offset);
        range.setEnd(node, Math.min(offset + 1, node.length));
        const rects = range.getClientRects();
        for (const rect of Array.from(rects)) {
          if (rect.width > 0 || rect.height > 0) {
            return {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            };
          }
        }
        const rect = range.getBoundingClientRect();
        return rect && (rect.width > 0 || rect.height > 0)
          ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
          : null;
      } catch (_error) {
        return null;
      } finally {
        range.detach();
      }
    };
    const flushLine = (includeNewline = true, preserveEmpty = false) => {
      if (currentLine.length === 0 && !preserveEmpty) {
        currentSpans = [];
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
        spans: currentSpans,
      });
      currentLine = "";
      currentSpans = [];
      currentLineTop = null;
      lastRect = null;
      lastWasSpace = false;
      if (includeNewline) {
        indexMap.push(null);
      }
      currentLineStart = indexMap.length;
    };
    const maybeInsertVisualSeparator = (node, offset, rect) => {
      if (!rect || !lastRect || currentLine.length === 0 || currentLine.endsWith(" ")) {
        return;
      }
      if (Math.abs(rect.y - lastRect.y) > lineHeight * 0.6) {
        return;
      }
      const gap = rect.x - (lastRect.x + lastRect.width);
      if (gap <= Math.max(3, lineHeight * 0.2)) {
        return;
      }
      const index = currentLine.length;
      currentLine += " ";
      currentSpans.push({
        text: " ",
        startIndex: index,
        endIndex: index + 1,
        domNodeId: idForNode(node),
        domStartOffset: offset,
        domEndOffset: offset,
        rects: [],
        blockHint: "inline",
      });
      indexMap.push(null);
      charCount += 1;
    };
    const pushChar = (node, char, offset, rect) => {
      if (char === "\\n") {
        flushLine(true, true);
        return;
      }
      if (rect && currentLineTop !== null && Math.abs(rect.y - currentLineTop) > lineHeight * 0.6) {
        flushLine();
      }
      if (currentLine.length === 0) {
        currentLineStart = indexMap.length;
      }
      maybeInsertVisualSeparator(node, offset, rect);
      if (rect && currentLineTop === null) {
        currentLineTop = rect.y;
      }
      const index = currentLine.length;
      currentLine += char;
      currentSpans.push({
        text: char,
        startIndex: index,
        endIndex: index + 1,
        domNodeId: idForNode(node),
        domStartOffset: offset,
        domEndOffset: offset + 1,
        rects: rect ? [rect] : [],
        blockHint: "inline",
      });
      indexMap.push(rect ? { node, offset } : null);
      if (rect) {
        lastRect = rect;
      }
      charCount += 1;
    };
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return isTextNodeVisible(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    let node = walker.nextNode();
    while (node && charCount < maxChars) {
      const style = node.parentElement ? window.getComputedStyle(node.parentElement) : null;
      const normalized = normalizeNodeText(node.nodeValue || "", style ? style.whiteSpace : "", style ? style.textTransform : "");
      for (let index = 0; index < normalized.text.length && charCount < maxChars; index += 1) {
        const char = normalized.text[index];
        const offset = normalized.offsets[index];
        const rect = char === "\\n" ? null : rectForCharacter(node, offset);
        if (!rect && char !== " " && char !== "\\n") {
          continue;
        }
        pushChar(node, char, offset, rect);
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
    let frame = document.getElementById("jusi-neovim-web-mode-frame");
    if (!frame) {
      frame = document.createElement("div");
      frame.id = "jusi-neovim-web-mode-frame";
      frame.style.position = "fixed";
      frame.style.inset = "0";
      frame.style.boxSizing = "border-box";
      frame.style.pointerEvents = "none";
      frame.style.zIndex = "2147483647";
      frame.style.border = "2px solid #ff9f45";
      frame.style.outline = "2px solid rgba(255, 255, 255, 0.88)";
      frame.style.outlineOffset = "-4px";
      frame.style.boxShadow = "inset 0 0 0 1px rgba(255, 159, 69, 0.55), 0 0 14px rgba(255, 159, 69, 0.35)";
      (document.body || document.documentElement).appendChild(frame);
    }
    frame.style.display = ${visible ? '"block"' : '"none"'};
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

function mirrorHash(mirror: MirrorDocument): string {
  return mirror.lines.map((line) => line.text).join("\n");
}

async function refreshMirror(host: HTMLDivElement): Promise<void> {
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
  } catch (error) {
    console.warn("[mirror-refresh-failed]", error);
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

function scheduleMirrorProjection(host: HTMLDivElement, delay: number, autoScroll = true): void {
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
    void projectMirrorCursor(host, view, view.windowId === activeTab?.currentWindowId ? view.cursor ?? null : null, autoScroll);
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
  await projectMirrorCursor(host, view, view.cursor ?? null, false);
}

async function projectMirrorSelection(host: HTMLDivElement, view: AttachedWebView): Promise<void> {
  const browser = host.querySelector("webview") as HTMLElement | null;
  const executableBrowser = browser as (HTMLElement & { executeJavaScript?: (code: string) => Promise<unknown> }) | null;
  if (!browser || !executableBrowser || typeof executableBrowser.executeJavaScript !== "function") {
    return;
  }
  if (browser.dataset.domReady !== "1") {
    return;
  }

  if (!view.mirror || !view.selection) {
    try {
      await executableBrowser.executeJavaScript(mirrorSelectionClearSource());
    } catch (_error) {
      // The webview can become temporarily non-executable while Electron swaps pages.
    }
    return;
  }

  const startLine = view.mirror.lines[view.selection.start.row];
  const endLine = view.mirror.lines[view.selection.end.row];
  if (!startLine || !endLine) {
    try {
      await executableBrowser.executeJavaScript(mirrorSelectionClearSource());
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

  try {
    await executableBrowser.executeJavaScript(mirrorSelectionProjectionSource(startIndex, endIndex));
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
    browser.src = view.url;
  }
}

async function projectMirrorCursor(
  host: HTMLDivElement,
  view: AttachedWebView,
  cursor: { row: number; col: number } | null,
  autoScroll = true,
): Promise<void> {
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
    try {
      await executableBrowser.executeJavaScript(mirrorProjectionClearSource());
    } catch (_error) {
      // The webview can become temporarily non-executable while Electron swaps pages.
    }
    return;
  }
  const line = view.mirror.lines[cursor.row];
  if (!line) {
    try {
      await executableBrowser.executeJavaScript(mirrorProjectionClearSource());
    } catch (_error) {
      // The webview can become temporarily non-executable while Electron swaps pages.
    }
    return;
  }
  const col = Math.max(0, Math.min(cursor.col, line.text.length));
  const index = line.startIndex + col;

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
    } catch (_error) {
      // The webview can become temporarily non-executable while Electron swaps pages.
    }
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
    void applyWebModeFrame(host, webModeBufferId === view.bufferId);
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
  syncWebModeToState(state);
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
      windowKind(state, activeWindow) !== "web" &&
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
  window.jusi.onWebScroll((event) => {
    void handleWebScroll(event);
  });
  window.jusi.onLeaveWebMode(() => {
    setWebMode(null);
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
