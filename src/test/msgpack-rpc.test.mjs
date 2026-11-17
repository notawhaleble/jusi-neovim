import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { decode, encode, ExtData } from "@msgpack/msgpack";
import { MsgpackRpc, nvimExtensionCodec } from "../../dist/bridge/msgpack-rpc.js";
import { EmbeddedNvimRpcClient } from "../../dist/bridge/nvim-client.js";

for (const id of [1, 128, 1000, 65536]) {
  for (const type of [0, 1, 2]) {
    assert.equal(decode(encode(new ExtData(type, encode(id))), { extensionCodec: nvimExtensionCodec }), id);
  }
}
assert.throws(() => decode(encode(new ExtData(1, encode("invalid"))), { extensionCodec: nvimExtensionCodec }));

const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(request = async () => null, timeout = 1000) {
  const reader = new PassThrough(), writer = new PassThrough();
  const sent = [], notifications = [], closed = [];
  writer.on("data", data => sent.push(decode(data)));
  const rpc = new MsgpackRpc(writer, reader, {
    request, notification: value => notifications.push(value), close: error => closed.push(error),
  }, timeout);
  return { rpc, reader, writer, sent, notifications, closed, end() { rpc.close(); reader.end(); writer.end(); } };
}
const f = fixture();
const first = f.rpc.request("first"), second = f.rpc.request("second");
const bytes = Buffer.concat([
  encode([2, "redraw", [["win_pos", [2, new ExtData(1, encode(1000)), 0, 0, 80, 24]], ["grid_line", "世界🙂"]]]),
  encode([1, 1, null, "second"]), encode([1, 0, null, "first"]),
]);
for (let i = 0; i < bytes.length; i += 3) f.reader.write(bytes.subarray(i, i + 3));
assert.deepEqual(await Promise.all([first, second]), ["first", "second"]);
assert.equal(f.notifications[0].args[0][1][1], 1000);
assert.equal(f.notifications[0].args[1][1], "世界🙂");
const rejected = f.rpc.request("failure");
f.reader.write(encode([1, 2, [0, "bad argument"], null]));
await assert.rejects(rejected, /bad argument/);
const pending = f.rpc.request("unfinished");
f.reader.end();
await assert.rejects(pending, /stream ended/);
assert.equal(f.closed.length, 1);
f.end();

let releaseOuter, releaseInner;
const nested = fixture(({ method }) => new Promise(resolve => {
  if (method === "outer") releaseOuter = resolve;
  else releaseInner = resolve;
}));
nested.reader.write(Buffer.concat([encode([0, 7, "outer", []]), encode([0, 8, "inner", []])]));
await tick();
releaseOuter("outer done"); await tick();
assert.equal(nested.sent.length, 0);
releaseInner("inner done"); await tick();
assert.deepEqual(nested.sent, [[1, 8, null, "inner done"], [1, 7, null, "outer done"]]);
nested.end();

let reentrant;
reentrant = fixture(async () => await reentrant.rpc.request("nested-outgoing"));
reentrant.reader.write(encode([0, 10, "callback", []])); await tick();
reentrant.reader.write(encode([1, reentrant.sent[0][1], null, "works"])); await tick();
assert.deepEqual(reentrant.sent[1], [1, 10, null, "works"]);
reentrant.end();

const timed = fixture(undefined, 10);
await assert.rejects(timed.rpc.request("timeout"), /timed out/);
timed.reader.write(encode([1, 0, null, "late"])); await tick();
assert.equal(timed.closed.length, 0);
timed.reader.write(encode([99, "malformed"])); await tick();
assert.equal(timed.closed.length, 1);
await assert.rejects(timed.rpc.request("after-close"), /Invalid/);
timed.end();

const handlerFailure = fixture(async () => { throw new Error("clipboard unavailable"); });
handlerFailure.reader.write(encode([0, 4, "clipboard", []])); await tick();
assert.match(handlerFailure.sent[0][2], /clipboard unavailable/);
handlerFailure.end();

const broken = fixture();
const brokenRequest = broken.rpc.request("waiting");
broken.writer.destroy(new Error("broken pipe"));
await assert.rejects(brokenRequest, /broken pipe/);
broken.end();

const capped = fixture();
const outstanding = Array.from({ length: 1024 }, () => capped.rpc.request("queued"));
const settled = Promise.allSettled(outstanding);
await assert.rejects(capped.rpc.request("overflow"), /request limit/);
capped.end();
assert.ok((await settled).every(item => item.status === "rejected"));

const large = fixture();
await assert.rejects(large.rpc.request("large", ["x".repeat(16 * 1024 * 1024)]), /write limit/);
large.end();

await assert.rejects(EmbeddedNvimRpcClient.spawn({ command: "/nonexistent-jusi-test-nvim" }), /Failed to launch/);
console.log("MessagePack RPC tests passed");
