import assert from "node:assert/strict";
import { WebRendererSurface } from "../../dist/backends/web/renderer-surface.js";

class Guest extends EventTarget {
  dataset = {}; style = {}; parentElement = null; focuses = 0; reloads = 0; removals = 0;
  executeJavaScript = async () => ({ lines: [], totalTextLength: 0 });
  setAttribute() {}
  focus() { this.focuses++; }
  reload() { this.reloads++; }
  remove() { this.removals++; this.parentElement = null; }
  getWebContentsId() { return 42; }
  emit(name, fields = {}) { this.dispatchEvent(Object.assign(new Event(name), fields)); }
}
const view = { bufferId: 1, sessionId: "test-session", surface: { backend: "web", uri: "https://example.com/" } };
function fixture() {
  const guest = new Guest();
  const counts = {};
  const events = Object.fromEntries(["invalidated", "ready", "crashed", "loaded", "focused", "pointer", "scrolled", "pointerVisible"].map(name => [name, () => counts[name] = (counts[name] ?? 0) + 1]));
  const surface = new WebRendererSurface(view, events, () => guest);
  return { guest, surface, counts };
}
{
  const { guest, surface, counts } = fixture();
  const parent = { appendChild(child) { child.parentElement = this; } };
  surface.attach(parent); surface.focus(); surface.detach(); surface.focus();
  assert.equal(guest.focuses, 1);
  assert.equal(guest.parentElement, parent, "parking retains the guest");
  surface.attach(parent); surface.focus();
  assert.equal(guest.focuses, 2);
  surface.resize(640, 480);
  assert.deepEqual(guest.style, { width: "640px", height: "480px" });
  assert.throws(() => surface.resize(NaN, 1), /Invalid/);
  assert.equal(surface.documentHandle(), 42);
  assert.equal(surface.update(view), false);
  assert.equal(surface.matches({ ...view, sessionId: "replacement" }), false);
  assert.equal(surface.matches({ ...view, profile: "other" }), false);
  assert.throws(() => surface.update({ ...view, sessionId: "replacement" }), /identity/);
  await assert.rejects(surface.extract(new AbortController().signal), /not ready/);
  guest.emit("focus");
  assert.equal(counts.focused, 1);
  guest.emit("dom-ready");
  guest.emit("did-start-navigation", { isMainFrame: false });
  guest.emit("did-start-navigation", { isInPlace: true });
  assert.equal(surface.ready, true);
  assert.equal(surface.update({ ...view, surface: { ...view.surface, uri: "https://example.com/next" } }), true);
  assert.equal(surface.ready, false);
  guest.emit("dom-ready"); surface.reload();
  assert.equal(guest.reloads, 1); assert.equal(surface.ready, false);
  surface.dispose(); surface.dispose();
  guest.emit("dom-ready"); guest.emit("render-process-gone");
  assert.equal(counts.ready, 2); assert.equal(counts.crashed, undefined);
  assert.equal(guest.removals, 1); assert.equal(surface.ready, false);
  assert.throws(() => surface.attach(parent), /disposed/);
}
for (const cause of ["navigation", "crash", "dispose", "abort"]) {
  const { guest, surface } = fixture();
  guest.emit("dom-ready");
  let complete;
  guest.executeJavaScript = () => new Promise(resolve => { complete = resolve; });
  const controller = new AbortController();
  const pending = surface.extract(controller.signal);
  if (cause === "navigation") guest.emit("did-start-navigation", { isMainFrame: true });
  if (cause === "crash") { guest.emit("render-process-gone"); assert.equal(surface.crashed, true); }
  if (cause === "dispose") surface.dispose();
  if (cause === "abort") controller.abort();
  complete({ lines: [], totalTextLength: 0 });
  await assert.rejects(pending, /Document changed/);
  if (cause !== "dispose") {
    guest.emit("dom-ready");
    guest.executeJavaScript = async () => 7;
    assert.equal(await surface.project(0, true), 7);
    assert.equal(surface.crashed, false);
    surface.dispose();
  }
}
console.log("renderer surface lifecycle tests passed");
// DOM updates cancel in-flight operations; worker/off views install no polling.
{
 const guest=new Guest();let revision=0,changes=0,complete,polls=0;
 guest.executeJavaScript=code=>code.includes('__jusiDocumentChanges') ? (polls++,Promise.resolve(revision)) : new Promise(resolve=>{complete=resolve;});
 const events={ready(){},invalidated(){},crashed(){},loaded(){},focused(){},pointer(){},scrolled(){},pointerVisible(){},async textChanged(){changes++;}};
 const surface=new WebRendererSurface(view,events,()=>guest);
 guest.emit('dom-ready');await new Promise(r=>setTimeout(r,0));
 const pending=surface.extract(new AbortController().signal);
 revision=1;await new Promise(r=>setTimeout(r,350));
 assert.equal(changes,1);complete({lines:[]});await assert.rejects(pending,/Document changed/);
 surface.dispose();const stopped=polls;await new Promise(r=>setTimeout(r,350));assert.equal(polls,stopped);
 for(const policy of [{textLayer:'off'},{textSource:'worker'}]){
  const inactive=new WebRendererSurface({...view,...policy},events,()=>guest);guest.emit('dom-ready');
  await new Promise(r=>setTimeout(r,0));assert.equal(polls,stopped);inactive.dispose();
 }
}
