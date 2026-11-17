import { boundChunks, chunksText, decodeChunks, textBytes } from "../core/ui-text.js";
import { CmdlineState, MessageEntry, MessageState, PopupmenuItem, PopupmenuState } from "../core/types.js";

const maxMessageEntries = 200;
export const maxMessageBytes = 128 * 1024;
export const maxRetainedMessageBytes = 512 * 1024;

function boundedEntry(entry: MessageEntry): MessageEntry {
  const bounded = boundChunks(entry.chunks ?? [{ highlightId: 0, text: entry.text }], maxMessageBytes);
  return { ...entry, chunks: bounded.chunks, text: chunksText(bounded.chunks),
    ...(entry.truncated || bounded.truncated ? { truncated: true } : {}) };
}

function boundEntries(entries: MessageEntry[]): MessageEntry[] {
  const kept: MessageEntry[] = [];
  let bytes = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = boundedEntry(entries[i]);
    const size = textBytes(entry.text);
    if (kept.length === maxMessageEntries || bytes + size > maxRetainedMessageBytes) {
      if (kept.length) kept[kept.length - 1] = { ...kept[kept.length - 1], truncated: true };
      break;
    }
    kept.push(entry); bytes += size;
  }
  return kept.reverse();
}

function appendEntry(before: MessageEntry, after: MessageEntry): MessageEntry {
  return boundedEntry({ ...before, revision: after.revision ?? before.revision,
    chunks: [...(before.chunks ?? [{ highlightId: 0, text: before.text }]),
      ...(after.chunks ?? [{ highlightId: 0, text: after.text }])],
    truncated: before.truncated || after.truncated || undefined });
}

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

  private readonly cmdlines = new Map<number, CmdlineState>();

  private popupmenu: PopupmenuState = {
    visible: false,
    items: [],
    selected: -1,
    row: 0,
    col: 0,
    grid: 0,
  };

  private messages: MessageState = {
    version: 0,
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
            if (!Array.isArray(payload) || payload.length < 6) continue;
            const chunks = decodeChunks(payload[0]);
            const next: CmdlineState = {
              visible: true, content: chunksText(chunks), chunks,
              position: Number(payload[1] ?? 0), firstChar: String(payload[2] || ''),
              prompt: String(payload[3] || ''), indent: Number(payload[4] ?? 0),
              level: Number(payload[5] ?? 0), promptHighlightId: Number(payload[6] ?? 0),
              specialChar: '', specialShift: false, blockLines: [],
            };
            this.cmdlines.set(next.level, next);
            this.selectCmdline();
          }
          break;
        case "cmdline_pos":
        case "cmdline_special_char":
          for (const payload of payloads) {
            if (!Array.isArray(payload)) continue;
            const level = Number(payload[name === 'cmdline_pos' ? 1 : 2]);
            const current = this.cmdlines.get(level);
            if (!current) continue;
            this.cmdlines.set(level, name === 'cmdline_pos'
              ? { ...current, position: Number(payload[0] ?? 0) }
              : { ...current, specialChar: String(payload[0] ?? ''), specialShift: Boolean(payload[1]) });
            this.selectCmdline();
          }
          break;
        case "cmdline_hide":
          for (const payload of payloads) {
            if (!Array.isArray(payload)) continue;
            this.cmdlines.delete(Number(payload[0]));
            this.selectCmdline();
          }
          break;
        case "cmdline_block_show":
          for (const payload of payloads) {
            if (!Array.isArray(payload) || !Array.isArray(payload[0])) continue;
            const blockChunks = payload[0].map(decodeChunks);
            this.cmdline = { ...this.cmdline, blockChunks, blockLines: blockChunks.map(chunksText) };
          }
          break;
        case "cmdline_block_append":
          for (const payload of payloads) {
            if (!Array.isArray(payload)) continue;
            const chunks = decodeChunks(payload[0]);
            this.cmdline = { ...this.cmdline,
              blockChunks: [...(this.cmdline.blockChunks ?? []), chunks],
              blockLines: [...this.cmdline.blockLines, chunksText(chunks)] };
          }
          break;
        case "cmdline_block_hide":
          this.cmdline = { ...this.cmdline, blockLines: [], blockChunks: [] };
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
              chunks: decodeChunks(content),
              id,
            }, replaceLast, append);
          }
          break;
        case "msg_clear":
          this.messages = {
            ...this.messages,
            version: this.messages.version + 1,
            entries: [],
            historyVisible: this.messages.historyVisible && !this.hasReturnPromptMessage(),
          };
          break;
        case "msg_showmode":
        case "msg_showcmd":
        case "msg_ruler": {
          const slot = name === 'msg_showmode' ? 'showmode' : name === 'msg_showcmd' ? 'showcmd' : 'ruler';
          const payload = payloads.find(Array.isArray) as unknown[] | undefined;
          const chunks = boundChunks(decodeChunks(payload?.[0]), maxMessageBytes).chunks;
          this.messages = { ...this.messages, [slot]: chunksText(chunks),
            statusChunks: { ...this.messages.statusChunks, [slot]: chunks } };
          break;
        }
        case "msg_history_clear":
          this.messages = { ...this.messages, version: this.messages.version + 1, history: [], historyVisible: false };
          break;
        case "msg_history_show":
          {
            const normalized = this.normalizeHistoryEntries(this.extractHistoryEntries(payloads));
            this.messages = {
              ...this.messages,
              version: this.messages.version + 1,
              historyVisible: true,
              history: boundEntries(normalized).map(entry => ({ ...entry, revision: this.messages.version + 1 })),
            };
          }
          break;
        default:
          break;
      }
    }
  }

  private selectCmdline(): void {
    const active = [...this.cmdlines.values()].sort((a, b) => b.level - a.level)[0];
    const blockLines = this.cmdline.blockLines, blockChunks = this.cmdline.blockChunks ?? [];
    this.cmdline = active ? { ...active, blockLines, blockChunks } : {
      visible: false, content: '', chunks: [], promptHighlightId: 0, firstChar: '', prompt: '',
      position: 0, indent: 0, level: 0, specialChar: '', specialShift: false, blockLines, blockChunks,
    };
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
        chunks: decodeChunks(entry[1]),
        id: null,
      };
      const append = Boolean(entry[2] ?? false);
      if (append && normalized.length > 0) {
        const last = normalized[normalized.length - 1];
        normalized[normalized.length - 1] = appendEntry(last, boundedEntry(nextEntry));
      } else {
        normalized.push(boundedEntry(nextEntry));
        if (normalized.length > maxMessageEntries) normalized.shift();
      }
    }
    return normalized;
  }

  private upsertMessage(entry: MessageEntry, replaceLast: boolean, append: boolean): void {
    entry = boundedEntry({ ...entry, revision: this.messages.version + 1 });
    const entries = [...this.messages.entries];
    const historyVisible = this.messages.historyVisible && this.isReturnPromptMessage(entry);

    if (entry.id !== null) {
      const index = entries.findIndex((candidate) => candidate.id === entry.id);
      if (index >= 0) {
        const current = entries[index];
        entries[index] = append ? appendEntry(current, entry) : entry;
        entries[index] = { ...entries[index], kind: entry.kind || current.kind };
        this.messages = {
          ...this.messages,
          version: this.messages.version + 1,
          entries: boundEntries(entries),
          historyVisible,
        };
        return;
      }
    }

    if (append && entries.length > 0) {
      const last = entries[entries.length - 1];
      entries[entries.length - 1] = appendEntry(last, entry);
    } else if (replaceLast && entries.length > 0) {
      entries[entries.length - 1] = entry;
    } else if (entry.text !== "" || entry.kind !== "empty") {
      entries.push(entry);
    }

    this.messages = {
      ...this.messages,
      version: this.messages.version + 1,
      entries: boundEntries(entries),
      historyVisible,
    };
  }

  private hasReturnPromptMessage(): boolean {
    return this.messages.entries.some((entry) => this.isReturnPromptMessage(entry));
  }

  private isReturnPromptMessage(entry: MessageEntry): boolean {
    return entry.kind === "return_prompt";
  }
}
