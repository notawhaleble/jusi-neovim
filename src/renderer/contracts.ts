import {
  AttachedWebView,
  CmdlineState,
  GridScreenState,
  MessageState,
  MirrorDocument,
  PopupmenuState,
  PrimaryScreenState,
  UiSnapshot,
} from "../core/types.js";

export interface RendererSessionState {
  debugUi: boolean;
  snapshot: UiSnapshot;
  attachedWebViews: AttachedWebView[];
  screen: PrimaryScreenState;
  grids: GridScreenState[];
  cmdline: CmdlineState;
  popupmenu: PopupmenuState;
  messages: MessageState;
}

export interface RendererApi {
  getInitialState(): Promise<RendererSessionState>;
  onStateChanged(listener: (state: RendererSessionState) => void): void;
  onWebScroll(listener: (event: { bufferId: number; windowId: number; lines: number }) => void): void;
  onWebOpenLink(listener: (event: { bufferId: number; windowId: number }) => void): void;
  onWebEnterMode(listener: (event: { bufferId: number; windowId: number }) => void): void;
  onLeaveWebMode(listener: () => void): void;
  sendInput(keys: string): Promise<void>;
  resize(columns: number, lines: number): Promise<void>;
  runCommand(command: string): Promise<void>;
  focusWindow(windowId: number): Promise<void>;
  setCursor(windowId: number, row: number, col: number): Promise<void>;
  updateWebMirror(bufferId: number, mirror: MirrorDocument): Promise<void>;
}
