import { BufferRef, MirrorDocument, TabRef, WebBufferSession, WindowRef } from "./types.js";

type VisibleState = {
  currentTabId: number | null;
  windows: Map<number, WindowRef>;
  buffers: Map<number, BufferRef>;
};

export class WebBufferRegistry {
  private readonly sessions = new Map<number, WebBufferSession>();
  private readonly visibleState: VisibleState = {
    currentTabId: null,
    windows: new Map(),
    buffers: new Map(),
  };

  registerBuffer(buffer: BufferRef): void {
    this.visibleState.buffers.set(buffer.id, buffer);
  }

  registerSession(session: Omit<WebBufferSession, "attachedWindowId" | "lastKnownTabId">): void {
    this.sessions.set(session.bufferId, {
      ...session,
      attachedWindowId: null,
      lastKnownTabId: null,
    });
    this.reconcile();
  }

  updateWindows(windows: WindowRef[]): void {
    this.visibleState.windows.clear();
    for (const window of windows) {
      this.visibleState.windows.set(window.id, window);
    }
    this.reconcile();
  }

  setCurrentTab(tab: TabRef): void {
    this.visibleState.currentTabId = tab.id;
    this.reconcile();
  }

  getSession(bufferId: number): WebBufferSession | undefined {
    return this.sessions.get(bufferId);
  }

  listSessions(): WebBufferSession[] {
    return [...this.sessions.values()];
  }

  updateMirror(bufferId: number, mirror: MirrorDocument): void {
    const session = this.sessions.get(bufferId);
    if (!session) {
      return;
    }
    session.mirror = mirror;
  }

  private reconcile(): void {
    const currentTabId = this.visibleState.currentTabId;
    for (const session of this.sessions.values()) {
      const buffer = this.visibleState.buffers.get(session.bufferId);
      if (!buffer || buffer.kind !== "web") {
        session.attachedWindowId = null;
        session.lastKnownTabId = null;
        continue;
      }

      if (currentTabId === null) {
        session.attachedWindowId = null;
        continue;
      }

      const candidates = [...this.visibleState.windows.values()].filter((window) => {
        return window.tabId === currentTabId && window.bufferId === session.bufferId;
      });

      if (candidates.length === 0) {
        session.attachedWindowId = null;
        continue;
      }

      const preferred =
        candidates.find((window) => window.id === session.attachedWindowId) ??
        candidates[0];

      session.attachedWindowId = preferred.id;
      session.lastKnownTabId = preferred.tabId;
    }
  }
}
