import { GridBounds } from "../core/types.js";
import { NvimGeometryEvent, NvimRedrawEvent } from "./protocol.js";

type Position = Extract<NvimRedrawEvent, { name: "win_pos" | "win_float_pos" }>;
type Origin = { row: number; col: number };

export class NvimRedrawTranslator {
  private readonly sizes = new Map<number, { width: number; height: number }>();
  private readonly positions = new Map<number, Position>();
  private readonly published = new Map<number, { position: Position; bounds: GridBounds }>();

  translate(events: NvimRedrawEvent[]): NvimGeometryEvent[] {
    if (!events.length) return [];
    const geometry: NvimGeometryEvent[] = [];
    for (const event of events) {
      const [grid] = event.args;
      switch (event.name) {
        case "grid_resize":
          this.sizes.set(grid, { width: event.args[1], height: event.args[2] });
          break;
        case "win_pos":
          this.sizes.set(grid, { width: event.args[4], height: event.args[5] });
          this.positions.set(grid, event);
          break;
        case "win_float_pos":
          this.positions.set(grid, event);
          break;
        case "win_close":
        case "grid_destroy":
        case "win_hide":
          if (event.name !== "win_hide") {
            this.sizes.delete(grid);
            this.removeAnchoredPositions(grid, geometry);
          }
          this.positions.delete(grid);
          this.published.delete(grid);
          geometry.push({ type: "grid-close", gridId: grid });
          break;
      }
    }

    for (const [gridId, position] of this.positions) {
      const origin = this.origin(gridId, new Set());
      if (!origin) {
        if (this.published.delete(gridId)) geometry.push({ type: "grid-close", gridId });
        continue;
      }
      const windowId = position.args[1];
      const size = this.sizes.get(gridId) ?? { width: 0, height: 0 };
      const bounds: GridBounds = { gridId, ...origin, ...size, mouseEnabled: true, zIndex: 0, compIndex: 0 };
      if (position.name === "win_float_pos") {
        bounds.mouseEnabled = position.args[6];
        bounds.zIndex = position.args[7];
        bounds.compIndex = position.args[8];
      }
      const previous = this.published.get(gridId);
      if (previous?.position === position && previous.bounds.row === bounds.row &&
          previous.bounds.col === bounds.col && previous.bounds.width === bounds.width &&
          previous.bounds.height === bounds.height) continue;
      this.published.set(gridId, { position, bounds });
      geometry.push({ type: "grid-bounds", ...(windowId === null ? {} : { windowId }), bounds });
    }
    return geometry;
  }

  // A destroyed grid's number can be reused. Its former children need a fresh
  // position event before they can attach to that new owner.
  private removeAnchoredPositions(parent: number, geometry: NvimGeometryEvent[]): void {
    for (const [grid, position] of this.positions) {
      if (position.name !== "win_float_pos" || position.args[3] !== parent) continue;
      this.positions.delete(grid);
      if (this.published.delete(grid)) geometry.push({ type: "grid-close", gridId: grid });
      this.removeAnchoredPositions(grid, geometry);
    }
  }

  private origin(grid: number, visited: Set<number>): Origin | undefined {
    if (grid === 1) return { row: 0, col: 0 };
    const position = this.positions.get(grid);
    if (!position || visited.has(grid)) return undefined;
    if (position.name === "win_pos") return { row: position.args[2], col: position.args[3] };
    const [, , corner, parent, row, col, , , , screenRow, screenCol] = position.args;
    if (screenRow !== undefined && screenCol !== undefined) return { row: screenRow, col: screenCol };
    visited.add(grid);
    const anchor = this.origin(parent, visited);
    const size = this.sizes.get(grid);
    if (!anchor || !size || !["NW", "NE", "SW", "SE"].includes(corner)) return undefined;
    return {
      row: anchor.row + Math.floor(row) - (corner.startsWith("S") ? size.height : 0),
      col: anchor.col + Math.floor(col) - (corner.endsWith("E") ? size.width : 0),
    };
  }
}
