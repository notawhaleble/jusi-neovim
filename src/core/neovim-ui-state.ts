import { BufferRef, TabRef, UiSnapshot, WindowRef } from "./types.js";

export class NeovimUiState {
  private currentTabId: number | null = null;
  private readonly tabs = new Map<number, TabRef>();
  private readonly windows = new Map<number, WindowRef>();
  private readonly buffers = new Map<number, BufferRef>();

  setCurrentTab(tabId: number | null): void {
    this.currentTabId = tabId;
  }

  upsertTab(tab: TabRef): void {
    this.tabs.set(tab.id, tab);
  }

  removeTab(tabId: number): void {
    this.tabs.delete(tabId);
    if (this.currentTabId === tabId) {
      this.currentTabId = null;
    }
  }

  upsertWindow(window: WindowRef): void {
    const previous = this.windows.get(window.id);
    this.windows.set(window.id, {
      ...previous,
      ...window,
    });
  }

  removeWindow(windowId: number): void {
    for (const tab of this.tabs.values()) {
      if (tab.currentWindowId === windowId) {
        this.tabs.set(tab.id, {
          ...tab,
          currentWindowId: undefined,
        });
      }
    }
    this.windows.delete(windowId);
  }

  upsertBuffer(buffer: BufferRef): void {
    this.buffers.set(buffer.id, buffer);
  }

  removeBuffer(bufferId: number): void {
    this.buffers.delete(bufferId);
  }

  setTabCurrentWindow(tabId: number, windowId: number): void {
    const existing = this.tabs.get(tabId) ?? { id: tabId };
    this.tabs.set(tabId, {
      ...existing,
      currentWindowId: windowId,
    });
  }

  setWindowGridId(windowId: number, gridId: number): void {
    const existing = this.windows.get(windowId);
    if (!existing) {
      return;
    }
    this.windows.set(windowId, {
      ...existing,
      gridId,
    });
  }

  getSnapshot(): UiSnapshot {
    return {
      currentTabId: this.currentTabId,
      tabs: [...this.tabs.values()],
      windows: [...this.windows.values()],
      buffers: [...this.buffers.values()],
    };
  }
}
