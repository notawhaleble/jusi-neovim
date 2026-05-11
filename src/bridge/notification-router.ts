import {
  CmdlineState,
  GridScreenState,
  MessageState,
  PopupmenuState,
  PrimaryScreenState,
  UiSnapshot,
} from "../core/types.js";
import { NvimLayoutController } from "./layout-controller.js";
import { NvimOverlayState } from "./overlay-state.js";
import { NvimRedrawTranslator } from "./redraw-translator.js";
import { NvimMetadataEvent, NvimRedrawEvent } from "./protocol.js";
import { NvimScreenState } from "./screen-state.js";

export type RawNotification = {
  method: string;
  args: unknown[];
};

export type RoutedNotificationResult = {
  snapshot: UiSnapshot;
  screen: PrimaryScreenState;
  grids: GridScreenState[];
  cmdline: CmdlineState;
  popupmenu: PopupmenuState;
  messages: MessageState;
  handled: boolean;
};

export class NvimNotificationRouter {
  private readonly redraw = new NvimRedrawTranslator();
  private readonly screen = new NvimScreenState();
  private readonly overlays = new NvimOverlayState();

  constructor(private readonly layout: NvimLayoutController) {}

  route(notification: RawNotification): RoutedNotificationResult {
    switch (notification.method) {
      case "redraw":
        this.handleRedraw(notification.args);
        return {
          snapshot: this.layout.getSnapshot(),
          screen: this.screen.getState(),
          grids: this.screen.getGridStates(),
          cmdline: this.overlays.getCmdline(),
          popupmenu: this.overlays.getPopupmenu(),
          messages: this.overlays.getMessages(),
          handled: true,
        };
      case "jusi:layout":
        this.handleLayout(notification.args[0]);
        return {
          snapshot: this.layout.getSnapshot(),
          screen: this.screen.getState(),
          grids: this.screen.getGridStates(),
          cmdline: this.overlays.getCmdline(),
          popupmenu: this.overlays.getPopupmenu(),
          messages: this.overlays.getMessages(),
          handled: true,
        };
      case "jusi:web-session":
        this.handleWebSession(notification.args[0]);
        return {
          snapshot: this.layout.getSnapshot(),
          screen: this.screen.getState(),
          grids: this.screen.getGridStates(),
          cmdline: this.overlays.getCmdline(),
          popupmenu: this.overlays.getPopupmenu(),
          messages: this.overlays.getMessages(),
          handled: true,
        };
      case "jusi:web-mirror":
        this.handleWebMirror(notification.args[0]);
        return {
          snapshot: this.layout.getSnapshot(),
          screen: this.screen.getState(),
          grids: this.screen.getGridStates(),
          cmdline: this.overlays.getCmdline(),
          popupmenu: this.overlays.getPopupmenu(),
          messages: this.overlays.getMessages(),
          handled: true,
        };
      default:
        return {
          snapshot: this.layout.getSnapshot(),
          screen: this.screen.getState(),
          grids: this.screen.getGridStates(),
          cmdline: this.overlays.getCmdline(),
          popupmenu: this.overlays.getPopupmenu(),
          messages: this.overlays.getMessages(),
          handled: false,
        };
    }
  }

  private handleRedraw(args: unknown[]): void {
    this.screen.handleRedraw(args);
    this.overlays.handleRedraw(args);
    const redrawEvents = this.parseRedrawEvents(args);
    const geometryEvents = this.redraw.translate(redrawEvents);
    for (const event of geometryEvents) {
      this.layout.applyGeometry(event);
    }
  }

  getScreenState(): PrimaryScreenState {
    return this.screen.getState();
  }

  getGridStates(): GridScreenState[] {
    return this.screen.getGridStates();
  }

  getCmdlineState(): CmdlineState {
    return this.overlays.getCmdline();
  }

  getPopupmenuState(): PopupmenuState {
    return this.overlays.getPopupmenu();
  }

  getMessageState(): MessageState {
    return this.overlays.getMessages();
  }

  private handleLayout(payload: unknown): void {
    const event = this.asMetadataEvent(payload);
    if (!event) {
      return;
    }
    this.layout.applyMetadata(event);
  }

  private handleWebSession(payload: unknown): void {
    if (!this.isObject(payload) || typeof payload.bufferId !== "number" || typeof payload.url !== "string") {
      return;
    }
    this.layout.applyMetadata({
      type: "web-session",
      bufferId: payload.bufferId,
      url: payload.url,
      title: typeof payload.title === "string" ? payload.title : undefined,
    });
  }

  private handleWebMirror(payload: unknown): void {
    if (!this.isObject(payload) || typeof payload.bufferId !== "number" || !this.isObject(payload.mirror)) {
      return;
    }
    this.layout.applyMetadata({
      type: "web-mirror",
      bufferId: payload.bufferId,
      mirror: payload.mirror as NvimMetadataEvent & never,
    });
  }

