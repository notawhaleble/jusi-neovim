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

export interface MirrorLine {
  lineNumber: number;
  text: string;
  startIndex: number;
  endIndex: number;
  spans: MirrorSpan[];
}

export interface MirrorDocument {
  version: number;
  lines: MirrorLine[];
  totalTextLength: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WebBufferSession {
  bufferId: number;
  url: string;
  title?: string;
  mirror?: MirrorDocument;
  attachedWindowId: number | null;
  lastKnownTabId: number | null;
}

export interface GridBounds {
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

export interface AttachedWebView {
  bufferId: number;
  windowId: number;
  tabId: number | null;
  url: string;
  title?: string;
  mirror?: MirrorDocument;
  cursor?: BufferCursorPosition;
  selection?: BufferSelectionRange;
  gridBounds?: GridBounds;
}

export interface BufferCursorPosition {
  row: number;
  col: number;
}

export interface BufferSelectionRange {
  start: BufferCursorPosition;
  end: BufferCursorPosition;
  linewise?: boolean;
}

export interface CursorPosition {
  gridId: number;
  row: number;
  col: number;
}

export interface PrimaryScreenState {
  rows: number;
  cols: number;
  lines: string[];
  cells?: ScreenCell[][];
  runs: ScreenLineRun[][];
  cursor: CursorPosition | null;
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
  reverse?: boolean;
}

export interface CmdlineState {
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
  kind: string;
  text: string;
  id: string | number | null;
}

export interface MessageState {
  version: number;
  entries: MessageEntry[];
  showmode: string;
  showcmd: string;
  ruler: string;
  history: MessageEntry[];
  historyVisible: boolean;
}
