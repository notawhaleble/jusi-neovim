import assert from "node:assert/strict";

import { EmbeddedNvimSession } from "../../dist/bridge/rpc-session.js";

class FakeClient {
  requests = [];
  listener = null;

  onNotification(listener) {
    this.listener = listener;
  }

  async request(method, args = []) {
    this.requests.push({ method, args });
    return null;
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

async function testUpdateWebMirrorWritesBufferAndEmitsState() {
  const client = new FakeClient();
  const session = new EmbeddedNvimSession(client);
  let emitted = null;
  session.onStateChanged((state) => {
    emitted = state;
  });

  await session.updateWebMirror(3, {
    version: 1,
    totalTextLength: 11,
    lines: [
      { lineNumber: 0, text: "hello", startIndex: 0, endIndex: 5, spans: [] },
      { lineNumber: 1, text: "world", startIndex: 6, endIndex: 11, spans: [] },
    ],
  });

  assert.deepEqual(client.requests[0], {
    method: "nvim_buf_set_lines",
    args: [3, 0, -1, false, ["hello", "world"]],
  });
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

async function testSetCursorUsesLuaBridge() {
  const client = new FakeClient();
  const session = new EmbeddedNvimSession(client);

  await session.setCursor(1000, 4, 7);

  assert.equal(client.requests[0].method, "nvim_exec_lua");
  assert.deepEqual(client.requests[0].args[1], [1000, 4, 7]);
  assert.equal(client.requests[1].method, "nvim_exec_lua");
}

await testInputDoesNotRefreshLayoutSnapshot();
await testCommandsStillRefreshLayoutSnapshot();
await testUpdateWebMirrorWritesBufferAndEmitsState();
await testWebScrollNotificationIsForwarded();
await testSetCursorUsesLuaBridge();

console.log("rpc-session tests passed");
