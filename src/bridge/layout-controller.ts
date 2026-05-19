import { NeovimUiAdapter } from "../core/neovim-ui-adapter.js";
import { NeovimUiState } from "../core/neovim-ui-state.js";
import {
  AttachedWebView,
  GridBounds,
  UiSnapshot,
  WebBufferSession,
  WindowRef,
} from "../core/types.js";
import { WebBufferRegistry } from "../core/web-buffer-registry.js";
import { NvimGeometryEvent, NvimMetadataEvent } from "./protocol.js";

export class NvimLayoutController {
  private readonly uiState = new NeovimUiState();
  private readonly webBuffers = new WebBufferRegistry();
  private readonly adapter = new NeovimUiAdapter(this.uiState, this.webBuffers);
  private readonly gridBounds = new Map<number, GridBounds>();
  private readonly gridBoundRevisions = new Map<number, number>();
  private readonly windowGridIds = new Map<number, number>();
  private geometryRevision = 0;

  applyMetadata(event: NvimMetadataEvent): UiSnapshot {
    if (event.type === "web-session") {
      this.webBuffers.registerSession({
        bufferId: event.bufferId,
        url: event.url,
        title: event.title,
      });
      return this.uiState.getSnapshot();
    }

    if (event.type === "web-mirror") {
      this.webBuffers.updateMirror(event.bufferId, event.mirror);
      return this.uiState.getSnapshot();
    }

    const snapshot = this.adapter.apply(event);
    this.reconcileWindowGridIds();
    return snapshot;
  }

  applyGeometry(event: NvimGeometryEvent): void {
    switch (event.type) {
      case "grid-bounds":
        this.gridBounds.set(event.bounds.gridId, event.bounds);
        this.gridBoundRevisions.set(event.bounds.gridId, ++this.geometryRevision);
        if (typeof event.windowId === "number") {
          this.windowGridIds.set(event.windowId, event.bounds.gridId);
          this.uiState.setWindowGridId(event.windowId, event.bounds.gridId);
          this.uiState.updateWindowGeometry(event.windowId, {
            zIndex: event.bounds.zIndex,
            compIndex: event.bounds.compIndex,
            gridBounds: event.bounds,
          });
        } else {
          this.reconcileWindowGridIds();
        }
        break;
      case "grid-close":
        this.gridBounds.delete(event.gridId);
        this.gridBoundRevisions.delete(event.gridId);
        for (const [windowId, gridId] of this.windowGridIds.entries()) {
          if (gridId === event.gridId) {
            this.windowGridIds.delete(windowId);
          }
        }
        break;
    }
  }

  getSnapshot(): UiSnapshot {
    return this.uiState.getSnapshot();
  }

  getVisibleSnapshot(): UiSnapshot {
    return this.visibleSnapshot(this.uiState.getSnapshot());
  }

  getVisibleGridIds(): Set<number> {
    const gridIds = new Set<number>();
    const snapshot = this.getVisibleSnapshot();
    for (const window of snapshot.windows) {
      if (typeof window.gridId === "number") {
        gridIds.add(window.gridId);
      }
      if (typeof window.gridBounds?.gridId === "number") {
        gridIds.add(window.gridBounds.gridId);
      }
    }
    return gridIds;
  }

  getAttachedWebViews(): AttachedWebView[] {
    const snapshot = this.uiState.getSnapshot();
    const windowsById = new Map<number, WindowRef>();
    for (const window of snapshot.windows) {
      windowsById.set(window.id, window);
    }

    return this.webBuffers
      .listSessions()
      .map((session) => this.toAttachedWebView(session, windowsById))
      .filter((view): view is AttachedWebView => view !== null);
  }

