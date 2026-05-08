import {
  AttachedWebView,
  CmdlineState,
  GridScreenState,
  PopupmenuState,
  PrimaryScreenState,
  UiSnapshot,
} from "../core/types.js";

export interface RendererSessionState {
  snapshot: UiSnapshot;
  attachedWebViews: AttachedWebView[];
  screen: PrimaryScreenState;
  grids: GridScreenState[];
  cmdline: CmdlineState;
  popupmenu: PopupmenuState;
}

export interface RendererApi {
  getInitialState(): Promise<RendererSessionState>;
  onStateChanged(listener: (state: RendererSessionState) => void): void;
  sendInput(keys: string): Promise<void>;
  resize(columns: number, lines: number): Promise<void>;
  runCommand(command: string): Promise<void>;
  focusWindow(windowId: number): Promise<void>;
}
