import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {BrowserLinkModifiers,resetBrowserInputOnFocusBoundary} from '../../dist/electron/browser-input-boundary.js';
const host=new EventEmitter(), otherHost=new EventEmitter();
const guests=Array.from({length:20},()=>new EventEmitter());
const counts=guests.map(()=>0);
const disposals=guests.map((guest,index)=>resetBrowserInputOnFocusBoundary(guest,host,()=>counts[index]++));
let otherCount=0;
const otherDispose=resetBrowserInputOnFocusBoundary(new EventEmitter(),otherHost,()=>otherCount++);
assert.equal(host.listenerCount('blur'),1);
assert.equal(host.listenerCount('focus'),1);
for(const event of ['enter-full-screen','leave-full-screen']) {
  assert.equal(host.listenerCount(event),1);host.emit(event);
}
assert(counts.every(n=>n===2));counts.fill(0);
host.emit('blur');host.emit('focus');assert(counts.every(n=>n===2));assert.equal(otherCount,0);
guests[0].emit('blur');assert.equal(counts[0],3);assert.equal(counts[1],2);
guests[0].emit('destroyed');assert.equal(counts[0],4);
host.emit('blur');guests[0].emit('blur');assert.equal(counts[0],4);assert.equal(counts[1],3);
for(const dispose of disposals)dispose();
assert.equal(host.listenerCount('blur'),0);assert.equal(host.listenerCount('focus'),0);
for(const event of ['enter-full-screen','leave-full-screen'])assert.equal(host.listenerCount(event),0);
const saved=counts.slice();for(const guest of guests)guest.emit('destroyed');assert.deepEqual(counts,saved);
otherDispose();assert.equal(otherHost.listenerCount('blur'),0);
console.log('browser host/guest input boundary and listener cleanup tests passed');

const modifiers = new BrowserLinkModifiers();
modifiers.accept({type:'keyDown',key:'Meta',meta:true});assert(modifiers.active());
modifiers.accept({type:'keyDown',key:'f',meta:false,control:false,shift:false});
assert.equal(modifiers.active(),false,'fresh keyboard snapshot clears missed release');
modifiers.accept({type:'keyDown',key:'Shift',shift:true});assert(modifiers.active());
assert.equal(modifiers.active([]),false,'explicit mouse snapshot overrides history');
modifiers.reset();assert.equal(modifiers.active(),false);
assert(modifiers.active(['control']));
