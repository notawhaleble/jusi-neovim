import assert from "node:assert/strict";

import { EmbeddedNvimSession } from "../../dist/bridge/rpc-session.js";

class FakeClient {
  requests = [];
  listener = null;
  exitListener = null;

  onNotification(listener) {
    this.listener = listener;
  }

  onExit(listener) {
    this.exitListener = listener;
  }

  async request(method, args = []) {
    this.requests.push({ method, args });
    if (method === "nvim_get_api_info") {
      return [7, {}];
    }
    return method === "nvim_exec_lua" ? true : null;
  }

  dispose() {}
}

async function testInputDoesNotRefreshLayoutSnapshot() {
  const client = new FakeClient();
  const session = new EmbeddedNvimSession(client);

  await session.input("a");

  assert.deepEqual(client.requests.map((request) => request.method), ["nvim_input"]);
}

async function testCommandsStillRefreshLayoutSnapshot() {
  const client = new FakeClient();
  const session = new EmbeddedNvimSession(client);

  await session.command("vsplit");

  assert.deepEqual(client.requests.map((request) => request.method), [
    "nvim_command",
    "nvim_exec_lua",
  ]);
}

async function testWindowInputRefreshesVisibleLayoutSnapshot() {
  const client = new FakeClient();
  const session = new EmbeddedNvimSession(client);

  await session.windowInput("<C-W>H");
  await new Promise((resolve) => setTimeout(resolve, 90));
  await session.dispose();

  assert.equal(client.requests[0].method, "nvim_input");
  assert.equal(client.requests[0].args[0], "<C-W>H");
  assert.ok(client.requests.slice(1).some((request) => request.method === "nvim_exec_lua"));
}

async function testUpdateWebMirrorWritesBufferAndEmitsState() {
  const client = new FakeClient();
  const session = new EmbeddedNvimSession(client);
  let emitted = null;
  session.onStateChanged((state) => {
    emitted = state;
  });

  session.start();
  client.listener({ method: "jusi:layout", args: [{ type: "buffer", bufferId: 3, kind: "web" }] });
  client.listener({ method: "jusi:web-session", args: [{ bufferId: 3, url: "https://example.com", incarnation: 1 }] });
  const ticket = { bufferId: 3, sessionId: session.getWebSession(3).sessionId, incarnation: 1, revision: 1 };
  assert.equal(await session.invalidateWebDocument(ticket), true);
  const mirror = {
    version: 1,
    totalTextLength: 11,
    lines: [
      { lineNumber: 0, text: "hello", startIndex: 0, endIndex: 5, spans: [] },
      { lineNumber: 1, text: "world", startIndex: 6, endIndex: 11, spans: [] },
    ],
  };

  assert.equal(await session.writeWebMirror(ticket, mirror), true);
  session.publishWebMirror(ticket, mirror);
  assert.equal(client.requests[1].method, "nvim_exec_lua");
  assert.deepEqual(client.requests[1].args[1], [ticket, ["hello", "world"]]);
  assert.ok(emitted);
}

async function testWebScrollNotificationIsForwarded() {
  const client = new FakeClient();
  const session = new EmbeddedNvimSession(client);
  let emitted = null;
  session.onWebScroll((event) => {
    emitted = event;
  });

  session.start();
  client.listener({
    method: "jusi:web-scroll",
    args: [{ bufferId: 3, windowId: 1000, lines: 2 }],
  });

  assert.deepEqual(emitted, { bufferId: 3, windowId: 1000, lines: 2 });
}

async function testWebOpenLinkNotificationIsForwarded() {
  const client = new FakeClient();
  const session = new EmbeddedNvimSession(client);
  let emitted = null;
  session.onWebOpenLink((event) => {
    emitted = event;
  });

  session.start();
  client.listener({
    method: "jusi:web-open-link",
    args: [{ bufferId: 3, windowId: 1000 }],
  });

  assert.deepEqual(emitted, { bufferId: 3, windowId: 1000 });
}

