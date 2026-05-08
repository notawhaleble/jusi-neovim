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
  row?: number;
  col?: number;
  width?: number;
  height?: number;
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
  gridBounds?: GridBounds;
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
  cursor: CursorPosition | null;
  backgroundColor?: string;
  foregroundColor?: string;
}

export interface GridScreenState {
  gridId: number;
  rows: number;
  cols: number;
  lines: string[];
  cursor: CursorPosition | null;
}

export interface CmdlineState {
  visible: boolean;
  content: string;
  firstChar: string;
  prompt: string;
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
