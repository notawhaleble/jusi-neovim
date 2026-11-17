import { PromptHighlightResolver } from "./prompt-highlight.js";
import { validMouseInput, type NvimMouseInput } from "../core/mouse.js";
import { workerDocument, type WorkerTextDocument } from "../presentation/worker-document.js";
import { DocumentTicket } from "../presentation/document-revisions.js";
import { validateMirror } from "../presentation/text-document.js";
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
  onRequest?(listener: (request: RawNotification) => unknown): void;
  onExit?(listener: () => void): void;
  request(method: string, args?: unknown[]): Promise<unknown>;
  notify(method: string, args?: unknown[]): Promise<void> | void;
  dispose(): Promise<void> | void;
}

export interface EmbeddedSessionState {
  presentationBufferIds: number[];
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

export interface WebRegionEvent extends WebOpenLinkEvent { direction: number; }

export interface WebEnterModeEvent {
  bufferId: number;
  windowId: number;
}

export interface ClipboardCopyEvent {
  register: string;
  lines: unknown;
  regtype: unknown;
}

export class EmbeddedNvimSession {
  private readonly layout = new NvimLayoutController();
  private readonly router = new NvimNotificationRouter(this.layout, () => this.captureFlushedState());
  private highlightEpoch = 0;
  private completedHighlightEpoch = 0;
  private readonly promptHighlights = new PromptHighlightResolver(
    id => this.client.request('nvim_get_hl', [0, {id, link:false, create:false}]),
    () => {
      if (this.closed) return;
      // Enrich only the completed frame, never sample an incomplete redraw.
      this.presentationState = {...this.presentationState,
        cmdline:this.promptHighlights.update(this.presentationState.cmdline,this.completedHighlightEpoch)};
      this.publishState();
    });
  private attached = false;
  private closed = false;
  private mouseGesture: NvimMouseInput | null = null;
  private workerSequence = 0;
  private workerTransportClosed = false;
  private workerRequests = new Map<number, { finish(error?: Error, value?: WorkerTextDocument): void }>();
  private readonly listeners = new Set<(state: EmbeddedSessionState) => void>();
  private readonly webScrollListeners = new Set<(event: WebScrollEvent) => void>();
  private readonly webRegionListeners = new Set<(event: WebRegionEvent) => void>();
  private readonly webOpenLinkListeners = new Set<(event: WebOpenLinkEvent) => void>();
  private readonly webEnterModeListeners = new Set<(event: WebEnterModeEvent) => void>();
  private readonly clipboardCopyListeners = new Set<(event: ClipboardCopyEvent) => void>();
  private readonly exitListeners = new Set<() => void>();
  private pendingStateEmit: ReturnType<typeof setTimeout> | null = null;
  private readonly pendingLayoutRefreshes = new Set<ReturnType<typeof setTimeout>>();

  private presentationState: EmbeddedSessionState;
  private presentationDirty = false;
  private reportedUiIssues = '';

  constructor(private readonly client: NvimRpcClient) {
    this.presentationState = this.getState();
  }

  /** Last completed presentation frame; live ownership queries remain independent. */
  getPresentationState(): EmbeddedSessionState { return this.presentationState; }


