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
  onExit?(listener: () => void): void;
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

export interface WebOpenLinkEvent {
  bufferId: number;
  windowId: number;
}

export interface WebEnterModeEvent {
  bufferId: number;
  windowId: number;
}

export class EmbeddedNvimSession {
  private readonly layout = new NvimLayoutController();
  private readonly router = new NvimNotificationRouter(this.layout);
  private attached = false;
  private readonly listeners = new Set<(state: EmbeddedSessionState) => void>();
  private readonly webScrollListeners = new Set<(event: WebScrollEvent) => void>();
  private readonly webOpenLinkListeners = new Set<(event: WebOpenLinkEvent) => void>();
  private readonly webEnterModeListeners = new Set<(event: WebEnterModeEvent) => void>();
  private readonly exitListeners = new Set<() => void>();
  private pendingStateEmit: ReturnType<typeof setTimeout> | null = null;
  private readonly pendingLayoutRefreshes = new Set<ReturnType<typeof setTimeout>>();

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
      if (notification.method === "jusi:web-open-link") {
        this.emitWebOpenLink(notification.args[0]);
        return;
      }
      if (notification.method === "jusi:web-enter-mode") {
        this.emitWebEnterMode(notification.args[0]);
        return;
      }
      if (this.router.handle(notification)) {
        this.scheduleStateEmit();
      }
    });
    this.client.onExit?.(() => {
      this.emitExit();
    });
  }

  onStateChanged(listener: (state: EmbeddedSessionState) => void): void {
    this.listeners.add(listener);
  }

  onWebScroll(listener: (event: WebScrollEvent) => void): void {
    this.webScrollListeners.add(listener);
  }

  onWebOpenLink(listener: (event: WebOpenLinkEvent) => void): void {
    this.webOpenLinkListeners.add(listener);
  }

  onWebEnterMode(listener: (event: WebEnterModeEvent) => void): void {
    this.webEnterModeListeners.add(listener);
  }

  onExit(listener: () => void): void {
    this.exitListeners.add(listener);
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
    await this.refreshVisibleLayoutSnapshot();
  }

  async resize(columns: number, lines: number): Promise<void> {
    await this.client.request("nvim_ui_try_resize", [columns, lines]);
    await this.refreshVisibleLayoutSnapshot();
  }

  async input(keys: string): Promise<void> {
    await this.client.request("nvim_input", [keys]);
  }

  async windowInput(keys: string): Promise<void> {
    await this.input(keys);
    this.scheduleVisibleLayoutRefresh(0);
    this.scheduleVisibleLayoutRefresh(25);
    this.scheduleVisibleLayoutRefresh(75);
  }

  async setRegister(name: string, value: string): Promise<void> {
    await this.client.request("nvim_call_function", ["setreg", [name, value]]);
  }

  async updateWebMirror(bufferId: number, mirror: MirrorDocument): Promise<void> {
    const lines = mirror.lines.map((line) => line.text);
    await this.client.request("nvim_exec_lua", [
      `
      local bufnr, lines = ...
      bufnr = tonumber(bufnr)
      if not bufnr or not vim.api.nvim_buf_is_valid(bufnr) then
        return
      end
      local modifiable = vim.api.nvim_get_option_value("modifiable", { buf = bufnr })
      local readonly = vim.api.nvim_get_option_value("readonly", { buf = bufnr })
      vim.api.nvim_set_option_value("modifiable", true, { buf = bufnr })
      vim.api.nvim_set_option_value("readonly", false, { buf = bufnr })
      vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, lines)
      vim.api.nvim_set_option_value("modified", false, { buf = bufnr })
      vim.api.nvim_set_option_value("readonly", readonly, { buf = bufnr })
      vim.api.nvim_set_option_value("modifiable", modifiable, { buf = bufnr })
      `,
      [bufferId, lines],
    ]);
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
    await this.refreshVisibleLayoutSnapshot();
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
    if (this.pendingStateEmit) {
      clearTimeout(this.pendingStateEmit);
      this.pendingStateEmit = null;
    }
    for (const timer of this.pendingLayoutRefreshes) {
      clearTimeout(timer);
    }
    this.pendingLayoutRefreshes.clear();
    this.listeners.clear();
    this.webScrollListeners.clear();
    this.webOpenLinkListeners.clear();
    this.webEnterModeListeners.clear();
    this.exitListeners.clear();
  }

  private emitExit(): void {
    for (const listener of this.exitListeners) {
      listener();
    }
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

  private emitWebOpenLink(payload: unknown): void {
    if (!payload || typeof payload !== "object") {
      return;
    }
    const event = payload as { bufferId?: unknown; windowId?: unknown };
    const bufferId = Number(event.bufferId);
    const windowId = Number(event.windowId);
    if (!Number.isFinite(bufferId) || !Number.isFinite(windowId)) {
      return;
    }
    for (const listener of this.webOpenLinkListeners) {
      listener({ bufferId, windowId });
    }
  }

  private emitWebEnterMode(payload: unknown): void {
    if (!payload || typeof payload !== "object") {
      return;
    }
    const event = payload as { bufferId?: unknown; windowId?: unknown };
    const bufferId = Number(event.bufferId);
    const windowId = Number(event.windowId);
    if (!Number.isFinite(bufferId) || !Number.isFinite(windowId)) {
      return;
    }
    for (const listener of this.webEnterModeListeners) {
      listener({ bufferId, windowId });
    }
  }

  private emitState(): void {
    if (this.pendingStateEmit) {
      clearTimeout(this.pendingStateEmit);
      this.pendingStateEmit = null;
    }
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  private scheduleStateEmit(): void {
    if (this.pendingStateEmit) {
      return;
    }
    this.pendingStateEmit = setTimeout(() => {
      this.pendingStateEmit = null;
      this.emitState();
    }, 0);
  }

  private getState(): EmbeddedSessionState {
    return {
      snapshot: this.layout.getVisibleSnapshot(),
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

  private async refreshVisibleLayoutSnapshot(): Promise<void> {
    try {
      await this.client.request("nvim_exec_lua", [
        "if _G.jusi_neovim_notify_visible_snapshot then _G.jusi_neovim_notify_visible_snapshot() elseif _G.jusi_neovim_notify_full_snapshot then _G.jusi_neovim_notify_full_snapshot() end",
        [],
      ]);
    } catch (_error) {
      // Layout notifications are best-effort; the redraw stream remains the primary UI source.
    }
  }

  private scheduleVisibleLayoutRefresh(delayMs: number): void {
    const timer = setTimeout(() => {
      this.pendingLayoutRefreshes.delete(timer);
      void this.refreshVisibleLayoutSnapshot();
    }, delayMs);
    this.pendingLayoutRefreshes.add(timer);
  }
}
