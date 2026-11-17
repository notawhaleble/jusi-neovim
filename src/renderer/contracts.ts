import type { NvimMouseInput } from "../core/mouse.js";
import type { BrowserActionTarget } from "../backends/web/interaction.js";
import type { DocumentTicket } from "../presentation/document-revisions.js";
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
  nativeLayoutGeneration?: number;
  debugUi: boolean;
  presentationBufferIds: number[];
  snapshot: UiSnapshot;
  attachedWebViews: AttachedWebView[];
  screen: PrimaryScreenState;
  grids: GridScreenState[];
  cmdline: CmdlineState;
  popupmenu: PopupmenuState;
  messages: MessageState;
}

export interface PerfEvent {
  kind: string;
  [key: string]: string | number | boolean | null;
}

export interface RendererApi {
  getInitialState(): Promise<RendererSessionState>;
  readBrowserState(windowId: number, ticket: DocumentTicket): Promise<AttachedWebView | null>;
  onNativePopupControls(listener: (controls: NativePopupControl[]) => void): void;
  acknowledgeNativePopup(token: string, generation: number): Promise<boolean>;
  closeNativePopup(token: string): Promise<boolean>;
  retryNativeText(token: string): Promise<boolean>;
  reportNativeViewport(report: { generation: number; sequence: number; x: number; y: number;
    width: number; height: number; cellWidth: number; cellHeight: number; blocked: boolean }): Promise<boolean>;
  invalidateNativeViewport(): Promise<void>;
  onStateChanged(listener: (state: RendererSessionState) => void): void;
  onBrowserPointer(listener: (event: BrowserActionTarget & { x: number; y: number }) => void): void;
  onWebScroll(listener: (event: BrowserActionTarget & { lines: number }) => void): void;
  onBrowserRefresh(listener: (event: BrowserActionTarget) => void): void;
  reportBrowserTextStatus(bufferId: number, sessionId: string, guestId: number, status: string): Promise<void>;
  onWebRegion(listener: (event: BrowserActionTarget & { direction: number }) => void): void;
  onWebOpenLink(listener: (event: BrowserActionTarget) => void): void;
  onWebEnterMode(listener: (event: { bufferId: number; windowId: number }) => void): void;
  onLeaveWebMode(listener: () => void): void;
  onAppZoom(listener: (event: { action: "in" | "out" | "reset" }) => void): void;
  onWebZoomed(listener: () => void): void;
  onWebOpenActiveLink(listener: () => void): void;
  sendMouse(input: NvimMouseInput): Promise<boolean>;
  sendInput(keys: string): Promise<void>;
  sendWindowInput(keys: string): Promise<void>;
  resize(columns: number, lines: number): Promise<void>;
  runCommand(command: string): Promise<void>;
  onBrowserLinkSelected(listener: (event: { guestId: number; token: string }) => void): void;
  openBrowserLink(guestId: number, token: string, bufferId: number, sessionId: string): Promise<boolean>;
  armBrowserPopup(bufferId: number, sessionId: string, guestId: number): Promise<boolean>;
  resetBrowserInput(guestId: number): Promise<void>;
  setPresentationMode(bufferId: number, sessionId: string, windowId: number, mode: "rich" | "text"): Promise<boolean>;
  focusWindow(windowId: number): Promise<void>;
  setCursor(windowId: number, row: number, col: number, ticket: DocumentTicket): Promise<void>;
  invalidateDocument(bufferId: number, sessionId: string, guestId: number): Promise<boolean>;
  acquireDocument(bufferId: number, sessionId: string, guestId: number): Promise<DocumentTicket | null>;
  buildWorkerText(ticket: DocumentTicket): Promise<boolean>;
  updateWebMirror(ticket: DocumentTicket, mirror: MirrorDocument): Promise<boolean>;
  logPerf(event: PerfEvent): void;
}

export interface NativePopupControl {
  token: string; generation: number; bufferId: number; origin: string; scope: string;
  textStatus: import("../presentation/contracts.js").TextLayerStatus;
  x: number; y: number; width: number; height: number;
}
