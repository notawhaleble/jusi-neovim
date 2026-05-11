import { GridScreenState, PrimaryScreenState } from "../core/types.js";

function colorNumberToCss(value: number | null | undefined): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return `#${value.toString(16).padStart(6, "0")}`;
}

export class NvimScreenState {
  private readonly grid = new Map<number, { rows: number; cols: number; lines: string[] }>();
  private cursor: PrimaryScreenState["cursor"] = null;
  private foregroundColor: string | undefined;
  private backgroundColor: string | undefined;

  handleRedraw(args: unknown[]): void {
    for (const rawEvent of args) {
      if (!Array.isArray(rawEvent) || rawEvent.length === 0 || typeof rawEvent[0] !== "string") {
        continue;
      }

      const name = rawEvent[0];
      const payloads = rawEvent.slice(1);

      switch (name) {
        case "grid_resize":
          for (const payload of payloads) {
            if (!Array.isArray(payload) || payload.length < 3) {
              continue;
            }
            const gridId = this.asNumber(payload[0]);
            this.resizeGrid(gridId, this.asNumber(payload[1]), this.asNumber(payload[2]));
          }
          break;
        case "grid_clear":
          for (const payload of payloads) {
            const gridId = this.asNumber(payload);
            this.clearGrid(gridId);
          }
          break;
        case "grid_line":
          for (const payload of payloads) {
            if (!Array.isArray(payload) || payload.length < 4) {
              continue;
            }
            const gridId = this.asNumber(payload[0]);
            const row = this.asNumber(payload[1]);
            const colStart = this.asNumber(payload[2]);
            const cells = Array.isArray(payload[3]) ? payload[3] : [];
            this.applyGridLine(gridId, row, colStart, cells);
          }
          break;
        case "grid_scroll":
          for (const payload of payloads) {
            if (!Array.isArray(payload) || payload.length < 7) {
              continue;
            }
            this.scrollGridRegion(
              this.asNumber(payload[0]),
              this.asNumber(payload[1]),
              this.asNumber(payload[2]),
              this.asNumber(payload[3]),
              this.asNumber(payload[4]),
              this.asNumber(payload[5]),
              this.asNumber(payload[6]),
            );
          }
          break;
        case "grid_cursor_goto":
          for (const payload of payloads) {
            if (!Array.isArray(payload) || payload.length < 3) {
              continue;
            }
            const gridId = this.asNumber(payload[0]);
            this.cursor = {
              gridId,
              row: this.asNumber(payload[1]),
              col: this.asNumber(payload[2]),
            };
          }
          break;
        case "default_colors_set":
          if (payloads.length > 0) {
            const first = payloads[0];
            if (Array.isArray(first) && first.length >= 2) {
              this.foregroundColor = colorNumberToCss(this.asNumber(first[0]));
              this.backgroundColor = colorNumberToCss(this.asNumber(first[1]));
            } else if (payloads.length >= 2) {
              this.foregroundColor = colorNumberToCss(this.asNumber(payloads[0]));
              this.backgroundColor = colorNumberToCss(this.asNumber(payloads[1]));
            }
          }
          break;
        default:
          break;
      }
    }
  }

  getState(): PrimaryScreenState {
    const primaryGrid = this.grid.get(1);
    const primary = primaryGrid?.lines ?? [];
    return {
      rows: primaryGrid?.rows ?? 0,
      cols: primaryGrid?.cols ?? 0,
      lines: primary.map((line) => line.padEnd(primaryGrid?.cols ?? 0, " ")),
      cursor: this.cursor?.gridId === 1 ? this.cursor : null,
      backgroundColor: this.backgroundColor,
      foregroundColor: this.foregroundColor,
    };
  }