  private parseRedrawEvents(args: unknown[]): NvimRedrawEvent[] {
    const events: NvimRedrawEvent[] = [];

    for (const rawEvent of args) {
      if (!Array.isArray(rawEvent) || rawEvent.length === 0 || typeof rawEvent[0] !== "string") {
        continue;
      }

      const name = rawEvent[0];
      const payloads = rawEvent.slice(1);
      for (const payload of payloads) {
        if (!Array.isArray(payload)) {
          continue;
        }

        if (name === "grid_resize" && payload.length >= 3) {
          events.push({
            name,
            args: [this.asNumber(payload[0]), this.asNumber(payload[1]), this.asNumber(payload[2])],
          });
        } else if (name === "win_pos" && payload.length >= 6) {
          const windowId = this.asHandleId(payload[1]);
          events.push({
            name,
            args: [
              this.asNumber(payload[0]),
              windowId,
              this.asNumber(payload[2]),
              this.asNumber(payload[3]),
              this.asNumber(payload[4]),
              this.asNumber(payload[5]),
            ],
          });
        } else if (name === "win_float_pos" && payload.length >= 8) {
          const windowId = this.asHandleId(payload[1]);
          events.push({
            name,
            args: [
              this.asNumber(payload[0]),
              windowId,
              String(payload[2]),
              this.asNumber(payload[3]),
              this.asNumber(payload[4]),
              this.asNumber(payload[5]),
              Boolean(payload[6]),
              this.asNumber(payload[7]),
              this.asNumber(payload[8] ?? 0),
              this.asNumber(payload[9] ?? payload[4]),
              this.asNumber(payload[10] ?? payload[5]),
            ],
          });
        } else if ((name === "win_close" || name === "win_hide" || name === "grid_destroy") && payload.length >= 1) {
          events.push({
            name,
            args: [this.asNumber(payload[0])],
          });
        }
      }
    }

    return events;
  }

  private asMetadataEvent(payload: unknown): NvimMetadataEvent | null {
    if (!this.isObject(payload) || typeof payload.type !== "string") {
      return null;
    }

    switch (payload.type) {
      case "current-tab":
        return {
          type: "current-tab",
          tabId: typeof payload.tabId === "number" ? payload.tabId : null,
        };
      case "tab":
        if (typeof payload.tabId !== "number") {
          return null;
        }
        return {
          type: "tab",
          tabId: payload.tabId,
          currentWindowId: typeof payload.currentWindowId === "number" ? payload.currentWindowId : undefined,
        };
      case "tab-close":
        if (typeof payload.tabId !== "number") {
          return null;
        }
        return {
          type: "tab-close",
          tabId: payload.tabId,
        };
      case "buffer":
        if (
          typeof payload.bufferId !== "number" ||
          (payload.kind !== "text" && payload.kind !== "web")
        ) {
          return null;
        }
        return {
          type: "buffer",
          bufferId: payload.bufferId,
          kind: payload.kind,
          name: typeof payload.name === "string" ? payload.name : undefined,
        };
      case "buffer-close":
        if (typeof payload.bufferId !== "number") {
          return null;
        }
        return {
          type: "buffer-close",
          bufferId: payload.bufferId,
        };
      case "window":
        if (
          typeof payload.windowId !== "number" ||
          typeof payload.tabId !== "number" ||
          typeof payload.bufferId !== "number"
        ) {
          return null;
        }
        return {
          type: "window",
          windowId: payload.windowId,
          tabId: payload.tabId,
          bufferId: payload.bufferId,
          gridId: typeof payload.gridId === "number" ? payload.gridId : undefined,
          row: typeof payload.row === "number" ? payload.row : undefined,
          col: typeof payload.col === "number" ? payload.col : undefined,
          width: typeof payload.width === "number" ? payload.width : undefined,
          height: typeof payload.height === "number" ? payload.height : undefined,
        };
      case "window-close":
        if (typeof payload.windowId !== "number") {
          return null;
        }
        return {
          type: "window-close",
          windowId: payload.windowId,
        };
      case "tab-current-window":
        if (typeof payload.tabId !== "number" || typeof payload.windowId !== "number") {
          return null;
        }
        return {
          type: "tab-current-window",
          tabId: payload.tabId,
          windowId: payload.windowId,
        };
      default:
        return null;
    }
  }

  private asNumber(value: unknown): number {
    return typeof value === "number" ? value : Number(value);
  }

  private asHandleId(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (!this.isObject(value) || !("_data" in value)) {
      return null;
    }

    const raw = value._data;
    if (!raw) {
      return null;
    }

    if (typeof raw.readUInt8 === "function") {
      const prefix = raw.readUInt8(0);
      if (prefix <= 0x7f) {
        return prefix;
      }
      if (prefix === 0xcc) {
        return raw.readUInt8(1);
      }
      if (prefix === 0xcd && typeof raw.readUInt16BE === "function") {
        return raw.readUInt16BE(1);
      }
      if (prefix === 0xce && typeof raw.readUInt32BE === "function") {
        return raw.readUInt32BE(1);
      }
    }

    if (Array.isArray(raw?.data)) {
      const bytes = raw.data as number[];
      if (bytes.length === 1) {
        return bytes[0];
      }
      if (bytes[0] === 0xcc && bytes.length >= 2) {
        return bytes[1];
      }
      if (bytes[0] === 0xcd && bytes.length >= 3) {
        return (bytes[1] << 8) | bytes[2];
      }
      if (bytes[0] === 0xce && bytes.length >= 5) {
        return (
          bytes[1] * 0x1000000 +
          (bytes[2] << 16) +
          (bytes[3] << 8) +
          bytes[4]
        );
      }
    }

    return null;
  }

  private isObject(value: unknown): value is Record<string, any> {
    return typeof value === "object" && value !== null;
  }
}
