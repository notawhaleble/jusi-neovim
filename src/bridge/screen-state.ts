import { CursorShape, CursorStyle, GridScreenState, HighlightAttrs, PrimaryScreenState, ScreenCell, ScreenLineRun } from "../core/types.js";

function colorNumberToCss(value: number | null | undefined): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return `#${value.toString(16).padStart(6, "0")}`;
}

export class NvimScreenState {
  private readonly grid = new Map<number, { rows: number; cols: number; cells: ScreenCell[][] }>();
  private readonly highlights = new Map<number, HighlightAttrs>();
  private cursor: PrimaryScreenState["cursor"] = null;
  private currentModeName = "normal";
  private currentModeIndex = 0;
  private modeStyles: CursorStyle[] = [];
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
        case "hl_attr_define":
          for (const payload of payloads) {
            if (!Array.isArray(payload) || payload.length < 2) {
              continue;
            }
            this.highlights.set(this.asNumber(payload[0]), this.decodeHighlightAttrs(payload[1]));
          }
          break;
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
        case "mode_info_set":
          for (const payload of payloads) {
            if (!Array.isArray(payload) || payload.length < 2 || !Array.isArray(payload[1])) {
              continue;
            }
            this.modeStyles = payload[1].map((entry) => this.decodeCursorStyle(entry));
          }
          break;
        case "mode_change":
          for (const payload of payloads) {
            if (!Array.isArray(payload) || payload.length < 2) {
              continue;
            }
            this.currentModeName = String(payload[0] ?? "normal");
            const modeIndex = this.asNumber(payload[1]);
            this.currentModeIndex = Number.isFinite(modeIndex) ? modeIndex : 0;
          }
          break;
        case "default_colors_set":
          for (const payload of payloads) {
            if (Array.isArray(payload) && payload.length >= 2) {
              this.foregroundColor = colorNumberToCss(this.asNumber(payload[0]));
              this.backgroundColor = colorNumberToCss(this.asNumber(payload[1]));
            }
          }
          break;
        default:
          break;
      }
    }
  }

  getState(includeCells = false): PrimaryScreenState {
    const primaryGrid = this.grid.get(1);
    const primary = primaryGrid?.cells ?? [];
    const state: PrimaryScreenState = {
      rows: primaryGrid?.rows ?? 0,
      cols: primaryGrid?.cols ?? 0,
      lines: primary.map((line) => this.cellsToLine(line, primaryGrid?.cols ?? 0)),
      runs: primary.map((line) => this.cellsToRuns(line, primaryGrid?.cols ?? 0)),
      cursor: this.cursor?.gridId === 1 ? this.cursor : null,
      mode: this.modeState(),
      backgroundColor: this.backgroundColor,
      foregroundColor: this.foregroundColor,
      highlights: Object.fromEntries(this.highlights.entries()),
    };
    if (includeCells) {
      state.cells = primary.map((line) => this.padCells(line, primaryGrid?.cols ?? 0));
    }
    return state;
  }

  getGridStates(includeCells = false): GridScreenState[] {
    const states: GridScreenState[] = [];
    for (const [gridId, state] of this.grid.entries()) {
      const gridState: GridScreenState = {
        gridId,
        rows: state.rows,
        cols: state.cols,
        lines: state.cells.map((line) => this.cellsToLine(line, state.cols)),
        runs: state.cells.map((line) => this.cellsToRuns(line, state.cols)),
        cursor: this.cursor?.gridId === gridId ? this.cursor : null,
      };
      if (includeCells) {
        gridState.cells = state.cells.map((line) => this.padCells(line, state.cols));
      }
      states.push(gridState);
    }
    return states;
  }

  private resizeGrid(gridId: number, cols: number, rows: number): void {
    const normalizedCols = Math.max(0, cols);
    const normalizedRows = Math.max(0, rows);
    const next: ScreenCell[][] = [];
    const previous = this.grid.get(gridId)?.cells ?? [];
    for (let row = 0; row < normalizedRows; row += 1) {
      next[row] = this.padCells((previous[row] ?? []).slice(0, normalizedCols), normalizedCols);
    }
    this.grid.set(gridId, {
      rows: normalizedRows,
      cols: normalizedCols,
      cells: next,
    });
  }

  private clearGrid(gridId: number): void {
    const state = this.grid.get(gridId);
    if (!state) {
      return;
    }
    const cells: ScreenCell[][] = [];
    for (let row = 0; row < state.rows; row += 1) {
      cells[row] = this.blankCells(state.cols);
    }
    this.grid.set(gridId, {
      ...state,
      cells,
    });
  }

  private applyGridLine(gridId: number, row: number, colStart: number, defs: unknown[]): void {
    const state = this.grid.get(gridId);
    if (!state || row < 0 || row >= state.rows) {
      return;
    }

    const cells = state.cells;
    const current = this.padCells(cells[row] ?? [], state.cols);
    let col = Math.max(0, colStart);
    let activeHighlightId = 0;

    for (const def of defs) {
      if (!Array.isArray(def) || def.length === 0) {
        continue;
      }
      const text = this.decodeText(def[0]);
      if (typeof def[1] === "number") {
        activeHighlightId = this.asNumber(def[1]);
      }
      const repeat = def.length >= 3 ? Math.max(0, this.asNumber(def[2])) : 1;
      for (let idx = 0; idx < repeat; idx += 1) {
        const cells = text.length === 0 ? [" "] : [...text];
        for (const cellText of cells) {
          if (col >= state.cols) {
            break;
          }
          current[col] = { text: cellText, highlightId: activeHighlightId };
          col += 1;
        }
      }
    }

    cells[row] = current;
    this.grid.set(gridId, {
      ...state,
      cells,
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

    const cells = state.cells.map((line) => this.padCells(line, state.cols));
    const next = cells.map((line) => line.map((cell) => ({ ...cell })));

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
          next[row][col] = cells[sourceRow][sourceCol] ?? this.blankCell();
        } else {
          next[row][col] = this.blankCell();
        }
      }
    }

    this.grid.set(gridId, {
      ...state,
      cells: next,
    });
  }

  private decodeHighlightAttrs(value: unknown): HighlightAttrs {
    if (!this.isObject(value)) {
      return {};
    }

    return {
      foreground: colorNumberToCss(this.asOptionalNumber(value.foreground ?? value.fg)),
      background: colorNumberToCss(this.asOptionalNumber(value.background ?? value.bg)),
      special: colorNumberToCss(this.asOptionalNumber(value.special ?? value.sp)),
      bold: value.bold === true ? true : undefined,
      italic: value.italic === true ? true : undefined,
      underline: value.underline === true ? true : undefined,
      undercurl: value.undercurl === true ? true : undefined,
      reverse: value.reverse === true ? true : undefined,
    };
  }

  private modeState(): PrimaryScreenState["mode"] {
    return {
      name: this.currentModeName,
      index: this.currentModeIndex,
      cursor: this.modeStyles[this.currentModeIndex] ?? this.defaultCursorStyle(),
    };
  }

  private defaultCursorStyle(): CursorStyle {
    return {
      shape: "block",
      cellPercentage: 100,
      name: "normal",
      shortName: "n",
    };
  }

  private decodeCursorStyle(value: unknown): CursorStyle {
    if (!this.isObject(value)) {
      return this.defaultCursorStyle();
    }
    return {
      shape: this.asCursorShape(value.cursor_shape),
      cellPercentage: this.asPercentage(value.cell_percentage),
      attrId: this.optionalNumber(value.attr_id),
      attrIdLm: this.optionalNumber(value.attr_id_lm),
      blinkWait: this.optionalNumber(value.blinkwait),
      blinkOn: this.optionalNumber(value.blinkon),
      blinkOff: this.optionalNumber(value.blinkoff),
      name: typeof value.name === "string" ? value.name : undefined,
      shortName: typeof value.short_name === "string" ? value.short_name : undefined,
    };
  }

  private asCursorShape(value: unknown): CursorShape {
    if (value === "vertical" || value === "horizontal") {
      return value;
    }
    return "block";
  }

  private asPercentage(value: unknown): number {
    const percentage = this.asNumber(value);
    if (!Number.isFinite(percentage) || percentage <= 0) {
      return 100;
    }
    return Math.max(1, Math.min(100, percentage));
  }

  private optionalNumber(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  }

  private cellsToLine(cells: ScreenCell[], cols: number): string {
    let line = "";
    for (let col = 0; col < cols; col += 1) {
      line += cells[col]?.text ?? " ";
    }
    return line;
  }

  private cellsToRuns(cells: ScreenCell[], cols: number): ScreenLineRun[] {
    const runs: ScreenLineRun[] = [];
    for (let col = 0; col < cols; col += 1) {
      const cell = cells[col] ?? this.blankCell();
      const previous = runs[runs.length - 1];
      if (previous && previous.highlightId === cell.highlightId) {
        previous.text += cell.text;
      } else {
        runs.push({ text: cell.text, highlightId: cell.highlightId });
      }
    }
    return runs;
  }

  private padCells(cells: ScreenCell[], cols: number): ScreenCell[] {
    const next = cells.map((cell) => ({ ...cell }));
    while (next.length < cols) {
      next.push(this.blankCell());
    }
    return next.slice(0, cols);
  }

  private blankCells(cols: number): ScreenCell[] {
    const cells: ScreenCell[] = [];
    for (let idx = 0; idx < cols; idx += 1) {
      cells.push(this.blankCell());
    }
    return cells;
  }

  private blankCell(): ScreenCell {
    return { text: " ", highlightId: 0 };
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

  private asOptionalNumber(value: unknown): number | undefined {
    if (typeof value === "number") {
      return value;
    }
    if (value === null || value === undefined) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }
}
