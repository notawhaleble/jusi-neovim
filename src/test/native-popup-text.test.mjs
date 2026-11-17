import assert from 'node:assert/strict';
import { nativeBrowserDocument } from '../../dist/electron/native-browser-document.js';
const tick = () => new Promise(r => setTimeout(r, 0));
function setup(enabled = true, timeout = 1000) {
  const binding = {bufferId: 3, sessionId:'child', incarnation:1};
  let current = {...binding};
  let resolve, reads = 0, writes = 0, publications = 0;
  const session = { setBrowserTextStatus:async()=>{}, getWebSession: () => current, invalidateWebDocument: async () => true,
    writeWebMirror: async () => { writes++; return true; }, publishWebMirror: () => publications++ };
  const contents = { isDestroyed: () => false, executeJavaScript: code => {
    reads++;
    if (code.startsWith('(async')) return new Promise(r => { resolve = r; });
    return Promise.resolve(0);
  } };
  const job = nativeBrowserDocument(binding, contents, session, enabled, () => {}, timeout);
  return { job, replace: () => { current = {...binding, incarnation:2}; }, finish: () => resolve?.({}), counts: () => ({reads,writes,publications}) };
}
{
  const f = setup(false); f.job.loaded(); await tick();
  assert.equal(f.job.status,'disabled'); assert.equal(f.counts().reads,0); f.job.dispose();
}
for (const reason of ['navigation','close','replacement']) {
  const f = setup(); f.job.loaded(); await tick(); assert.equal(f.job.status,'building');
  if (reason === 'navigation') f.job.invalidate();
  if (reason === 'close') f.job.dispose();
  if (reason === 'replacement') f.replace();
  f.finish(); await tick(); assert.equal(f.counts().writes,0); assert.equal(f.counts().publications,0);
  f.job.dispose();
}
{
  const f = setup(true, 10); f.job.loaded(); await new Promise(r => setTimeout(r,30));
  assert.equal(f.job.status,'error'); f.finish(); await tick();
  assert.equal(f.counts().publications,0); f.job.dispose();
}
console.log('native popup text cancellation/off/timeout tests passed');