  private toAttachedWebView(
    session: WebBufferSession,
    windowsById: Map<number, WindowRef>,
  ): AttachedWebView | null {
    if (session.attachedWindowId === null) {
      return null;
    }

    const window = windowsById.get(session.attachedWindowId);
    if (!window) {
      return null;
    }

    return {
      bufferId: session.bufferId,
      windowId: window.id,
      tabId: session.lastKnownTabId,
      url: session.url,
      title: session.title,
      mirror: session.mirror,
      cursor: window.cursor,
      selection: window.selection,
      gridBounds: this.resolveContentBounds(window),
    };
  }

  private resolveContentBounds(window: WindowRef): GridBounds | undefined {
    if (
      typeof window.row !== "number" ||
      typeof window.col !== "number" ||
      typeof window.width !== "number" ||
      typeof window.height !== "number"
    ) {
      return undefined;
    }

    const mapped =
      typeof window.gridId === "number"
        ? this.gridBounds.get(window.gridId)
        : this.gridBounds.get(this.windowGridIds.get(window.id) ?? -1);
    if (!mapped) {
      return undefined;
    }

    return {
      gridId: mapped.gridId,
      row: window.row,
      col: window.col,
      width: window.width,
      height: window.height,
      zIndex: mapped.zIndex,
      compIndex: mapped.compIndex,
    };
  }

  private resolveGridBounds(window: WindowRef): GridBounds | undefined {
    if (typeof window.gridId === "number") {
      const mapped = this.gridBounds.get(window.gridId);
      return mapped;
    }
    const mappedGridId = this.windowGridIds.get(window.id);
    if (typeof mappedGridId === "number") {
      return this.gridBounds.get(mappedGridId);
    }
    return undefined;
  }

  private reconcileWindowGridIds(): void {
    const snapshot = this.uiState.getSnapshot();
    if (snapshot.currentTabId === null) {
      return;
    }

    const bounds = [...this.gridBounds.values()]
      .filter((entry) => entry.gridId !== 1)
      .sort((left, right) => {
        return (this.gridBoundRevisions.get(right.gridId) ?? 0) - (this.gridBoundRevisions.get(left.gridId) ?? 0);
      });
    const usedGridIds = new Set<number>();

    for (const window of snapshot.windows) {
      if (window.tabId !== snapshot.currentTabId) {
        continue;
      }
      if (
        typeof window.row !== "number" ||
        typeof window.col !== "number" ||
        typeof window.width !== "number" ||
        typeof window.height !== "number"
      ) {
        continue;
      }

      const windowWidth = window.width;
      const windowHeight = window.height;

      const match = bounds.find((entry) => {
        const exactSize = entry.width === windowWidth && entry.height === windowHeight;
        const normalWindowWithStatusline =
          entry.zIndex === 0 && entry.width === windowWidth && entry.height === windowHeight + 1;
        const borderedFloatSize =
          entry.zIndex > 0 && entry.width === windowWidth + 2 && entry.height === windowHeight + 2;
        return (
          !usedGridIds.has(entry.gridId) &&
          entry.row === window.row &&
          entry.col === window.col &&
          (exactSize || normalWindowWithStatusline || borderedFloatSize)
        );
      });
      if (!match) {
        continue;
      }

      usedGridIds.add(match.gridId);
      this.windowGridIds.set(window.id, match.gridId);
      this.uiState.setWindowGridId(window.id, match.gridId);
      this.uiState.updateWindowGeometry(window.id, {
        zIndex: match.zIndex,
        compIndex: match.compIndex,
        gridBounds: match,
      });
    }
  }

  private visibleSnapshot(snapshot: UiSnapshot): UiSnapshot {
    if (snapshot.currentTabId === null) {
      return snapshot;
    }

    const tabs = snapshot.tabs.filter((tab) => tab.id === snapshot.currentTabId);
    const windows = snapshot.windows.filter((window) => window.tabId === snapshot.currentTabId);
    const bufferIds = new Set(windows.map((window) => window.bufferId));
    const buffers = snapshot.buffers.filter((buffer) => bufferIds.has(buffer.id));
    return {
      currentTabId: snapshot.currentTabId,
      tabs,
      windows,
      buffers,
    };
  }
}
