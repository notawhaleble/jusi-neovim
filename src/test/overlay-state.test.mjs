import assert from "node:assert/strict";

import { NvimOverlayState } from "../../dist/bridge/overlay-state.js";

// Older fixtures describe content; revision lifecycle is asserted separately below.
function withoutRevisions(state) {
  const strip = ({ revision, chunks, truncated, ...entry }) => entry;
  const {statusChunks, ...plain} = state;
  return { ...plain, entries: state.entries.map(strip), history: state.history.map(strip) };
}

function testTracksCmdlineShapeAndBlock() {
  const overlays = new NvimOverlayState();

  overlays.handleRedraw([
    ["cmdline_show", [[[0, "echo test", 0]], 4, ":", "", 2, 1, 0]],
    ["cmdline_special_char", [">", true, 1]],
    ["cmdline_block_show", [[[[0, "function Foo()", 0]], [[0, "  echo 'bar'", 0]]]]],
  ]);

  assert.deepEqual(overlays.getCmdline(), {
    visible: true,
    content: "echo test",
    chunks: [{highlightId:0,text:"echo test"}],
    promptHighlightId: 0,
    blockChunks: [[{highlightId:0,text:"function Foo()"}],[{highlightId:0,text:"  echo 'bar'"}]],
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
    ["cmdline_block_append", [[[0, "endfunction", 0]]]],
    ["cmdline_block_hide"],
    ["cmdline_hide", [1, false]],
  ]);

  assert.deepEqual(overlays.getCmdline(), {
    visible: false,
    content: "",
    chunks: [], promptHighlightId: 0, blockChunks: [],
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
  ]);
  assert.equal(overlays.getMessages().entries[0].text, "hello world");
  overlays.handleRedraw([
    ["msg_showcmd", [[[0, "3/9", 0]]]],
    ["msg_ruler", [[[0, "12,4", 0]]]],
    ["msg_showmode", [[[0, "-- INSERT --", 0]]]],
    ["msg_history_show", [[
      ["echomsg", [[0, "part 1", 0]], false],
      ["echomsg", [[0, " + part 2", 0]], true],
      ["echoerr", [[0, "boom", 0]], false],
    ], false]],
  ]);

  assert.deepEqual(withoutRevisions(overlays.getMessages()), {
    version: 3,
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
    ["msg_clear"],
  ]);

  assert.deepEqual(withoutRevisions(overlays.getMessages()), {
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

  assert.deepEqual(withoutRevisions(overlays.getMessages()), {
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

  assert.deepEqual(withoutRevisions(overlays.getMessages()), {
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

  assert.deepEqual(withoutRevisions(overlays.getMessages()), {
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

  assert.deepEqual(withoutRevisions(overlays.getMessages()), {
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

  assert.deepEqual(withoutRevisions(overlays.getMessages()), {
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

{
  const overlays = new NvimOverlayState();
  overlays.handleRedraw([["msg_show", ["shell_out", [[0, "push output\nline 2"]], false, false]]]);
  const dismissed = overlays.getMessages().version;
  overlays.handleRedraw([["msg_show", ["undo", [[0, "1 change"]], false, false]]]);
  assert.deepEqual(overlays.getMessages().entries.filter(e => e.revision > dismissed).map(e => e.kind), ["undo"]);
  overlays.handleRedraw([["msg_show", ["echo", [[0, "new output"]], true, false]]]);
  assert.equal(overlays.getMessages().entries.at(-1).revision, 3);
  overlays.handleRedraw([["msg_show", ["echo", [[0, " appended"]], false, false, true]]]);
  assert.equal(overlays.getMessages().entries.at(-1).revision, 4);
  overlays.handleRedraw([["msg_history_show", [[["echo", [[0, "old history"]]]]]]]);
  assert.equal(overlays.getMessages().history[0].revision, 5);
  overlays.handleRedraw([["msg_history_clear"]]);
  assert.deepEqual(overlays.getMessages().history, []);
  assert.equal(overlays.getMessages().historyVisible, false);
  overlays.handleRedraw([["cmdline_show", [[[0,"legacy six fields"]], 0, ":", "", 0, 1]]]);
  assert.equal(overlays.getCmdline().visible, true);
}

{
  const ui = new NvimOverlayState();
  ui.handleRedraw([['cmdline_show', [[[2,'echo 文😀é']], 15, ':', '', 0, 1]],
    ['cmdline_show', [[[3,'1+2']], 3, '=', false, 0, 2]],
    ['cmdline_pos', [5, 1]]]);
  assert.equal(ui.getCmdline().level, 2);
  const nested = ui.getCmdline();
  ui.handleRedraw([['cmdline_hide',[2,true]]]);
  assert.equal(ui.getCmdline().content,'echo 文😀é');
  assert.equal(ui.getCmdline().position,5,'parent updates retained while nested');
  assert.deepEqual(ui.getCmdline().chunks,[{highlightId:2,text:'echo 文😀é'}]);
  assert.equal(nested.level,2,'published parent/child snapshots do not mutate');
  ui.handleRedraw([['cmdline_hide',[99,false]]]);
  assert.equal(ui.getCmdline().visible,true,'unrelated level hide ignored');
  ui.handleRedraw([['cmdline_block_show', [[[[4,'if true']],[[5,'  echo 1']]]]],
    ['cmdline_block_append', [[[6,'endif']]]]]);
  assert.deepEqual(ui.getCmdline().blockLines,['if true','  echo 1','endif']);
  assert.deepEqual(ui.getCmdline().blockChunks.map(line=>line[0].highlightId),[4,5,6]);
  ui.handleRedraw([['cmdline_show', [[[0,'x']],1,'','Prompt: ',0,3,7]],['cmdline_hide',[1]]]);
  assert.equal(ui.getCmdline().level,3);
  assert.equal(ui.getCmdline().promptHighlightId,7);
  ui.handleRedraw([['cmdline_hide',[3]],['cmdline_block_hide']]);
  assert.equal(ui.getCmdline().visible,false);
  assert.deepEqual(ui.getCmdline().blockLines,[]);
}

{
  const {maxMessageBytes,maxRetainedMessageBytes}=await import('../../dist/bridge/overlay-state.js');
  const bytes=s=>Buffer.byteLength(s,'utf8');
  const ui=new NvimOverlayState();
  ui.handleRedraw([['msg_show',['shell_out',[[2,'文😀'.repeat(30000)]],false,false,false,9]]]);
  const first=ui.getMessages().entries[0];
  assert.ok(bytes(first.text)<=maxMessageBytes);
  assert.ok(first.truncated);
  assert.ok(!first.text.includes('\ufffd'));
  ui.handleRedraw([['msg_show',['shell_out',[[3,'TAIL']],false,false,true,9]]]);
  const last=ui.getMessages().entries[0];
  assert.ok(last.text.endsWith('TAIL'));
  assert.equal(last.chunks.at(-1).highlightId,3);
  assert.ok(last.revision>first.revision);
  assert.ok(bytes(last.text)<=maxMessageBytes);
  assert.notEqual(first.text,last.text,'bounded append does not mutate published entry');
  for(let i=0;i<10;i++)ui.handleRedraw([['msg_show',['echo',[[i,'a'.repeat(100000)]],false,false]]]);
  assert.ok(ui.getMessages().entries.reduce((n,e)=>n+bytes(e.text),0)<=maxRetainedMessageBytes);
  ui.handleRedraw([['msg_history_show', [Array.from({length:210},()=>['echo',[[4,'文'.repeat(50000)]]])]]]);
  assert.ok(ui.getMessages().history.reduce((n,e)=>n+bytes(e.text),0)<=maxRetainedMessageBytes);
  assert.ok(ui.getMessages().history.some(e=>e.truncated));
  ui.handleRedraw([['msg_clear'],['msg_history_clear']]);
  assert.deepEqual(ui.getMessages().entries,[]);assert.deepEqual(ui.getMessages().history,[]);
}
