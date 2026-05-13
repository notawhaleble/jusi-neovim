import assert from "node:assert/strict";

import { NvimScreenState } from "../../dist/bridge/screen-state.js";

function testGridScrollMovesCellsUp() {
  const screen = new NvimScreenState();
  screen.handleRedraw([
    ["grid_resize", [2, 8, 4]],
    ["grid_line", [2, 0, 0, [["one     "]]]],
    ["grid_line", [2, 1, 0, [["two     "]]]],
    ["grid_line", [2, 2, 0, [["three   "]]]],
    ["grid_line", [2, 3, 0, [["four    "]]]],
    ["grid_scroll", [2, 0, 4, 0, 8, 1, 0]],
    ["grid_line", [2, 3, 0, [["tail    "]]]],
  ]);

  const grid = screen.getGridStates(true).find((entry) => entry.gridId === 2);
  assert.deepEqual(grid?.lines, [
    "two     ",
    "three   ",
    "four    ",
    "tail    ",
  ]);
}

function testGridScrollMovesCellsDown() {
  const screen = new NvimScreenState();
  screen.handleRedraw([
    ["grid_resize", [2, 8, 4]],
    ["grid_line", [2, 0, 0, [["one     "]]]],
    ["grid_line", [2, 1, 0, [["two     "]]]],
    ["grid_line", [2, 2, 0, [["three   "]]]],
    ["grid_line", [2, 3, 0, [["four    "]]]],
    ["grid_scroll", [2, 0, 4, 0, 8, -1, 0]],
    ["grid_line", [2, 0, 0, [["head    "]]]],
  ]);

  const grid = screen.getGridStates(true).find((entry) => entry.gridId === 2);
  assert.deepEqual(grid?.lines, [
    "head    ",
    "one     ",
    "two     ",
    "three   ",
  ]);
}

function testGridLineWritesTextAfterLeadingSpace() {
  const screen = new NvimScreenState();
  screen.handleRedraw([
    ["grid_resize", [2, 8, 2]],
    ["grid_line", [2, 0, 0, [[" abc"]]]],
  ]);

  const grid = screen.getGridStates(true).find((entry) => entry.gridId === 2);
  assert.equal(grid?.lines[0], " abc    ");
}

function testGridLineStoresHighlightIds() {
  const screen = new NvimScreenState();
  screen.handleRedraw([
    ["hl_attr_define", [1, { foreground: 0xff0000, background: 0x001122, bold: true }]],
    ["grid_resize", [2, 8, 2]],
    ["grid_line", [2, 0, 0, [["ab", 1], ["c"], [" ", 0, 2]]]],
  ]);

  const state = screen.getState(true);
  const grid = screen.getGridStates(true).find((entry) => entry.gridId === 2);
  assert.deepEqual(state.highlights[1], {
    foreground: "#ff0000",
    background: "#001122",
    special: undefined,
    bold: true,
    italic: undefined,
    underline: undefined,
    undercurl: undefined,
    reverse: undefined,
  });
  assert.equal(grid?.lines[0], "abc     ");
  assert.deepEqual(grid?.cells[0].slice(0, 5), [
    { text: "a", highlightId: 1 },
    { text: "b", highlightId: 1 },
    { text: "c", highlightId: 1 },
    { text: " ", highlightId: 0 },
    { text: " ", highlightId: 0 },
  ]);
  assert.deepEqual(grid?.runs[0], [
    { text: "abc", highlightId: 1 },
    { text: "     ", highlightId: 0 },
  ]);
}

function testGridLineIgnoresZeroRepeatCells() {
  const screen = new NvimScreenState();
  screen.handleRedraw([
    ["grid_resize", [1, 8, 1]],
    ["grid_line", [1, 0, 0, [["a", 1], [" ", 0, 0], ["b", 1]]]],
  ]);

  const state = screen.getState(true);
  assert.equal(state.lines[0], "ab      ");
  assert.deepEqual(state.cells[0].slice(0, 3), [
    { text: "a", highlightId: 1 },
    { text: "b", highlightId: 1 },
    { text: " ", highlightId: 0 },
  ]);
}

function testDefaultColorsUseLastPayloadInBatch() {
  const screen = new NvimScreenState();
  screen.handleRedraw([
    ["default_colors_set", [0x000000, 0xffffff, 0xff0000, 0, 0], [0x000000, 0xffdab9, 0xff0000, 17, 224]],
  ]);

  const state = screen.getState();
  assert.equal(state.foregroundColor, "#000000");
  assert.equal(state.backgroundColor, "#ffdab9");
}

function testModeCursorStyleTracksModeChange() {
  const screen = new NvimScreenState();
  screen.handleRedraw([
    ["mode_info_set", [true, [
      { name: "normal", short_name: "n", cursor_shape: "block", cell_percentage: 100 },
      { name: "insert", short_name: "i", cursor_shape: "vertical", cell_percentage: 25, attr_id: 7 },
    ]]],
    ["mode_change", ["insert", 1]],
  ]);

  assert.deepEqual(screen.getState().mode, {
    name: "insert",
    index: 1,
    cursor: {
      shape: "vertical",
      cellPercentage: 25,
      attrId: 7,
      attrIdLm: undefined,
      blinkWait: undefined,
      blinkOn: undefined,
      blinkOff: undefined,
      name: "insert",
      shortName: "i",
    },
  });
}

function testGridScrollPreservesHighlightIds() {
  const screen = new NvimScreenState();
  screen.handleRedraw([
    ["hl_attr_define", [1, { foreground: 0x00ff00 }]],
    ["grid_resize", [2, 4, 2]],
    ["grid_line", [2, 0, 0, [["top ", 1]]]],
    ["grid_line", [2, 1, 0, [["bot ", 0]]]],
    ["grid_scroll", [2, 0, 2, 0, 4, 1, 0]],
  ]);

  const grid = screen.getGridStates(true).find((entry) => entry.gridId === 2);
  assert.equal(grid?.lines[0], "bot ");
  assert.deepEqual(grid?.cells[0], [
    { text: "b", highlightId: 0 },
    { text: "o", highlightId: 0 },
    { text: "t", highlightId: 0 },
    { text: " ", highlightId: 0 },
  ]);
}

testGridScrollMovesCellsUp();
testGridScrollMovesCellsDown();
testGridLineWritesTextAfterLeadingSpace();
testGridLineStoresHighlightIds();
testGridLineIgnoresZeroRepeatCells();
testDefaultColorsUseLastPayloadInBatch();
testModeCursorStyleTracksModeChange();
testGridScrollPreservesHighlightIds();

console.log("screen-state tests passed");
