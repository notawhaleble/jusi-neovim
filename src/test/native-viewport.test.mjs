import assert from 'node:assert/strict';
import { NativeViewportExchange } from '../../dist/electron/native-viewport.js';
let parks = 0;
const exchange = new NativeViewportExchange(() => parks++);
const report = { generation: 1, sequence: 1, x: 10, y: 20, width: 300, height: 200,
 cellWidth: 8, cellHeight: 16, blocked: false };
assert.equal(exchange.accept(report, 1.5, 800, 600), true);
assert.deepEqual(exchange.viewport, { x: 15, y: 30, width: 450, height: 300, cellWidth: 8, cellHeight: 16, zoom: 1.5 });
assert.equal(exchange.accept(report, 1.5, 800, 600), false);
exchange.invalidate(); assert.equal(exchange.viewport, null);
assert.equal(exchange.accept({ ...report, sequence: 20 }, 1, 800, 600), false);
const current = { ...report, generation: 2 };
assert.equal(exchange.accept(current, 1, 800, 600), true);
assert.equal(exchange.accept({ ...current, sequence: 3, width: Infinity }, 1, 800, 600), false);
assert.equal(exchange.viewport, null);
assert.equal(exchange.accept({ ...current, sequence: 2 }, 1, 800, 600), false);
assert.equal(exchange.accept({ ...current, sequence: 4, blocked: true }, 1, 800, 600), true);
assert.equal(exchange.viewport, null);
assert.equal(exchange.accept({ ...current, sequence: 5, width: 900 }, 1, 800, 600), false);
assert.ok(parks >= 5);
console.log('native shell viewport epochs, validation and zoom tests passed');

// Identical measurements do not blur a retained document on text/status frames.
const stableParks = parks;
const valid = {...current, sequence:6};
exchange.accept(valid,1,800,600);
assert.equal(parks, stableParks+1);
exchange.accept({...valid,sequence:7},1,800,600);
assert.equal(parks, stableParks+1);
exchange.accept({...valid,sequence:8,cellWidth:9},1,800,600);
assert.equal(parks, stableParks+2);
exchange.accept({...valid,sequence:9,blocked:true},1,800,600);
assert.equal(parks, stableParks+3);

const {nativeLayoutKey} = await import('../../dist/electron/native-viewport.js');
const state = {snapshot:{currentTabId:1,tabs:[{id:1,currentWindowId:10}],windows:[{id:10,bufferId:2,tabId:1,gridId:3,gridBounds:{row:0,col:0,width:20,height:10}}]},
 screen:{rows:20,cols:80,lines:['old'],options:{}},grids:[{gridId:3,rows:10,cols:20,lines:['old']}],
 cmdline:{visible:false},popupmenu:{visible:false},messages:{historyVisible:false}};
const session = {sessionId:'child',incarnation:1,nativeChild:'token',attachedWindowId:10};
const key = value=>nativeLayoutKey(value,()=>session);
const original = key(state);
const paint = structuredClone(state);
paint.screen.lines=['new'];paint.grids[0].lines=['new'];paint.snapshot.windows[0].cursor={row:2,col:3};
assert.equal(key(paint),original);
for (const mutate of [
 s=>s.snapshot.currentTabId=2, s=>s.snapshot.tabs[0].currentWindowId=11,
 s=>s.snapshot.windows[0].bufferId=4, s=>s.snapshot.windows[0].gridBounds.height=9,
 s=>s.screen.rows=21, s=>s.screen.options.guifont='new', s=>s.grids[0].cols=21,
 s=>s.cmdline.visible=true, s=>s.popupmenu.visible=true, s=>s.messages.historyVisible=true,
 s=>s.snapshot.windows.push({id:11,tabId:1,bufferId:5}),
]) {const changed=structuredClone(state);mutate(changed);assert.notEqual(key(changed),original);}
session.incarnation++;
assert.notEqual(key(state),original);
console.log('native stable paint and structural/identity/overlay invalidation passed');