async function testWebEnterModeNotificationIsForwarded() {
  const client = new FakeClient();
  const session = new EmbeddedNvimSession(client);
  let emitted = null;
  session.onWebEnterMode((event) => {
    emitted = event;
  });

  session.start();
  client.listener({
    method: "jusi:web-enter-mode",
    args: [{ bufferId: 3, windowId: 1000 }],
  });

  assert.deepEqual(emitted, { bufferId: 3, windowId: 1000 });
}

async function testSetCursorUsesLuaBridge() {
  const client = new FakeClient();
  const session = new EmbeddedNvimSession(client);

  await session.setCursor(1000, 4, 7);

  assert.equal(client.requests[0].method, "nvim_exec_lua");
  assert.deepEqual(client.requests[0].args[1], [1000, 4, 7, null]);
  assert.equal(client.requests[1].method, "nvim_exec_lua");
}

async function testSetRegisterUsesNvimFunction() {
  const client = new FakeClient();
  const session = new EmbeddedNvimSession(client);

  await session.setRegister("*", "https://example.com/");

  assert.deepEqual(client.requests[0], {
    method: "nvim_call_function",
    args: ["setreg", ["*", "https://example.com/"]],
  });
}

async function testInstallClipboardProviderUsesLuaBridge() {
  const client = new FakeClient();
  const session = new EmbeddedNvimSession(client);

  await session.installClipboardProvider();

  assert.equal(client.requests[0].method, "nvim_get_api_info");
  assert.equal(client.requests[1].method, "nvim_exec_lua");
  assert.deepEqual(client.requests[1].args[1], ["", 7]);
  assert.match(client.requests[1].args[0], /jusi_neovim_install_clipboard_provider/);
}

async function testClipboardCopyNotificationIsForwarded() {
  const client = new FakeClient();
  const session = new EmbeddedNvimSession(client);
  let emitted = null;
  session.onClipboardCopy((event) => {
    emitted = event;
  });

  session.start();
  client.listener({
    method: "jusi:clipboard-copy",
    args: [{ register: "*", lines: ["hello", "world"], regtype: "V" }],
  });

  assert.deepEqual(emitted, { register: "*", lines: ["hello", "world"], regtype: "V" });
}

async function testExitNotificationIsForwarded() {
  const client = new FakeClient();
  const session = new EmbeddedNvimSession(client);
  let exited = false;
  session.onExit(() => {
    exited = true;
  });

  session.start();
  client.exitListener();

  assert.equal(exited, true);
}

await testInputDoesNotRefreshLayoutSnapshot();
await testCommandsStillRefreshLayoutSnapshot();
await testWindowInputRefreshesVisibleLayoutSnapshot();
await testUpdateWebMirrorWritesBufferAndEmitsState();
await testWebScrollNotificationIsForwarded();
await testWebOpenLinkNotificationIsForwarded();
await testWebEnterModeNotificationIsForwarded();
await testSetCursorUsesLuaBridge();
await testSetRegisterUsesNvimFunction();
await testInstallClipboardProviderUsesLuaBridge();
await testClipboardCopyNotificationIsForwarded();
await testExitNotificationIsForwarded();

console.log("rpc-session tests passed");

{
  const client = new FakeClient(), session = new EmbeddedNvimSession(client);
  session.start();
  client.listener({method:'jusi:layout',args:[{type:'buffer',bufferId:3,kind:'web'}]});
  client.listener({method:'jusi:web-session',args:[{bufferId:3,url:'https://example.com',providerId:'web',incarnation:1}]});
  const identity={bufferId:3,sessionId:session.getWebSession(3).sessionId,incarnation:1};
  client.requests=[];
  await session.setBrowserLocation({...identity,document:{close(){}}},'https://next/');
  assert.deepEqual(client.requests.at(-1),{method:'nvim_exec_lua',args:['return require("jusi_neovim.browser").location(...)',[identity,'https://next/']]});
  const count=client.requests.length;
  await session.setBrowserLocation({...identity,incarnation:2},'https://stale/');
  assert.equal(client.requests.length,count);
  assert.equal(session.getWebSession(3).url,'https://example.com');
}
