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

export interface WebScrollEvent {
  bufferId: number;
  windowId: number;
  lines: number;
}

export class EmbeddedNvimSession {
  private readonly layout = new NvimLayoutController();
  private readonly router = new NvimNotificationRouter(this.layout);
  private attached = false;
  private readonly listeners = new Set<(state: EmbeddedSessionState) => void>();
  private readonly webScrollListeners = new Set<(event: WebScrollEvent) => void>();

  constructor(private readonly client: NvimRpcClient) {}

  start(): void {
    if (this.attached) {
      return;
    }
    this.attached = true;
    this.client.onNotification((notification) => {
      if (notification.method === "jusi:web-scroll") {
        this.emitWebScroll(notification.args[0]);
        return;
      }
      const result = this.router.route(notification);
      if (result.handled) {
        this.emitState();
      }
    });
  }

  onStateChanged(listener: (state: EmbeddedSessionState) => void): void {
    this.listeners.add(listener);
  }

  onWebScroll(listener: (event: WebScrollEvent) => void): void {
    this.webScrollListeners.add(listener);
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
  }

  async updateWebMirror(bufferId: number, mirror: MirrorDocument): Promise<void> {
    const lines = mirror.lines.map((line) => line.text);
    await this.client.request("nvim_buf_set_lines", [bufferId, 0, -1, false, lines]);
    this.route({
      method: "jusi:web-mirror",
      args: [{
        bufferId,
        mirror,
      }],
    });
    this.emitState();
  }

  async setCursor(windowId: number, row: number, col: number): Promise<void> {
    await this.client.request("nvim_exec_lua", [
      `
      local winid, row, col = ...
      winid = tonumber(winid)
      row = tonumber(row)
      col = tonumber(col)
      if not winid or not row or not col or not vim.api.nvim_win_is_valid(winid) then
        return
      end
      local bufnr = vim.api.nvim_win_get_buf(winid)
      local line_count = vim.api.nvim_buf_line_count(bufnr)
      row = math.max(0, math.min(row, line_count - 1))
      local line = vim.api.nvim_buf_get_lines(bufnr, row, row + 1, false)[1] or ""
      col = math.max(0, math.min(col, vim.fn.strchars(line)))
      local byte_col = vim.fn.byteidx(line, col)
      if byte_col < 0 then
        byte_col = #line
      end
      vim.api.nvim_set_current_win(winid)
      vim.api.nvim_win_set_cursor(winid, { row + 1, byte_col })
      `,
      [windowId, row, col],
    ]);
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
    this.webScrollListeners.clear();
  }

  private emitWebScroll(payload: unknown): void {
    if (!payload || typeof payload !== "object") {
      return;
    }
    const event = payload as { bufferId?: unknown; windowId?: unknown; lines?: unknown };
    const bufferId = Number(event.bufferId);
    const windowId = Number(event.windowId);
    const lines = Number(event.lines);
    if (!Number.isFinite(bufferId) || !Number.isFinite(windowId) || !Number.isFinite(lines)) {
      return;
    }
    for (const listener of this.webScrollListeners) {
      listener({ bufferId, windowId, lines });
    }
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