  start(): void {
    if (this.attached) {
      return;
    }
    this.attached = true;
    this.client.onNotification((notification) => {
      if (notification.method === "jusi:worker-text") {
        const reply = notification.args[0] as { id?: number; error?: unknown; document?: unknown };
        const pending = reply && this.workerRequests.get(reply.id!);
        if (pending) {
          try {
            if (reply.error != null) throw new Error(String(reply.error).slice(0, 4096));
            pending.finish(undefined, workerDocument(reply.document));
          } catch (error) { pending.finish(error instanceof Error ? error : new Error("Invalid worker result")); }
        }
        return;
      }
      if (notification.method === "jusi:web-scroll") {
        this.emitWebScroll(notification.args[0]);
        return;
      }
      if (notification.method === "jusi:web-region") {
        this.emitWebRegion(notification.args[0]);
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
      if (notification.method === "jusi:clipboard-copy") {
        this.emitClipboardCopy(notification.args[0]);
        return;
      }
      if (notification.method === 'redraw' && notification.args.some(event => Array.isArray(event)
        && ['hl_attr_define','hl_group_set','default_colors_set','cmdline_hide'].includes(event[0]))) this.highlightEpoch++;
      const handled = this.router.handle(notification);
      if (handled && notification.method !== "redraw") this.scheduleStateEmit();
    });
    this.client.onExit?.(() => {
      this.emitExit();
    });
  }

  onStateChanged(listener: (state: EmbeddedSessionState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onWebScroll(listener: (event: WebScrollEvent) => void): void {
    this.webScrollListeners.add(listener);
  }

  onWebRegion(listener: (event: WebRegionEvent) => void): void { this.webRegionListeners.add(listener); }

  onWebOpenLink(listener: (event: WebOpenLinkEvent) => void): void {
    this.webOpenLinkListeners.add(listener);
  }

  onWebEnterMode(listener: (event: WebEnterModeEvent) => void): void {
    this.webEnterModeListeners.add(listener);
  }

  onClipboardCopy(listener: (event: ClipboardCopyEvent) => void): void {
    this.clipboardCopyListeners.add(listener);
  }

  onExit(listener: () => void): () => void {
    this.exitListeners.add(listener);
    return () => this.exitListeners.delete(listener);
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

  async setPresentationMode(bufferId: number, incarnation: number, windowId: number, mode: "rich" | "text"): Promise<boolean> {
    return await this.client.request("nvim_exec_lua", ['return require("jusi_neovim").set_mode(...)', [bufferId, incarnation, windowId, mode]]) as boolean;
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

  async mouseInput(input: NvimMouseInput): Promise<boolean> {
    if (this.closed || !validMouseInput(input)) return false;
    const snapshot = this.getSnapshot();
    const continuingRootGesture = input.grid === 1 && (input.action === 'drag' || input.action === 'release')
      && this.mouseGesture?.grid === 1 && this.mouseGesture.tabId === input.tabId
      && this.mouseGesture.button === input.button;
    // A tabline press can change the active tab. Finish that same root gesture.
    if (snapshot.currentTabId !== input.tabId && !continuingRootGesture) return false;
    if (input.grid !== 1) {
      const owner = snapshot.windows.find(w => w.id === input.windowId && w.gridId === input.grid
        && w.tabId === input.tabId);
      if (!owner || owner.gridBounds?.mouseEnabled === false) return false;
    }
    if (input.action === 'press') this.mouseGesture = input;
    if (input.action === 'release') this.mouseGesture = null;
    await this.client.request("nvim_input_mouse", [input.button, input.action, input.modifier,
      input.grid, input.row, input.col]);
    return true;
  }

  async windowInput(keys: string): Promise<void> {
    await this.input(keys);
    this.scheduleVisibleLayoutRefresh(0);
    this.scheduleVisibleLayoutRefresh(25);
    this.scheduleVisibleLayoutRefresh(75);
  }

  setBrowserAutoRefresh(bufferId: number, enabled: boolean): void {
    const current = this.getWebSession(bufferId);
    if (!current) return;
    current.autoRefresh = enabled; this.emitState();
  }
  async setBrowserTextStatus(identity: { bufferId: number; sessionId: string; incarnation?: number }, status: string): Promise<void> {
    const current = this.getWebSession(identity.bufferId);
    if (current?.sessionId !== identity.sessionId || current.incarnation !== identity.incarnation) return;
    await this.client.request("nvim_exec_lua", ['return require("jusi_neovim.browser").status(...)', [identity, status]]);
  }
  async setBrowserLocation(identity: { bufferId: number; sessionId: string; incarnation: number }, url: string): Promise<void> {
    const current = this.getWebSession(identity.bufferId);
    if (current?.providerId !== "web" || current.sessionId !== identity.sessionId || current.incarnation !== identity.incarnation) return;
    await this.client.request("nvim_exec_lua", ['return require("jusi_neovim.browser").location(...)', [{bufferId: identity.bufferId, sessionId: identity.sessionId, incarnation: identity.incarnation}, url]]);
  }
  async setRegister(name: string, value: string): Promise<void> {
    await this.client.request("nvim_call_function", ["setreg", [name, value]]);
  }

  async installClipboardProvider(runtimePluginPath?: string): Promise<void> {
    const apiInfo = await this.client.request("nvim_get_api_info", []);
    const channelId = Array.isArray(apiInfo) ? Number(apiInfo[0]) : 0;
    await this.client.request("nvim_exec_lua", [
      `
      local runtime_plugin_path, channel_id = ...
      if type(_G.jusi_neovim_install_clipboard_provider) ~= "function" and type(runtime_plugin_path) == "string" and runtime_plugin_path ~= "" then
        vim.cmd("source " .. vim.fn.fnameescape(runtime_plugin_path))
      end
      if type(_G.jusi_neovim_install_clipboard_provider) ~= "function" then
        error("jusi-neovim runtime clipboard provider is not available")
      end
      vim.g.jusi_neovim_rpc_channel = channel_id
      _G.jusi_neovim_install_clipboard_provider()
      `,
      [runtimePluginPath ?? "", channelId],
    ]);
  }

  getWebSession(bufferId: number) { return this.layout.getWebSession(bufferId); }

  private matchesDocument(ticket: DocumentTicket): boolean {
    const session = this.getWebSession(ticket.bufferId);
    return session?.sessionId === ticket.sessionId && session?.incarnation === ticket.incarnation;
  }

  async invalidateWebDocument(ticket: DocumentTicket): Promise<boolean> {
    if (!this.matchesDocument(ticket)) return false;
    this.layout.clearMirror(ticket.bufferId);
    this.emitState();
    const accepted = await this.client.request("nvim_exec_lua", [
      'return require("jusi_neovim.document").invalidate(...)', [ticket],
    ]);
    return accepted === true && this.matchesDocument(ticket);
  }

  async extractWorkerText(ticket: DocumentTicket): Promise<WorkerTextDocument> {
    if (!this.matchesDocument(ticket) || this.getWebSession(ticket.bufferId)?.textSource !== "worker") throw new Error("Worker session changed");
    const info = await this.client.request("nvim_get_api_info", []);
    const channel = Array.isArray(info) ? Number(info[0]) : 0;
    if (!Number.isSafeInteger(channel) || channel <= 0) throw new Error("Worker RPC channel unavailable");
    if (this.workerTransportClosed || !this.matchesDocument(ticket)) throw new Error("Worker session closed or changed");
    if (this.workerRequests.size >= 32) throw new Error("Too many worker text requests");
    const id = ++this.workerSequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error("Worker text response timed out")), 61000);
      const finish = (error?: Error, value?: WorkerTextDocument) => {
        if (!this.workerRequests.delete(id)) return;
        clearTimeout(timer);
        if (error) reject(error); else resolve(value!);
      };
      this.workerRequests.set(id, { finish });
      void this.client.request("nvim_exec_lua", ['return require("jusi_neovim").extract_rpc(...)', [id, ticket, channel]])
        .catch(error => finish(error instanceof Error ? error : new Error(String(error))));
    });
  }

  async writeWorkerText(ticket: DocumentTicket, document: WorkerTextDocument): Promise<boolean> {
    const value = workerDocument(document);
    if (!this.matchesDocument(ticket) || this.getWebSession(ticket.bufferId)?.textSource !== "worker") return false;
    const accepted = await this.client.request("nvim_exec_lua", [
      'return require("jusi_neovim.document").commit_worker(...)', [ticket, value],
    ]);
    return accepted === true && this.matchesDocument(ticket);
  }

  publishWorkerText(ticket: DocumentTicket, document: WorkerTextDocument): void {
    if (!this.matchesDocument(ticket)) return;
    const session = this.getWebSession(ticket.bufferId)!;
    session.workerText = document;
    this.emitState();
  }

  private cancelWorkerRequests(): void {
    this.workerTransportClosed = true;
    for (const request of this.workerRequests.values()) request.finish(new Error("Neovim session closed"));
  }

  async writeWebMirror(ticket: DocumentTicket, mirror: MirrorDocument): Promise<boolean> {
    validateMirror(mirror);
    if (!this.matchesDocument(ticket)) return false;
    const accepted = await this.client.request("nvim_exec_lua", [
      'return require("jusi_neovim.document").commit(...)', [ticket, mirror.lines.map(line => line.text)],
    ]);
    return accepted === true && this.matchesDocument(ticket);
  }

  publishWebMirror(ticket: DocumentTicket, mirror: MirrorDocument): void {
    if (!this.matchesDocument(ticket)) return;
    this.route({ method: "jusi:web-mirror", args: [{ bufferId: ticket.bufferId, mirror }] });
    this.emitState();
  }

  async setCursor(windowId: number, row: number, col: number, ticket?: DocumentTicket): Promise<void> {
    await this.client.request("nvim_exec_lua", [
      `
      local winid, row, col, ticket = ...
      winid = tonumber(winid)
      row = tonumber(row)
      col = tonumber(col)
      if not winid or not row or not col or not vim.api.nvim_win_is_valid(winid) then
        return
      end
      local bufnr = vim.api.nvim_win_get_buf(winid)
      if type(ticket) == "table" then
        local current = vim.b[bufnr].jusi_document
        if bufnr ~= ticket.bufferId or vim.b[bufnr].jusi_incarnation ~= ticket.incarnation
          or not current or current.sessionId ~= ticket.sessionId or current.revision ~= ticket.revision
          or vim.api.nvim_win_get_tabpage(winid) ~= vim.api.nvim_get_current_tabpage() then return end
      end
      local line_count = vim.api.nvim_buf_line_count(bufnr)
      row = math.max(0, math.min(row, line_count - 1))
      local line = vim.api.nvim_buf_get_lines(bufnr, row, row + 1, false)[1] or ""
      col = math.max(0, math.min(col, vim.fn.strchars(line)))
      local byte_col = vim.fn.byteidxcomp(line, col)
      if byte_col < 0 then
        byte_col = #line
      end
      vim.api.nvim_set_current_win(winid)
      vim.api.nvim_win_set_cursor(winid, { row + 1, byte_col })
      `,
      [windowId, row, col, ticket ?? null],
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

  /** Live interaction state is separate from completed renderer frames. */
  getInteractionView(windowId: number, ticket: DocumentTicket): AttachedWebView | undefined {
    if (!ticket || !Number.isSafeInteger(windowId) || !this.matchesDocument(ticket)) return;
    const currentTab = this.layout.getSnapshot().currentTabId;
    return this.getAttachedWebViews().find(view => view.windowId === windowId
      && view.bufferId === ticket.bufferId && view.tabId === currentTab
      && view.mirror?.version === ticket.revision);
  }

  getScreenState(): PrimaryScreenState {
    return this.router.getScreenState();
  }

  getGridStates(): GridScreenState[] {
    return this.router.getGridStates(this.layout.getVisibleGridIds());
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
    this.closed = true;
    this.promptHighlights.dispose();
    this.cancelWorkerRequests();
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
    this.webRegionListeners.clear();
    this.webEnterModeListeners.clear();
    this.clipboardCopyListeners.clear();
    this.exitListeners.clear();
  }

  private emitExit(): void {
    this.closed = true;
    this.promptHighlights.dispose();
    if (this.pendingStateEmit) clearTimeout(this.pendingStateEmit);
    this.pendingStateEmit = null;
    this.cancelWorkerRequests();
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

  private emitWebRegion(payload: unknown): void {
    if (!payload || typeof payload !== "object") {
      return;
    }
    const event = payload as { bufferId?: unknown; windowId?: unknown; direction?: unknown };
    const bufferId = Number(event.bufferId);
    const windowId = Number(event.windowId);
    if (!Number.isFinite(bufferId) || !Number.isFinite(windowId)) {
      return;
    }
    if (event.direction !== 1 && event.direction !== -1) return;
    for (const listener of this.webRegionListeners) {
      listener({ bufferId, windowId, direction: event.direction });
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

  private emitClipboardCopy(payload: unknown): void {
    if (!payload || typeof payload !== "object") {
      return;
    }
    const event = payload as { register?: unknown; lines?: unknown; regtype?: unknown };
    const register = typeof event.register === "string" ? event.register : "";
    if (register !== "*" && register !== "+") {
      return;
    }
    for (const listener of this.clipboardCopyListeners) {
      listener({ register, lines: event.lines, regtype: event.regtype });
    }
  }

  private emitState(): void {
    if (this.closed || this.router.hasPendingFrame) return;
    this.presentationState = this.getState();
    this.presentationDirty = false;
    this.publishState();
  }

  private publishState(): void {
    if (this.closed) return;
    if (this.pendingStateEmit) {
      clearTimeout(this.pendingStateEmit);
      this.pendingStateEmit = null;
    }
    const state = this.presentationState;
    const issues = (state.screen.unsupportedUiOptions ?? []).join(', ');
    if (issues !== this.reportedUiIssues) {
      this.reportedUiIssues = issues;
      if (issues) console.error(`[nvim-ui-capabilities] Unsupported negotiated options: ${issues}. Other attached UIs must support this host's external UI capabilities.`);
    }
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  private captureFlushedState(): void {
    if (this.closed) return;
    // Capture now: the same notification may start another, incomplete frame.
    this.presentationState = this.getState();
    this.presentationDirty = false;
    this.scheduleStateEmit(false);
  }

  private scheduleStateEmit(refresh = true): void {
    if (this.closed) return;
    if (refresh) this.presentationDirty = true;
    if (this.router.hasPendingFrame || this.pendingStateEmit) return;
    this.pendingStateEmit = setTimeout(() => {
      this.pendingStateEmit = null;
      // Metadata-only updates remain coalesced. Never sample an incomplete redraw.
      if (!this.router.hasPendingFrame && this.presentationDirty) {
        this.presentationState = this.getState();
        this.presentationDirty = false;
      }
      this.publishState();
    }, 0);
  }

  private getState(): EmbeddedSessionState {
    this.completedHighlightEpoch = this.highlightEpoch;
    return {
      presentationBufferIds: this.layout.getSnapshot().buffers.filter(buffer => buffer.kind === "web").map(buffer => buffer.id),
      snapshot: this.layout.getVisibleSnapshot(),
      attachedWebViews: this.getAttachedWebViews(),
      screen: this.getScreenState(),
      grids: this.getGridStates(),
      cmdline: this.promptHighlights.update(this.getCmdlineState(), this.highlightEpoch),
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
