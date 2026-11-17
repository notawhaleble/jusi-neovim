import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { NativeChildOwner } from '../../dist/electron/native-child-owner.js';
class Document extends EventEmitter {
  constructor(session) { super(); this.session = session; this.dead = false; }
  isDestroyed() { return this.dead; }
  close() { if (!this.dead) { this.dead = true; this.emit('destroyed'); } }
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function setup(timeout = 1000) {
  const source = { bufferId: 1, sessionId: 'source', incarnation: 1, providerId: 'web' };
  const state = new Map([[1, source]]), events = new EventEmitter();
  let allocate, resolve, reject;
  const canceled = [], errors = [];
  const client = { request(method, [code, [request]]) {
    if (code.includes('.connect')) return Promise.resolve(true);
    if (code.includes('.cancel')) { canceled.push(request); return Promise.resolve(true); }
    allocate = request;
    return new Promise((yes, no) => { resolve = yes; reject = no; });
  } };
  const session = { getWebSession: id => state.get(id),
    onStateChanged: fn => { events.on('state', fn); return () => events.off('state', fn); },
    onExit: fn => { events.on('exit', fn); return () => events.off('exit', fn); } };
  const owner = new NativeChildOwner(client, session, e => errors.push(e), timeout);
  await owner.start();
  const opener = new Document({}), child = new Document(opener.session);
  const result = owner.reserve(source, opener, child, 'https://fixture.test');
  result.catch(() => {});
  const reply = () => ({ bufferId: 2, incarnation: 2, token: allocate.token });
  const publish = () => { state.set(2, { ...reply(), sessionId: 'child', nativeChild: allocate.token }); events.emit('state'); };
  return { owner, opener, child, result, state, events, canceled, errors, publish, reply,
    resolve: () => resolve(reply()), reject: () => reject(new Error('RPC failed')) };
}
{
  const f = await setup(); f.resolve(); await tick();
  let bound = false; f.result.then(() => { bound = true; }); await tick(); assert.equal(bound, false);
  f.publish(); const result = await f.result;
  assert.equal(result.sessionId, 'child'); assert.equal(result.document, f.child);
  f.state.delete(2); f.events.emit('state');
  assert.equal(f.child.isDestroyed(), true); assert.equal(f.owner.size, 0);
  f.owner.dispose(); assert.equal(f.events.listenerCount('state'), 0);
}
{
  const f = await setup(); f.publish(); f.resolve(); await f.result;
  f.child.close(); await tick(); assert.equal(f.canceled.length, 1); assert.equal(f.owner.size, 0); f.owner.dispose();
}
{
  const f = await setup(10); await assert.rejects(f.result, /timed out/);
  assert.equal(f.child.isDestroyed(), true); f.resolve(); await tick();
  assert.equal(f.owner.size, 0); assert.equal(f.canceled.length, 2); f.owner.dispose();
}
for (const change of ['navigation', 'crash', 'source-close', 'replacement', 'exit', 'rpc-failure', 'child-crash']) {
  const f = await setup();
  if (change === 'navigation') f.opener.emit('did-start-navigation', {}, 'https://other.test', false, true);
  if (change === 'crash') f.opener.emit('render-process-gone');
  if (change === 'source-close') f.opener.close();
  if (change === 'replacement') { f.state.set(1, { bufferId: 1, sessionId: 'replacement', incarnation: 2 }); f.events.emit('state'); }
  if (change === 'exit') f.events.emit('exit');
  if (change === 'rpc-failure') f.reject();
  if (change === 'child-crash') f.child.emit('render-process-gone');
  await assert.rejects(f.result); assert.equal(f.child.isDestroyed(), true);
  f.resolve(); await tick(); assert.equal(f.owner.size, 0); assert.equal(f.errors.length, 0); f.owner.dispose();
}
{
  const f = await setup();
  const extra = new Document(f.opener.session);
  await assert.rejects(f.owner.reserve(f.state.get(1), f.opener, extra, 'https://fixture.test'), /capacity/);
  assert.equal(extra.isDestroyed(), true); f.publish(); f.resolve(); await f.result;
  f.state.set(2, { ...f.state.get(2), sessionId: 'replacement', incarnation: 3 }); f.events.emit('state');
  assert.equal(f.child.isDestroyed(), true); f.owner.dispose();
}
console.log('native child ownership lifecycle tests passed');
