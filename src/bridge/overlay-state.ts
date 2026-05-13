import { CmdlineState, MessageEntry, MessageState, PopupmenuItem, PopupmenuState } from "../core/types.js";

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
    position: 0,
    indent: 0,
    level: 0,
    specialChar: "",
    specialShift: false,
    blockLines: [],
  };

  private popupmenu: PopupmenuState = {
    visible: false,
    items: [],
    selected: -1,
    row: 0,
    col: 0,
    grid: 0,
  };

  private messages: MessageState = {
    entries: [],
    showmode: "",
    showcmd: "",
    ruler: "",
    history: [],
    historyVisible: false,
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
            if (!Array.isArray(payload) || payload.length < 7) {
              continue;
            }
            const chunks = Array.isArray(payload[0]) ? payload[0] : [];
            this.cmdline = {
              visible: true,
              content: flattenChunks(chunks),
              position: Number(payload[1] ?? 0),
              firstChar: String(payload[2] ?? ""),
              prompt: String(payload[3] ?? ""),
              indent: Number(payload[4] ?? 0),
              level: Number(payload[5] ?? 0),
              specialChar: "",
              specialShift: false,
              blockLines: this.cmdline.blockLines,
            };
          }
          break;
        case "cmdline_pos":
          for (const payload of payloads) {
            if (!Array.isArray(payload) || payload.length < 2) {
              continue;
            }
            const level = Number(payload[1] ?? 0);
            if (this.cmdline.level !== level) {
              continue;
            }
            this.cmdline = {
              ...this.cmdline,
              position: Number(payload[0] ?? 0),
              specialChar: "",
              specialShift: false,
            };
          }
          break;
        case "cmdline_special_char":
          for (const payload of payloads) {
            if (!Array.isArray(payload) || payload.length < 3) {
              continue;
            }
            const level = Number(payload[2] ?? 0);
            if (this.cmdline.level !== level) {
              continue;
            }
            this.cmdline = {
              ...this.cmdline,
              specialChar: String(payload[0] ?? ""),
              specialShift: Boolean(payload[1]),
            };
          }
          break;
        case "cmdline_hide":
          for (const payload of payloads) {
            const level = Array.isArray(payload) ? Number(payload[0] ?? 0) : 0;
            if (this.cmdline.level !== 0 && level !== this.cmdline.level) {
              continue;
            }
            this.cmdline = {
              ...this.cmdline,
              visible: false,
              content: "",
              firstChar: "",
              prompt: "",
              position: 0,
              indent: 0,
              level: 0,
              specialChar: "",
              specialShift: false,
            };
          }
          break;
        case "cmdline_block_show":
          for (const payload of payloads) {
            if (!Array.isArray(payload)) {
              continue;
            }
            const lines = payload
              .filter((line) => Array.isArray(line))
              .map((line) => flattenChunks(Array.isArray(line) ? line : []));
            this.cmdline = {
              ...this.cmdline,
              blockLines: lines,
            };
          }
          break;
        case "cmdline_block_append":
          for (const payload of payloads) {
            const line = flattenChunks(Array.isArray(payload) ? payload : []);
            this.cmdline = {
              ...this.cmdline,
              blockLines: [...this.cmdline.blockLines, line],
            };
          }
          break;
        case "cmdline_block_hide":
          this.cmdline = {
            ...this.cmdline,
            blockLines: [],
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
        case "msg_show":
          for (const payload of payloads) {
            if (!Array.isArray(payload) || payload.length < 2) {
              continue;
            }
            const kind = String(payload[0] ?? "");
            const content = Array.isArray(payload[1]) ? payload[1] : [];
            const replaceLast = Boolean(payload[2]);
            const append = Boolean(payload[4] ?? false);
            const id = this.normalizeMessageId(payload[5] ?? null);
            this.upsertMessage({
              kind,
              text: flattenChunks(content),
              id,
            }, replaceLast, append);
          }
          break;
        case "msg_clear":
          this.messages = {
            ...this.messages,
            entries: [],
            historyVisible: this.messages.historyVisible && !this.hasReturnPromptMessage(),
          };
          break;
        case "msg_showmode":
          this.messages = {
            ...this.messages,
            showmode: this.extractMessageText(payloads),
          };
          break;
        case "msg_showcmd":
          this.messages = {
            ...this.messages,
            showcmd: this.extractMessageText(payloads),
          };
          break;
        case "msg_ruler":
          this.messages = {
            ...this.messages,
            ruler: this.extractMessageText(payloads),
          };
          break;
        case "msg_history_show":
          {
            const normalized = this.normalizeHistoryEntries(this.extractHistoryEntries(payloads));
            this.messages = {
              ...this.messages,
              historyVisible: true,
              history: normalized,
            };
          }
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

  getMessages(): MessageState {
    return this.messages;
  }

  private extractMessageText(payloads: unknown[]): string {
    for (const payload of payloads) {
      if (Array.isArray(payload)) {
        return flattenChunks(Array.isArray(payload[0]) ? payload[0] : payload);
      }
    }
    return "";
  }

  private normalizeMessageId(value: unknown): string | number | null {
    if (typeof value === "string" || typeof value === "number") {
      return value;
    }
    return null;
  }

  private extractHistoryEntries(payload: unknown[]): unknown[] {
    if (payload.every((entry) => this.isHistoryEntry(entry))) {
      return payload;
    }
    if (Array.isArray(payload[0]) && payload[0].every((entry) => this.isHistoryEntry(entry))) {
      return payload[0];
    }
    if (
      Array.isArray(payload[0]) &&
      Array.isArray(payload[0][0]) &&
      payload[0][0].every((entry) => this.isHistoryEntry(entry))
    ) {
      return payload[0][0];
    }
    if (this.isHistoryEntry(payload)) {
      return [payload];
    }
    return [];
  }

  private isHistoryEntry(value: unknown): boolean {
    return Array.isArray(value) && typeof value[0] === "string" && Array.isArray(value[1]);
  }

  private normalizeHistoryEntries(historyEntries: unknown[]): MessageEntry[] {
    const normalized: MessageEntry[] = [];
    for (const entry of historyEntries) {
      if (!Array.isArray(entry) || entry.length < 2) {
        continue;
      }
      const nextEntry: MessageEntry = {
        kind: String(entry[0] ?? ""),
        text: flattenChunks(Array.isArray(entry[1]) ? entry[1] : []),
        id: null,
      };
      const append = Boolean(entry[2] ?? false);
      if (append && normalized.length > 0) {
        const last = normalized[normalized.length - 1];
        normalized[normalized.length - 1] = {
          ...last,
          text: `${last.text}${nextEntry.text}`,
        };
      } else {
        normalized.push(nextEntry);
      }
    }
    return normalized;
  }

  private upsertMessage(entry: MessageEntry, replaceLast: boolean, append: boolean): void {
    const entries = [...this.messages.entries];
    const historyVisible = this.messages.historyVisible && this.isReturnPromptMessage(entry);

    if (entry.id !== null) {
      const index = entries.findIndex((candidate) => candidate.id === entry.id);
      if (index >= 0) {
        const current = entries[index];
        entries[index] = {
          ...current,
          kind: entry.kind || current.kind,
          text: append ? `${current.text}${entry.text}` : entry.text,
        };
        this.messages = {
          ...this.messages,
          entries,
          historyVisible,
        };
        return;
      }
    }

    if (append && entries.length > 0) {
      const last = entries[entries.length - 1];
      entries[entries.length - 1] = {
        ...last,
        text: `${last.text}${entry.text}`,
      };
    } else if (replaceLast && entries.length > 0) {
      entries[entries.length - 1] = entry;
    } else if (entry.text !== "" || entry.kind !== "empty") {
      entries.push(entry);
    }

    this.messages = {
      ...this.messages,
      entries: entries.slice(-6),
      historyVisible,
    };
  }

  private hasReturnPromptMessage(): boolean {
    return this.messages.entries.some((entry) => this.isReturnPromptMessage(entry));
  }

  private isReturnPromptMessage(entry: MessageEntry): boolean {
    return entry.kind === "return_prompt" || /press\s+(enter|return)/i.test(entry.text);
  }
}
