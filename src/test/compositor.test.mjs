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
    commandAnchorLeft: 17,
    popupHeight: 48,
  });

  assert.deepEqual(placement, {
    left: 17,
    top: 654,
    maxHeight: 48,
    maxWidth: 883,
  });
}

function testExternalCmdlinePopupFitsAvailableViewport() {
  const placement = placePopupmenu({
    popupmenu: {
      visible: true,
      items: Array.from({ length: 40 }, (_, index) => ({ word: `command-${index}` })),
      selected: 0,
      row: 0,
      col: 50,
      grid: -1,
    },
    snapshot: {
      currentTabId: 1,
      tabs: [],
      windows: [],
      buffers: [],
    },
    stage: { width: 300, height: 180, cellWidth: 10, cellHeight: 18 },
    commandAreaHeight: 18,
    commandAnchorLeft: 508,
    popupHeight: 720,
    popupWidth: 160,
  });

  assert.deepEqual(placement, {
    left: 140,
    top: 0,
    maxHeight: 162,
    maxWidth: 160,
  });
}

function testExternalCmdlinePopupUsesActualCommandAreaTop() {
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
    stage: { width: 900, height: 729, cellWidth: 9, cellHeight: 18 },
    commandAreaHeight: 18,
    commandAnchorLeft: 17,
    commandAreaTop: 702,
    popupHeight: 72,
    popupWidth: 160,
  });

  assert.deepEqual(placement, {
    left: 17,
    top: 630,
    maxHeight: 72,
    maxWidth: 883,
  });
}

function testGridPopupAnchorsAboveCompletionRowWhenTopHasMoreSpace() {
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
          gridBounds: { gridId: 3, row: 2, col: 5, width: 40, height: 12 },
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
    maxHeight: 72,
    maxWidth: 819,
  });
}

function testGridPopupAnchorsBelowCompletionRowWhenBottomHasMoreSpace() {
  const placement = placePopupmenu({
    popupmenu: {
      visible: true,
      items: [{ word: "alpha" }, { word: "beta" }, { word: "gamma" }],
      selected: 1,
      row: 1,
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
          gridBounds: { gridId: 3, row: 2, col: 5, width: 40, height: 12 },
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
    top: 72,
    maxHeight: 72,
    maxWidth: 819,
  });
}

function testGridPopupAboveDoesNotCrossWindowTop() {
  const placement = placePopupmenu({
    popupmenu: {
      visible: true,
      items: Array.from({ length: 10 }, (_, index) => ({ word: `item-${index}` })),
      selected: 0,
      row: 3,
      col: 0,
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
          gridBounds: { gridId: 3, row: 2, col: 5, width: 40, height: 4 },
        },
      ],
      buffers: [],
    },
    stage: { width: 900, height: 720, cellWidth: 9, cellHeight: 18 },
    commandAreaHeight: 18,
    popupHeight: 180,
  });

  assert.deepEqual(placement, {
    left: 45,
    top: 36,
    maxHeight: 54,
    maxWidth: 855,
  });
}

function testGridPopupBelowDoesNotOverlapCommandArea() {
  const placement = placePopupmenu({
    popupmenu: {
      visible: true,
      items: Array.from({ length: 10 }, (_, index) => ({ word: `item-${index}` })),
      selected: 0,
      row: 1,
      col: 0,
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
          gridBounds: { gridId: 3, row: 0, col: 0, width: 80, height: 40 },
        },
      ],
      buffers: [],
    },
    stage: { width: 900, height: 720, cellWidth: 9, cellHeight: 18 },
    commandAreaHeight: 72,
    popupHeight: 700,
  });

  assert.deepEqual(placement, {
    left: 0,
    top: 36,
    maxHeight: 612,
    maxWidth: 900,
  });
}

testCommandAreaUsesExactCellRows();
testExternalCmdlinePopupSitsAboveCommandArea();
testExternalCmdlinePopupFitsAvailableViewport();
testExternalCmdlinePopupUsesActualCommandAreaTop();
testGridPopupAnchorsAboveCompletionRowWhenTopHasMoreSpace();
testGridPopupAnchorsBelowCompletionRowWhenBottomHasMoreSpace();
testGridPopupAboveDoesNotCrossWindowTop();
testGridPopupBelowDoesNotOverlapCommandArea();

console.log("compositor tests passed");

const floatMenu = {
  popupmenu: { visible: true, items: [], row: 1, col: 5, grid: 7 },
  stage: { width: 100, height: 90, cellWidth: 10, cellHeight: 10 },
  commandAreaHeight: 10, popupHeight: 70, popupWidth: 140,
};
const owner = { id: 2, tabId: 1, gridId: 7, row: 0, col: 0,
  gridBounds: { gridId: 7, row: 3, col: 4, width: 12, height: 7 } };
const place = windows => placePopupmenu({ ...floatMenu, snapshot: { currentTabId: 1, windows } });
assert.deepEqual(place([owner]), { left: 0, top: 50, maxWidth: 100, maxHeight: 30 });
for (const windows of [[], [{ ...owner, tabId: 2 }], [{ ...owner, gridBounds: undefined }],
  [{ ...owner, gridBounds: { ...owner.gridBounds, col: 8 } }]]) {
  assert.deepEqual(place(windows), { left: 0, top: 0, maxWidth: 0, maxHeight: 0 });
}
