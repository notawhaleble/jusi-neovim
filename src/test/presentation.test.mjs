import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TextLayerJob } from "../../dist/presentation/text-layer.js";
import { validateMirror } from "../../dist/presentation/text-document.js";
import { browserPartition, isGuestNavigationAllowed, isPathWithinRoot, localRootForUrl, isTrustedShellSender } from "../../dist/electron/browser-policy.js";

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const states = [];
const job = new TextLayerJob(state => states.push(state));
const old = deferred();
const published = [];
const first = job.run(() => old.promise, async value => { published.push(value); });
assert.equal(job.status, "building");
job.invalidate();
await job.run(async () => "new", async value => { published.push(value); });
old.resolve("old");
await first;
assert.deepEqual(published, ["new"]);
assert.equal(job.status, "ready");
job.invalidate(false);
await job.run(async () => { throw new Error("must not build"); }, async () => assert.fail());
assert.equal(job.status, "disabled");
job.invalidate();
await job.run(async () => { throw new Error("broken provider"); }, async () => assert.fail());
assert.equal(job.status, "error");
await job.run(async () => "recovered", async () => {});
assert.equal(job.status, "ready");
const slow = deferred();
const run = job.run(() => slow.promise, async () => {});
await job.run(async () => assert.fail("overlapping job"), async () => {});
slow.resolve("done"); await run;

assert.equal(browserPartition("https://example.com", 1), browserPartition("https://example.com", 99));
assert.notEqual(browserPartition("https://example.com", 1, "work"), browserPartition("https://example.com", 1, "personal"));
assert.throws(() => browserPartition("https://example.com", 1, "../private"));
for (const url of ["file:///etc/passwd", "jusi-directory://open/?path=/etc/passwd", "javascript:alert(1)", "data:text/html,hi", "devtools://devtools/"]) {
  assert.equal(isGuestNavigationAllowed(url, false), false, url);
}
assert.equal(isGuestNavigationAllowed("https://example.com", false), true);
assert.equal(isGuestNavigationAllowed("https://example.com", true), false);
assert.equal(isGuestNavigationAllowed("about:blank", false), true);
const shell = { mainFrame: {} };
assert.equal(isTrustedShellSender({ sender: shell, senderFrame: shell.mainFrame }, shell), true);
assert.equal(isTrustedShellSender({ sender: shell, senderFrame: {} }, shell), false);
assert.equal(isTrustedShellSender({ sender: {}, senderFrame: shell.mainFrame }, shell), false);

const root = mkdtempSync(join(tmpdir(), "jusi-policy-"));
try {
  mkdirSync(join(root, "allowed"));
  writeFileSync(join(root, "allowed", "doc.html"), "hello");
  writeFileSync(join(root, "secret"), "private");
  symlinkSync(join(root, "secret"), join(root, "allowed", "escape"));
  const url = new URL("jusi-directory://open/");
  url.searchParams.set("path", join(root, "allowed", "doc.html"));
  const allowed = localRootForUrl(url.href);
  assert.equal(isPathWithinRoot(join(root, "allowed", "doc.html"), allowed), true);
  assert.equal(isPathWithinRoot(join(root, "allowed", "..", "secret"), allowed), false);
  assert.equal(isPathWithinRoot(join(root, "allowed", "escape"), allowed), false);
} finally { rmSync(root, { recursive: true, force: true }); }

validateMirror({ version: 1, totalTextLength: 5, lines: [{ lineNumber: 0, text: "hello", startIndex: 0, endIndex: 5, spans: [] }] });
for (const value of [null, {}, { version: 1, totalTextLength: 5, lines: [{ text: "bad\nline" }] }]) {
  assert.throws(() => validateMirror(value));
}
console.log("presentation tests passed");

const { NvimLayoutController } = await import("../../dist/bridge/layout-controller.js");
const layout = new NvimLayoutController();
layout.applyMetadata({ type: "current-tab", tabId: 1 });
layout.applyMetadata({ type: "buffer", bufferId: 1, kind: "web" });
layout.applyMetadata({ type: "window", windowId: 1000, tabId: 1, bufferId: 1, row: 0, col: 0, width: 80, height: 24 });
layout.applyMetadata({ type: "web-session", bufferId: 1, url: "https://example.com" });
const bounds = { gridId: 2, row: 0, col: 0, width: 80, height: 24, zIndex: 0, compIndex: 0 };
layout.applyGeometry({ type: "grid-bounds", bounds });
assert.equal(layout.getAttachedWebViews()[0].gridBounds, undefined, "Equal geometry must not guess ownership");
layout.applyGeometry({ type: "grid-bounds", windowId: 1000, bounds });
assert.equal(layout.getAttachedWebViews()[0].gridBounds.gridId, 2);
layout.applyGeometry({ type: "grid-close", gridId: 2 });
assert.equal(layout.getAttachedWebViews()[0].gridBounds, undefined);

assert.notEqual(browserPartition("https://example.com", 1, "work", "abc", true), browserPartition("https://example.com", 1, "work", "def", true));
assert.equal(browserPartition("https://example.com", 1, "work", "abc", true), "jusi-private-abc");
assert.equal(browserPartition("jusi-directory://open/", 1, "work", "abc", true), "jusi-local-abc");
assert.throws(() => browserPartition("https://example.com", 1, "work", undefined, true));
