import assert from "node:assert/strict";

import { commandAreaHeight, placePopupmenu } from "../../dist/renderer/compositor.js";

function testCommandAreaUsesExactCellRows() {
  assert.equal(commandAreaHeight({ cmdlineVisible: false, blockLineCount: 0 }, { cellWidth: 9, cellHeight: 18 }), 0);
  assert.equal(commandAreaHeight({ cmdlineVisible: true, blockLineCount: 0 }, { cellWidth: 9, cellHeight: 18 }), 18);
  assert.equal(commandAreaHeight({ cmdlineVisible: true, blockLineCount: 2 }, { cellWidth: 9, cellHeight: 18 }), 54);
}

function testExternalCmdlinePopupSitsAboveCommandArea() {
  const placement = placePopupmenu({
    popupmenu: {
      visible: true,
      items: [{ word: "write" }, { word: "wall" }],
      selected: 0,
      row: 0,
      col: 1,
      grid: -1,
    },
    snapshot: {
      currentTabId: 1,
      tabs: [],
      windows: [],
      buffers: [],
    },
    stage: { width: 900, height: 720, cellWidth: 9, cellHeight: 18 },
    commandAreaHeight: 18,
    popupHeight: 48,
  });

  assert.deepEqual(placement, {
    left: 17,
    top: 654,
  });
}

function testGridPopupAnchorsAboveCompletionRow() {
  const placement = placePopupmenu({
    popupmenu: {
      visible: true,
      items: [{ word: "alpha" }, { word: "beta" }, { word: "gamma" }],
      selected: 1,
      row: 10,
      col: 4,
      grid: 3,
    },
    snapshot: {
      currentTabId: 1,
      tabs: [],
      windows: [
        {
          id: 100,
          tabId: 1,
          bufferId: 1,
          gridId: 3,
          row: 2,
          col: 5,
          width: 40,
          height: 12,
        },
      ],
      buffers: [],
    },
    stage: { width: 900, height: 720, cellWidth: 9, cellHeight: 18 },
    commandAreaHeight: 18,
    popupHeight: 72,
  });

  assert.deepEqual(placement, {
    left: 81,
    top: 144,
  });
}

testCommandAreaUsesExactCellRows();
testExternalCmdlinePopupSitsAboveCommandArea();
testGridPopupAnchorsAboveCompletionRow();

console.log("compositor tests passed");
