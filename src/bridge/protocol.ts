import { BufferKind, GridBounds, MirrorDocument } from "../core/types.js";

export type NvimMetadataEvent =
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
      kind: BufferKind;
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
    }
  | {
      type: "web-session";
      bufferId: number;
      url: string;
      title?: string;
    }
  | {
      type: "web-mirror";
      bufferId: number;
      mirror: MirrorDocument;
    };

export type NvimGeometryEvent =
  | {
      type: "grid-bounds";
      windowId?: number;
      bounds: GridBounds;
    }
  | {
      type: "grid-close";
      gridId: number;
    };

export type NvimRedrawEvent =
  | {
      name: "grid_resize";
      args: [gridId: number, width: number, height: number];
    }
  | {
      name: "win_pos";
      args: [
        gridId: number,
        windowId: number | null,
        startRow: number,
        startCol: number,
        width: number,
        height: number,
      ];
    }
  | {
      name: "win_float_pos";
      args: [
        gridId: number,
        windowId: number | null,
        anchor: string,
        anchorGrid: number,
        anchorRow: number,
        anchorCol: number,
        focusable: boolean,
        zIndex: number,
      ];
    }
  | {
      name: "win_close";
      args: [gridId: number];
    }
  | {
      name: "win_hide";
      args: [gridId: number];
    }
  | {
      name: "grid_destroy";
      args: [gridId: number];
    };
