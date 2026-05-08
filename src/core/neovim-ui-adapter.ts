import { NeovimUiState } from "./neovim-ui-state.js";
import { UiSnapshot, WindowRef } from "./types.js";
import { WebBufferRegistry } from "./web-buffer-registry.js";

export type UiLayoutEvent =
  | {
      type: "current-tab";
      tabId: number | null;
    }
  | {
      type: "tab";
      tabId: number;
      currentWindowId?: number;
    }
  | {
      type: "tab-close";
      tabId: number;
    }
  | {
      type: "buffer";
      bufferId: number;
      kind: "text" | "web";
      name?: string;
    }
  | {
      type: "buffer-close";
      bufferId: number;
    }
  | {
      type: "window";
      windowId: number;
      tabId: number;
      bufferId: number;
      gridId?: number;
      row?: number;
      col?: number;
      width?: number;
      height?: number;
    }
  | {
      type: "window-close";
      windowId: number;
    }
  | {
      type: "tab-current-window";
      tabId: number;
      windowId: number;
    };

export class NeovimUiAdapter {
  constructor(
    private readonly uiState: NeovimUiState,
    private readonly webBuffers: WebBufferRegistry,
  ) {}

  apply(event: UiLayoutEvent): UiSnapshot {
    switch (event.type) {
      case "current-tab":
        this.uiState.setCurrentTab(event.tabId);
        break;
      case "tab":
        this.uiState.upsertTab({
          id: event.tabId,
          currentWindowId: event.currentWindowId,
        });
        break;
      case "tab-close":
        this.uiState.removeTab(event.tabId);
        break;
      case "buffer":
        this.uiState.upsertBuffer({
          id: event.bufferId,
          kind: event.kind,
          name: event.name,
        });
        this.webBuffers.registerBuffer({
          id: event.bufferId,
          kind: event.kind,
          name: event.name,
        });
        break;
      case "buffer-close":
        this.uiState.removeBuffer(event.bufferId);
        break;
      case "window":
        this.uiState.upsertWindow({
          id: event.windowId,
          tabId: event.tabId,
          bufferId: event.bufferId,
          gridId: event.gridId,
          row: event.row,
          col: event.col,
          width: event.width,
          height: event.height,
        });
        break;
      case "window-close":
        this.uiState.removeWindow(event.windowId);
        break;
      case "tab-current-window":
        this.uiState.setTabCurrentWindow(event.tabId, event.windowId);
        break;
      default:
        return this.sync();
    }

    return this.sync();
  }

  private sync(): UiSnapshot {
    const snapshot = this.uiState.getSnapshot();
    if (snapshot.currentTabId !== null) {
      this.webBuffers.setCurrentTab({ id: snapshot.currentTabId });
    }
    this.webBuffers.updateWindows(this.selectVisibleWindows(snapshot.windows, snapshot.currentTabId));
    return snapshot;
  }

  private selectVisibleWindows(windows: WindowRef[], currentTabId: number | null): WindowRef[] {
    if (currentTabId === null) {
      return [];
    }
    return windows.filter((window) => window.tabId === currentTabId);
  }
}
