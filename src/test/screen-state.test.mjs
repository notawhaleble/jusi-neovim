import assert from "node:assert/strict";

import { NvimScreenState } from "../../dist/bridge/screen-state.js";

function testGridScrollMovesCellsUp() {
  const screen = new NvimScreenState();
  screen.handleRedraw([
    ["grid_resize", [2, 8, 4]],
    ["grid_line", [2, 0, 0, [["o"], ["n"], ["e"], [" "], [" "], [" "], [" "], [" "]]]],
    ["grid_line", [2, 1, 0, [["t"], ["w"], ["o"], [" "], [" "], [" "], [" "], [" "]]]],
    ["grid_line", [2, 2, 0, [["t"], ["h"], ["r"], ["e"], ["e"], [" "], [" "], [" "]]]],
    ["grid_line", [2, 3, 0, [["f"], ["o"], ["u"], ["r"], [" "], [" "], [" "], [" "]]]],
    ["grid_scroll", [2, 0, 4, 0, 8, 1, 0]],
    ["grid_line", [2, 3, 0, [["t"], ["a"], ["i"], ["l"], [" "], [" "], [" "], [" "]]]],
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
    ["grid_line", [2, 0, 0, [["o"], ["n"], ["e"], [" "], [" "], [" "], [" "], [" "]]]],
    ["grid_line", [2, 1, 0, [["t"], ["w"], ["o"], [" "], [" "], [" "], [" "], [" "]]]],
    ["grid_line", [2, 2, 0, [["t"], ["h"], ["r"], ["e"], ["e"], [" "], [" "], [" "]]]],
    ["grid_line", [2, 3, 0, [["f"], ["o"], ["u"], ["r"], [" "], [" "], [" "], [" "]]]],
    ["grid_scroll", [2, 0, 4, 0, 8, -1, 0]],
    ["grid_line", [2, 0, 0, [["h"], ["e"], ["a"], ["d"], [" "], [" "], [" "], [" "]]]],
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
    ["grid_line", [2, 0, 0, [[" "], ["a"], ["b"], ["c"]]]],
  ]);

  const grid = screen.getGridStates(true).find((entry) => entry.gridId === 2);
  assert.equal(grid?.lines[0], " abc    ");
}

function testGridLineStoresHighlightIds() {
  const screen = new NvimScreenState();
  screen.handleRedraw([
    ["hl_attr_define", [1, { foreground: 0xff0000, background: 0x001122, bold: true }]],
    ["grid_resize", [2, 8, 2]],
    ["grid_line", [2, 0, 0, [["a", 1], ["b", 1], ["c"], [" ", 0, 2]]]],
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
    underdouble: undefined,
    underdotted: undefined,
    underdashed: undefined,
    strikethrough: undefined,
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
    { text: "abc", highlightId: 1, columns: 3 },
    { text: "     ", highlightId: 0, columns: 5 },
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
    ["grid_line", [2, 0, 0, [["t", 1], ["o", 1], ["p", 1], [" ", 1]]]],
    ["grid_line", [2, 1, 0, [["b", 0], ["o", 0], ["t", 0], [" ", 0]]]],
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

function testGridCloseRemovesStaleGridState() {
  const screen = new NvimScreenState();
  screen.handleRedraw([
    ["grid_resize", [2, 4, 1]],
    ["grid_line", [2, 0, 0, [["g"], ["o"], ["n"], ["e"]]]],
    ["grid_cursor_goto", [2, 0, 1]],
    ["grid_destroy", [2]],
  ]);

  assert.equal(screen.getGridStates().some((entry) => entry.gridId === 2), false);
  assert.equal(screen.getGridStatesFor(new Set([2])).length, 0);
}

function testWinHideKeepsGridContentForTabReturn() {
  const screen = new NvimScreenState();
  screen.handleRedraw([
    ["grid_resize", [2, 4, 1]],
    ["grid_line", [2, 0, 0, [["k"], ["e"], ["e"], ["p"]]]],
    ["win_hide", [2]],
  ]);

  assert.equal(screen.getGridStatesFor(new Set([2]))[0]?.lines[0], "keep");
}

testGridScrollMovesCellsUp();
testGridScrollMovesCellsDown();
testGridLineWritesTextAfterLeadingSpace();
testGridLineStoresHighlightIds();
testGridLineIgnoresZeroRepeatCells();
testDefaultColorsUseLastPayloadInBatch();
testModeCursorStyleTracksModeChange();
testGridScrollPreservesHighlightIds();
testGridCloseRemovesStaleGridState();
testWinHideKeepsGridContentForTabReturn();

console.log("screen-state tests passed");

// Each grid_line item is a cell, not a string to split into code points.
{
 const screen=new NvimScreenState();
 screen.handleRedraw([['grid_resize',[2,8,2]],
   ['grid_line',[2,0,0,[['A',1],['é'],['文'],[''],['😀'],[''],['Z'],[' ']]]]]);
 const grid=screen.getGridStates(true)[0];
 assert.deepEqual(grid.cells[0].map(c=>c.text),['A','é','文','','😀','','Z',' ']);
 assert.deepEqual(grid.runs[0].map(r=>[r.text,r.columns]),[['A',1],['é',1],['文',2],['😀',2],['Z ',2]]);
 assert.equal(grid.lines[0],'Aé文😀Z ');
 screen.handleRedraw([['grid_line',[2,0,1,[['ô',2,2],[' ',0,3]]]],['grid_scroll',[2,0,2,0,8,-1,0]]]);
 const moved=screen.getGridStates(true)[0];
 assert.deepEqual(moved.cells[1].slice(1,3).map(c=>c.text),['ô','ô']);
 assert.equal(grid.cells[0][1].text,'é','prior snapshots stay immutable');
 assert.equal(moved.runs[1].reduce((n,r)=>n+r.columns,0),8);
}

{
  const screen = new NvimScreenState();
  screen.handleRedraw([['mode_info_set', [true, [{cursor_shape:'vertical',cell_percentage:20}]]], ['busy_start', []]]);
  const previous = screen.getState();
  assert.equal(previous.busy,true);
  assert.equal(previous.mode.cursor.shape,'vertical');
  screen.handleRedraw([['mode_info_set', [false, [{cursor_shape:'horizontal'}]]], ['busy_stop', []]]);
  assert.equal(screen.getState().mode.cursor.shape,'block');
  assert.equal(screen.getState().busy,false);
  assert.equal(previous.busy,true);
  assert.equal(previous.mode.cursor.shape,'vertical');
  screen.handleRedraw([['mode_info_set', [true, [{cursor_shape:'horizontal'}]]]]);
  assert.equal(screen.getState().mode.cursor.shape,'horizontal');
  screen.handleRedraw([['hl_attr_define', [42,{underdouble:true,underdotted:true,underdashed:true,strikethrough:true,special:0x123456}]]]);
  const attrs = screen.getState().highlights[42];
  for (const name of ['underdouble','underdotted','underdashed','strikethrough']) assert.equal(attrs[name],true);
  assert.equal(attrs.special,'#123456');
}
