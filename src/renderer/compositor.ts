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
  popupHeight: number;
}): Rect {
  const { popupmenu, snapshot, stage } = args;
  if (popupmenu.grid === -1) {
    return {
      left: 8 + popupmenu.col * stage.cellWidth,
      top: Math.max(0, stage.height - args.commandAreaHeight - args.popupHeight),
    };
  }

  if (popupmenu.grid > 1) {
    const anchorWindow = snapshot.windows.find((window) => {
      return window.tabId === snapshot.currentTabId && window.gridId === popupmenu.grid;
    });
    if (anchorWindow && typeof anchorWindow.row === "number" && typeof anchorWindow.col === "number") {
      return {
        left: (anchorWindow.col + popupmenu.col) * stage.cellWidth,
        top: Math.max(0, (anchorWindow.row + popupmenu.row - popupmenu.items.length - 1) * stage.cellHeight),
      };
    }
  }

  return {
    left: popupmenu.col * stage.cellWidth,
    top: popupmenu.row * stage.cellHeight,
  };
}
