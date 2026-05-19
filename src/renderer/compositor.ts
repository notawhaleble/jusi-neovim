import { PopupmenuState, UiSnapshot } from "../core/types.js";

export interface CellMetrics {
  cellWidth: number;
  cellHeight: number;
}

export interface StageMetrics extends CellMetrics {
  width: number;
  height: number;
}

export interface CommandAreaState {
  cmdlineVisible: boolean;
  blockLineCount: number;
}

export interface Rect {
  left: number;
  top: number;
  maxHeight?: number;
  maxWidth?: number;
}

export function commandAreaHeight(command: CommandAreaState, metrics: CellMetrics): number {
  const cmdlineHeight = command.cmdlineVisible ? metrics.cellHeight : 0;
  return cmdlineHeight + (command.blockLineCount * metrics.cellHeight);
}

export function placePopupmenu(args: {
  popupmenu: PopupmenuState;
  snapshot: UiSnapshot;
  stage: StageMetrics;
  commandAreaHeight: number;
  commandAreaTop?: number;
  popupHeight: number;
  popupWidth?: number;
}): Rect {
  const { popupmenu, snapshot, stage } = args;
  const commandBoundaryTop = args.commandAreaTop ?? (stage.height - args.commandAreaHeight);
  const clampHorizontal = (left: number): { left: number; maxWidth: number } => {
    if (args.popupWidth === undefined) {
      const clampedLeft = Math.max(0, Math.min(left, stage.width));
      return {
        left: clampedLeft,
        maxWidth: Math.max(0, stage.width - clampedLeft),
      };
    }
    const popupWidth = Math.max(0, Math.min(args.popupWidth ?? stage.width, stage.width));
    const clampedLeft = Math.max(0, Math.min(left, Math.max(0, stage.width - popupWidth)));
    return {
      left: clampedLeft,
      maxWidth: Math.max(0, stage.width - clampedLeft),
    };
  };
  const boundedPlacement = (
    left: number,
    lineTop: number,
    lineBottom: number,
    minTop: number,
    maxBottom: number,
  ): Rect => {
    const topSpace = Math.max(0, lineTop - minTop);
    const bottomSpace = Math.max(0, maxBottom - lineBottom);
    const openAbove = topSpace > bottomSpace;
    const maxHeight = Math.max(0, Math.min(args.popupHeight, openAbove ? topSpace : bottomSpace));
    const horizontal = clampHorizontal(left);
    return {
      left: horizontal.left,
      top: openAbove ? Math.max(minTop, lineTop - maxHeight) : lineBottom,
      maxHeight,
      maxWidth: horizontal.maxWidth,
    };
  };

  if (popupmenu.grid === -1) {
    const maxBottom = Math.max(0, commandBoundaryTop);
    const maxHeight = Math.max(0, Math.min(args.popupHeight, maxBottom));
    const horizontal = clampHorizontal(8 + popupmenu.col * stage.cellWidth);
    return {
      left: horizontal.left,
      top: Math.max(0, maxBottom - maxHeight),
      maxHeight,
      maxWidth: horizontal.maxWidth,
    };
  }

  if (popupmenu.grid > 1) {
    const anchorWindow = snapshot.windows.find((window) => {
      return window.tabId === snapshot.currentTabId && window.gridId === popupmenu.grid;
    });
    if (anchorWindow && typeof anchorWindow.row === "number" && typeof anchorWindow.col === "number") {
      const lineTop = (anchorWindow.row + popupmenu.row) * stage.cellHeight;
      const lineBottom = lineTop + stage.cellHeight;
      const minTop = anchorWindow.row * stage.cellHeight;
      const windowBottom = typeof anchorWindow.height === "number"
        ? (anchorWindow.row + anchorWindow.height) * stage.cellHeight
        : stage.height;
      const maxBottom = Math.min(windowBottom, commandBoundaryTop);
      return boundedPlacement(
        (anchorWindow.col + popupmenu.col) * stage.cellWidth,
        lineTop,
        lineBottom,
        minTop,
        maxBottom,
      );
    }
  }

  const lineTop = popupmenu.row * stage.cellHeight;
  return boundedPlacement(
    popupmenu.col * stage.cellWidth,
    lineTop,
    lineTop + stage.cellHeight,
    0,
    commandBoundaryTop,
  );
}
