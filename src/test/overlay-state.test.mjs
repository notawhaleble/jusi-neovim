import assert from "node:assert/strict";

import { NvimOverlayState } from "../../dist/bridge/overlay-state.js";

function testTracksCmdlineShapeAndBlock() {
  const overlays = new NvimOverlayState();

  overlays.handleRedraw([
    ["cmdline_show", [[[0, "echo test", 0]], 4, ":", "", 2, 1, 0]],
    ["cmdline_special_char", [">", true, 1]],
    ["cmdline_block_show", [[[0, "function Foo()", 0]], [[0, "  echo 'bar'", 0]]]],
  ]);

  assert.deepEqual(overlays.getCmdline(), {
    visible: true,
    content: "echo test",
    firstChar: ":",
    prompt: "",
    position: 4,
    indent: 2,
    level: 1,
    specialChar: ">",
    specialShift: true,
    blockLines: ["function Foo()", "  echo 'bar'"],
  });

  overlays.handleRedraw([
    ["cmdline_pos", [1, 1]],
    ["cmdline_block_append", [[0, "endfunction", 0]]],
    ["cmdline_block_hide"],
    ["cmdline_hide", [1, false]],
  ]);

  assert.deepEqual(overlays.getCmdline(), {
    visible: false,
    content: "",
    firstChar: "",
    prompt: "",
    position: 0,
    indent: 0,
    level: 0,
    specialChar: "",
    specialShift: false,
    blockLines: [],
  });
}

function testTracksMessagesAndHistoryAppend() {
  const overlays = new NvimOverlayState();

  overlays.handleRedraw([
    ["msg_show", ["echo", [[0, "hello", 0]], false, true, false, "m1", ""]],
    ["msg_show", ["echo", [[0, " world", 0]], false, true, true, "m1", ""]],
    ["msg_showcmd", [[[0, "3/9", 0]]]],
    ["msg_ruler", [[[0, "12,4", 0]]]],
    ["msg_showmode", [[[0, "-- INSERT --", 0]]]],
    ["msg_history_show", [[
      ["echomsg", [[0, "part 1", 0]], false],
      ["echomsg", [[0, " + part 2", 0]], true],
      ["echoerr", [[0, "boom", 0]], false],
    ], false]],
  ]);

  assert.deepEqual(overlays.getMessages(), {
    entries: [{ kind: "echo", text: "hello world", id: "m1" }],
    showmode: "-- INSERT --",
    showcmd: "3/9",
    ruler: "12,4",
    history: [
      { kind: "echomsg", text: "part 1 + part 2", id: null },
      { kind: "echoerr", text: "boom", id: null },
    ],
    historyVisible: true,
  });

  overlays.handleRedraw([
    ["msg_clear"],
    ["msg_showmode", [[]]],
    ["msg_showcmd", [[]]],
    ["msg_ruler", [[]]],
  ]);

  assert.deepEqual(overlays.getMessages(), {
    entries: [],
    showmode: "",
    showcmd: "",
    ruler: "",
    history: [
      { kind: "echomsg", text: "part 1 + part 2", id: null },
      { kind: "echoerr", text: "boom", id: null },
    ],
    historyVisible: false,
  });
}

testTracksCmdlineShapeAndBlock();
testTracksMessagesAndHistoryAppend();

console.log("overlay-state tests passed");
