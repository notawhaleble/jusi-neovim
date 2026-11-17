import type { PresentationSession, AttachedPresentation, TextDocument, TextLine } from "../presentation/contracts.js";
export type BufferKind = "text" | "web";

export interface BufferRef {
  id: number;
  kind: BufferKind;
  name?: string;
}

export interface TabRef {
  id: number;
  currentWindowId?: number;
}

export interface WindowRef {
  id: number;
  tabId: number;
  bufferId: number;
  gridId?: number;
  cursor?: BufferCursorPosition;
  selection?: BufferSelectionRange;
  gridBounds?: GridBounds;
  row?: number;
  col?: number;
  width?: number;
  height?: number;
  zIndex?: number;
  compIndex?: number;
}

export interface MirrorSpan {
  text: string;
  startIndex: number;
  endIndex: number;
  domNodeId: string;
  domStartOffset: number;
  domEndOffset: number;
  rects: Rect[];
  blockHint?: "block" | "inline";
}

export interface MirrorLine extends TextLine {
  spans: MirrorSpan[];
}

export interface MirrorDocument extends TextDocument<MirrorLine> {}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Compatibility name for the web wire protocol. */
export interface WebBufferSession extends PresentationSession<MirrorDocument> {
  url: string;
}

export interface GridBounds {
  mouseEnabled?: boolean;
  gridId: number;
  row: number;
  col: number;
  width: number;
  height: number;
  zIndex: number;
  compIndex: number;
}

export interface UiSnapshot {
  currentTabId: number | null;
  tabs: TabRef[];
  windows: WindowRef[];
  buffers: BufferRef[];
}

/** Web-specific mappings and Neovim geometry extend the shared attachment contract. */
export interface AttachedWebView extends AttachedPresentation<MirrorDocument> {
  url: string;
  cursor?: BufferCursorPosition;
  selection?: BufferSelectionRange;
  gridBounds?: GridBounds;
}

export interface BufferCursorPosition {
  row: number;
  /** Zero-based Unicode code-point column, including composing marks; not bytes or cells. */
  col: number;
}

export interface SelectionSpan {
  row: number;
  startCol: number;
  endCol: number;
}

export interface BufferSelectionRange {
  start: BufferCursorPosition;
  end: BufferCursorPosition;
  linewise?: boolean;
  /** Authoritative half-open code-point spans. Empty means no projectable text. */
  spans?: SelectionSpan[];
}

export interface CursorPosition {
  gridId: number;
  row: number;
  col: number;
}

export type CursorShape = "block" | "vertical" | "horizontal";

export interface CursorStyle {
  shape: CursorShape;
  cellPercentage: number;
  attrId?: number;
  attrIdLm?: number;
  blinkWait?: number;
  blinkOn?: number;
  blinkOff?: number;
  name?: string;
  shortName?: string;
}

export interface ModeState {
  name: string;
  index: number;
  cursor: CursorStyle;
}

export interface PrimaryScreenState {
  /** UI-related options reported by Neovim, captured at redraw boundaries. */
  options?: Record<string, boolean | number | string>;
  /** Reported capability settings incompatible with this presentation host. */
  unsupportedUiOptions?: string[];
  busy?: boolean;
  rows: number;
  cols: number;
  lines: string[];
  cells?: ScreenCell[][];
  runs: ScreenLineRun[][];
  cursor: CursorPosition | null;
  mode: ModeState;
  backgroundColor?: string;
  foregroundColor?: string;
  highlights: Record<number, HighlightAttrs>;
}

export interface GridScreenState {
  gridId: number;
  rows: number;
  cols: number;
  lines: string[];
  cells?: ScreenCell[][];
  runs: ScreenLineRun[][];
  cursor: CursorPosition | null;
}

export interface ScreenCell {
  text: string;
  highlightId: number;
}

export interface ScreenLineRun {
  /** Authoritative Neovim cell allocation, independent of UTF-16 length. */
  columns?: number;
  text: string;
  highlightId: number;
}

export interface HighlightAttrs {
  foreground?: string;
  background?: string;
  special?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  undercurl?: boolean;
  underdouble?: boolean;
  underdotted?: boolean;
  underdashed?: boolean;
  strikethrough?: boolean;
  reverse?: boolean;
}

export interface HighlightChunk {
  attrs?: HighlightAttrs;
  highlightId: number;
  text: string;
}

export interface CmdlineState {
  chunks?: HighlightChunk[];
  promptHighlightId?: number;
  promptHighlight?: HighlightAttrs;
  blockChunks?: HighlightChunk[][];
  visible: boolean;
  content: string;
  firstChar: string;
  prompt: string;
  position: number;
  indent: number;
  level: number;
  specialChar: string;
  specialShift: boolean;
  blockLines: string[];
}

export interface PopupmenuItem {
  word: string;
  kind?: string;
  menu?: string;
  info?: string;
}

export interface PopupmenuState {
  visible: boolean;
  items: PopupmenuItem[];
  selected: number;
  row: number;
  col: number;
  grid: number;
}

export interface MessageEntry {
  chunks?: HighlightChunk[];
  truncated?: boolean;
  /** Monotonic display revision, distinct from optional Neovim message IDs. */
  revision?: number;
  kind: string;
  text: string;
  id: string | number | null;
}

export interface MessageState {
  statusChunks?: Partial<Record<"showmode" | "showcmd" | "ruler", HighlightChunk[]>>;
  version: number;
  entries: MessageEntry[];
  showmode: string;
  showcmd: string;
  ruler: string;
  history: MessageEntry[];
  historyVisible: boolean;
}
