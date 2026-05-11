import {
  AttachedWebView,
  CmdlineState,
  GridScreenState,
  MessageState,
  PopupmenuState,
  PrimaryScreenState,
  UiSnapshot,
} from "../core/types.js";
import { NvimLayoutController } from "./layout-controller.js";
import {
  NvimNotificationRouter,
  RawNotification,
  RoutedNotificationResult,
} from "./notification-router.js";

export interface NvimRpcClient {
  onNotification(listener: (notification: RawNotification) => void): void;
  request(method: string, args?: unknown[]): Promise<unknown>;
  notify(method: string, args?: unknown[]): Promise<void> | void;
  dispose(): Promise<void> | void;
}

export interface EmbeddedSessionState {
  snapshot: UiSnapshot;
  attachedWebViews: AttachedWebView[];
  screen: PrimaryScreenState;
  grids: GridScreenState[];
  cmdline: CmdlineState;
  popupmenu: PopupmenuState;
  messages: MessageState;
}

export class EmbeddedNvimSession {
  private readonly layout = new NvimLayoutController();
  private readonly router = new NvimNotificationRouter(this.layout);
  private attached = false;
  private readonly listeners = new Set<(state: EmbeddedSessionState) => void>();

  constructor(private readonly client: NvimRpcClient) {}

  start(): void {
    if (this.attached) {
      return;
    }
    this.attached = true;
    this.client.onNotification((notification) => {
      const result = this.router.route(notification);
      if (result.handled) {
        this.emitState();
      }
    });
  }

  onStateChanged(listener: (state: EmbeddedSessionState) => void): void {
    this.listeners.add(listener);
  }

  async attachUi(columns: number, lines: number): Promise<void> {
    await this.client.request("nvim_ui_attach", [
      columns,
      lines,
      {
        rgb: true,
        ext_linegrid: true,
        ext_hlstate: true,
        ext_multigrid: true,
        ext_cmdline: true,
        ext_popupmenu: true,
        ext_messages: true,
      },
    ]);
    this.emitState();
  }

  async command(commandText: string): Promise<void> {
    await this.client.request("nvim_command", [commandText]);
    await this.refreshLayoutSnapshot();
  }

  async resize(columns: number, lines: number): Promise<void> {
    await this.client.request("nvim_ui_try_resize", [columns, lines]);
    await this.refreshLayoutSnapshot();
  }

  async input(keys: string): Promise<void> {
    await this.client.request("nvim_input", [keys]);
    await this.refreshLayoutSnapshot();
  }

  route(notification: RawNotification): RoutedNotificationResult {
    return this.router.route(notification);
  }

  getSnapshot(): UiSnapshot {
    return this.layout.getSnapshot();
  }

  getAttachedWebViews(): AttachedWebView[] {
    return this.layout.getAttachedWebViews();
  }

  getScreenState(): PrimaryScreenState {
    return this.router.getScreenState();
  }

  getGridStates(): GridScreenState[] {
    return this.router.getGridStates();
  }

  getCmdlineState(): CmdlineState {
    return this.router.getCmdlineState();
  }

  getPopupmenuState(): PopupmenuState {
    return this.router.getPopupmenuState();
  }

  getMessageState(): MessageState {
    return this.router.getMessageState();
  }

  async dispose(): Promise<void> {
    await this.client.dispose();
    this.listeners.clear();
  }

  private emitState(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  private getState(): EmbeddedSessionState {
    return {
      snapshot: this.getSnapshot(),
      attachedWebViews: this.getAttachedWebViews(),
      screen: this.getScreenState(),
      grids: this.getGridStates(),
      cmdline: this.getCmdlineState(),
      popupmenu: this.getPopupmenuState(),
      messages: this.getMessageState(),
    };
  }

  private async refreshLayoutSnapshot(): Promise<void> {
    try {
      await this.client.request("nvim_exec_lua", [
        "if _G.jusi_neovim_notify_full_snapshot then _G.jusi_neovim_notify_full_snapshot() end",
        [],
      ]);
    } catch (_error) {
      // Layout notifications are best-effort; the redraw stream remains the primary UI source.
    }
  }
}
