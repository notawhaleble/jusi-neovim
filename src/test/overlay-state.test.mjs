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
    version: 3,
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
  ]);

  assert.deepEqual(overlays.getMessages(), {
    version: 4,
    entries: [],
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
    ["msg_show", ["return_prompt", [[0, "Press ENTER or type command to continue", 0]], false, true, false, "prompt", ""]],
  ]);

  assert.deepEqual(overlays.getMessages(), {
    version: 5,
    entries: [{ kind: "return_prompt", text: "Press ENTER or type command to continue", id: "prompt" }],
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
    version: 6,
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

function testTracksDirectMessagesHistoryPayload() {
  const overlays = new NvimOverlayState();

  overlays.handleRedraw([
    ["msg_history_show",
      ["echomsg", [[0, "lalala", 0]], false],
      ["echomsg", [[0, "ololo", 0]], false],
    ],
  ]);

  assert.deepEqual(overlays.getMessages(), {
    version: 1,
    entries: [],
    showmode: "",
    showcmd: "",
    ruler: "",
    history: [
      { kind: "echomsg", text: "lalala", id: null },
      { kind: "echomsg", text: "ololo", id: null },
    ],
    historyVisible: true,
  });
}

function testTracksHitEnterCommandOutput() {
  const overlays = new NvimOverlayState();

  overlays.handleRedraw([
    ["msg_show", ["list_cmd", [[0, "  1 %a   \"one.txt\" line 1", 0]], false, true, false, "ls1", ""]],
    ["msg_show", ["list_cmd", [[0, "  2      \"two.txt\" line 1", 0]], false, true, false, "ls2", ""]],
    ["msg_show", ["return_prompt", [[0, "Press ENTER or type command to continue", 0]], false, true, false, "prompt", ""]],
  ]);

  assert.deepEqual(overlays.getMessages(), {
    version: 3,
    entries: [
      { kind: "list_cmd", text: "  1 %a   \"one.txt\" line 1", id: "ls1" },
      { kind: "list_cmd", text: "  2      \"two.txt\" line 1", id: "ls2" },
      { kind: "return_prompt", text: "Press ENTER or type command to continue", id: "prompt" },
    ],
    showmode: "",
    showcmd: "",
    ruler: "",
    history: [],
    historyVisible: false,
  });
}

function testTracksMultilineCommandOutput() {
  const overlays = new NvimOverlayState();

  overlays.handleRedraw([
    ["msg_show", ["list_cmd", [[0, "\n  1 %a   \"[No Name]\"                    line 1\n  2  h   \"[Scratch]\"                    line 0", 0]], false, false]],
  ]);

  assert.deepEqual(overlays.getMessages(), {
    version: 1,
    entries: [
      {
        kind: "list_cmd",
        text: "\n  1 %a   \"[No Name]\"                    line 1\n  2  h   \"[Scratch]\"                    line 0",
        id: null,
      },
    ],
    showmode: "",
    showcmd: "",
    ruler: "",
    history: [],
    historyVisible: false,
  });
}

testTracksCmdlineShapeAndBlock();
testTracksMessagesAndHistoryAppend();
testTracksDirectMessagesHistoryPayload();
testTracksHitEnterCommandOutput();
testTracksMultilineCommandOutput();

console.log("overlay-state tests passed");
