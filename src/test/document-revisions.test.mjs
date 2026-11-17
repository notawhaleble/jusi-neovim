import assert from "node:assert/strict";
import { DocumentRevisions } from "../../dist/presentation/document-revisions.js";
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const writes = [];
const revisions = new DocumentRevisions(async ticket => { writes.push(`clear:${ticket.revision}`); return true; });
const identity = { bufferId: 1, sessionId: "first-uuid", incarnation: 1 };
const first = await revisions.advance(identity);
assert.equal(first.revision, 1);
const second = await revisions.advance(identity);
assert.equal(second.revision, 2);
assert.equal(await revisions.commit(first, async () => assert.fail("stale commit reached Neovim")), false);
const pending = deferred();
const started = deferred();
const commit = revisions.commit(second, async () => { started.resolve(); await pending.promise; writes.push("old-write"); return true; });
await started.promise;
const advance = revisions.advance(identity);
assert.equal(revisions.isCurrent(second), false, "revocation is synchronous");
pending.resolve();
assert.equal(await commit, false, "an in-flight write cannot publish after revocation");
const third = await advance;
assert.deepEqual(writes.slice(-2), ["old-write", "clear:3"], "invalidation follows any already-issued RPC write");
assert.equal(await revisions.commit(third, async () => true), true);
revisions.forget(identity.sessionId);
assert.equal(await revisions.commit(third, async () => assert.fail()), false);
const replacement = await revisions.advance({ ...identity, sessionId: "replacement-uuid", incarnation: 2 });
assert.equal(await revisions.commit(third, async () => assert.fail()), false, "buffer ID reuse does not reuse a lease");
assert.equal(replacement.revision, 1);
const failed = new DocumentRevisions(async () => false);
assert.equal(await failed.advance(identity), null);
assert.equal(await failed.current(identity.sessionId), null);
console.log("document revision tests passed");

const { EventEmitter } = await import("node:events");
const { shutdownProcess } = await import("../../dist/bridge/process-shutdown.js");
class Child extends EventEmitter {
  signals = [];
  kill(signal) { this.signals.push(signal); if (signal === "SIGKILL") this.emit("exit"); }
}
const normal = new Child();
await shutdownProcess(normal, () => setTimeout(() => normal.emit("exit"), 1), 10);
assert.deepEqual(normal.signals, []);
const stuck = new Child();
await shutdownProcess(stuck, () => {}, 5);
assert.deepEqual(stuck.signals, ["SIGTERM", "SIGKILL"]);
assert.equal(stuck.listenerCount("exit"), 0);
console.log("bounded shutdown tests passed");
