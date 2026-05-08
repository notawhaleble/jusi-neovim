import { GridBounds } from "../core/types.js";
import { NvimGeometryEvent, NvimRedrawEvent } from "./protocol.js";

type PartialGridBounds = {
  gridId: number;
  row: number;
  col: number;
  width: number;
  height: number;
  zIndex: number;
};

export class NvimRedrawTranslator {
  private readonly grids = new Map<number, PartialGridBounds>();

  translate(events: NvimRedrawEvent[]): NvimGeometryEvent[] {
    const geometry: NvimGeometryEvent[] = [];

    for (const event of events) {
      switch (event.name) {
        case "grid_resize":
          this.handleGridResize(event.args[0], event.args[1], event.args[2], geometry);
          break;
        case "win_pos":
          this.handleWinPos(
            event.args[0],
            event.args[1],
            event.args[2],
            event.args[3],
            event.args[4],
            event.args[5],
            geometry,
          );
          break;
        case "win_float_pos":
          this.handleFloatPos(
            event.args[0],
            event.args[1],
            event.args[4],
            event.args[5],
            event.args[7],
            geometry,
          );
          break;
        case "win_close":
        case "win_hide":
        case "grid_destroy":
          this.grids.delete(event.args[0]);
          geometry.push({
            type: "grid-close",
            gridId: event.args[0],
          });
          break;
      }
    }

    return geometry;
  }

  private handleGridResize(
    gridId: number,
    width: number,
    height: number,
    geometry: NvimGeometryEvent[],
  ): void {
    const next = {
      ...(this.grids.get(gridId) ?? this.defaultGrid(gridId)),
      width,
      height,
    };
    this.grids.set(gridId, next);
    geometry.push({
      type: "grid-bounds",
      bounds: this.toBounds(next),
    });
  }

  private handleWinPos(
    gridId: number,
    windowId: number | null,
    row: number,
    col: number,
    width: number,
    height: number,
    geometry: NvimGeometryEvent[],
  ): void {
    const next = {
      ...(this.grids.get(gridId) ?? this.defaultGrid(gridId)),
      row,
      col,
      width,
      height,
      zIndex: 0,
    };
    this.grids.set(gridId, next);
    geometry.push({
      type: "grid-bounds",
      ...(windowId === null ? {} : { windowId }),
      bounds: this.toBounds(next),
    });
  }

  private handleFloatPos(
    gridId: number,
    windowId: number | null,
    row: number,
    col: number,
    zIndex: number,
    geometry: NvimGeometryEvent[],
  ): void {
    const next = {
      ...(this.grids.get(gridId) ?? this.defaultGrid(gridId)),
      row,
      col,
      zIndex,
    };
    this.grids.set(gridId, next);
    geometry.push({
      type: "grid-bounds",
      ...(windowId === null ? {} : { windowId }),
      bounds: this.toBounds(next),
    });
  }

  private defaultGrid(gridId: number): PartialGridBounds {
    return {
      gridId,
      row: 0,
      col: 0,
      width: 0,
      height: 0,
      zIndex: 0,
    };
  }

  private toBounds(bounds: PartialGridBounds): GridBounds {
    return {
      gridId: bounds.gridId,
      row: bounds.row,
      col: bounds.col,
      width: bounds.width,
      height: bounds.height,
      zIndex: bounds.zIndex,
    };
  }
}
