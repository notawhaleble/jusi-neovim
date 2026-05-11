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

  const grid = screen.getGridStates().find((entry) => entry.gridId === 2);
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

  const grid = screen.getGridStates().find((entry) => entry.gridId === 2);
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

  const grid = screen.getGridStates().find((entry) => entry.gridId === 2);
  assert.equal(grid?.lines[0], " abc    ");
}

testGridScrollMovesCellsUp();
testGridScrollMovesCellsDown();
testGridLineWritesTextAfterLeadingSpace();

console.log("screen-state tests passed");
