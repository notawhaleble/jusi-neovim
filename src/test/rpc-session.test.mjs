import assert from "node:assert/strict";

import { EmbeddedNvimSession } from "../../dist/bridge/rpc-session.js";

class FakeClient {
  requests = [];

  onNotification() {}

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

await testInputDoesNotRefreshLayoutSnapshot();
await testCommandsStillRefreshLayoutSnapshot();

console.log("rpc-session tests passed");
