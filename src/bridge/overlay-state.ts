import { CmdlineState, PopupmenuItem, PopupmenuState } from "../core/types.js";

function flattenChunks(chunks: unknown[]): string {
  let text = "";
  for (const chunk of chunks) {
    if (!Array.isArray(chunk) || chunk.length < 2) {
      continue;
    }
    text += String(chunk[1] ?? "");
  }
  return text;
}

export class NvimOverlayState {
  private cmdline: CmdlineState = {
    visible: false,
    content: "",
    firstChar: "",
    prompt: "",
  };

  private popupmenu: PopupmenuState = {
    visible: false,
    items: [],
    selected: -1,
    row: 0,
    col: 0,
    grid: 0,
  };

  handleRedraw(args: unknown[]): void {
    for (const rawEvent of args) {
      if (!Array.isArray(rawEvent) || rawEvent.length === 0 || typeof rawEvent[0] !== "string") {
        continue;
      }

      const name = rawEvent[0];
      const payloads = rawEvent.slice(1);

      switch (name) {
        case "cmdline_show":
          for (const payload of payloads) {
            if (!Array.isArray(payload) || payload.length < 4) {
              continue;
            }
            const chunks = Array.isArray(payload[0]) ? payload[0] : [];
            this.cmdline = {
              visible: true,
              content: flattenChunks(chunks),
              firstChar: String(payload[2] ?? ""),
              prompt: String(payload[3] ?? ""),
            };
          }
          break;
        case "cmdline_hide":
          this.cmdline = {
            visible: false,
            content: "",
            firstChar: "",
            prompt: "",
          };
          break;
        case "popupmenu_show":
          for (const payload of payloads) {
            if (!Array.isArray(payload) || payload.length < 5) {
              continue;
            }
            const rawItems = Array.isArray(payload[0]) ? payload[0] : [];
            const items: PopupmenuItem[] = rawItems.map((item) => {
              if (!Array.isArray(item)) {
                return { word: String(item ?? "") };
              }
              return {
                word: String(item[0] ?? ""),
                kind: item[1] === undefined ? undefined : String(item[1]),
                menu: item[2] === undefined ? undefined : String(item[2]),
                info: item[3] === undefined ? undefined : String(item[3]),
              };
            });
            this.popupmenu = {
              visible: true,
              items,
              selected: Number(payload[1] ?? -1),
              row: Number(payload[2] ?? 0),
              col: Number(payload[3] ?? 0),
              grid: Number(payload[4] ?? 0),
            };
          }
          break;
        case "popupmenu_select":
          for (const payload of payloads) {
            const selected = Array.isArray(payload) ? Number(payload[0] ?? -1) : Number(payload ?? -1);
            this.popupmenu = {
              ...this.popupmenu,
              selected,
            };
          }
          break;
        case "popupmenu_hide":
          this.popupmenu = {
            visible: false,
            items: [],
            selected: -1,
            row: 0,
            col: 0,
            grid: 0,
          };
          break;
        default:
          break;
      }
    }
  }

  getCmdline(): CmdlineState {
    return this.cmdline;
  }

  getPopupmenu(): PopupmenuState {
    return this.popupmenu;
  }
}