  getGridStates(): GridScreenState[] {
    const states: GridScreenState[] = [];
    for (const [gridId, state] of this.grid.entries()) {
      states.push({
        gridId,
        rows: state.rows,
        cols: state.cols,
        lines: state.lines.map((line) => line.padEnd(state.cols, " ")),
        cursor: this.cursor?.gridId === gridId ? this.cursor : null,
      });
    }
    return states;
  }

  private resizeGrid(gridId: number, cols: number, rows: number): void {
    const normalizedCols = Math.max(0, cols);
    const normalizedRows = Math.max(0, rows);
    const next: string[] = [];
    const previous = this.grid.get(gridId)?.lines ?? [];
    for (let row = 0; row < normalizedRows; row += 1) {
      next[row] = (previous[row] ?? "").slice(0, normalizedCols).padEnd(normalizedCols, " ");
    }
    this.grid.set(gridId, {
      rows: normalizedRows,
      cols: normalizedCols,
      lines: next,
    });
  }

  private clearGrid(gridId: number): void {
    const state = this.grid.get(gridId);
    if (!state) {
      return;
    }
    const lines: string[] = [];
    for (let row = 0; row < state.rows; row += 1) {
      lines[row] = "".padEnd(state.cols, " ");
    }
    this.grid.set(gridId, {
      ...state,
      lines,
    });
  }

  private applyGridLine(gridId: number, row: number, colStart: number, defs: unknown[]): void {
    const state = this.grid.get(gridId);
    if (!state || row < 0 || row >= state.rows) {
      return;
    }

    const lines = state.lines;
    const current = (lines[row] ?? "").padEnd(state.cols, " ").split("");
    let col = Math.max(0, colStart);

    for (const def of defs) {
      if (!Array.isArray(def) || def.length === 0) {
        continue;
      }
      const text = this.decodeText(def[0]);
      const repeat = def.length >= 3 ? Math.max(1, this.asNumber(def[2])) : 1;
      for (let idx = 0; idx < repeat; idx += 1) {
        const cells = text.length === 0 ? [" "] : [...text];
        for (const cellText of cells) {
          if (col >= state.cols) {
            break;
          }
          current[col] = cellText;
          col += 1;
        }
      }
    }

    lines[row] = current.join("");
    this.grid.set(gridId, {
      ...state,
      lines,
    });
  }

  private scrollGridRegion(
    gridId: number,
    top: number,
    bottom: number,
    left: number,
    right: number,
    rows: number,
    cols: number,
  ): void {
    const state = this.grid.get(gridId);
    if (!state) {
      return;
    }

    const regionTop = Math.max(0, top);
    const regionBottom = Math.min(state.rows, bottom);
    const regionLeft = Math.max(0, left);
    const regionRight = Math.min(state.cols, right);
    if (regionTop >= regionBottom || regionLeft >= regionRight) {
      return;
    }

    const lines = state.lines.map((line) => line.padEnd(state.cols, " ").split(""));
    const next = lines.map((line) => [...line]);

    for (let row = regionTop; row < regionBottom; row += 1) {
      for (let col = regionLeft; col < regionRight; col += 1) {
        const sourceRow = row + rows;
        const sourceCol = col + cols;
        if (
          sourceRow >= regionTop &&
          sourceRow < regionBottom &&
          sourceCol >= regionLeft &&
          sourceCol < regionRight
        ) {
          next[row][col] = lines[sourceRow][sourceCol] ?? " ";
        } else {
          next[row][col] = " ";
        }
      }
    }

    this.grid.set(gridId, {
      ...state,
      lines: next.map((line) => line.join("")),
    });
  }

  private decodeText(value: unknown): string {
    if (typeof value === "string") {
      return value;
    }
    if (value && typeof (value as { toString?: (encoding?: string) => string }).toString === "function") {
      try {
        return (value as { toString: (encoding?: string) => string }).toString("utf8");
      } catch (_error) {
        return String(value);
      }
    }
    return String(value ?? " ");
  }

  private asNumber(value: unknown): number {
    return typeof value === "number" ? value : Number(value);
  }
}
