import assert from 'node:assert/strict';
import { BrowserModeKeys } from '../../dist/backends/web/mode-keys.js';
const key = (code, extra={}) => ({type:'keyDown',code,control:true,...extra});
const keys = new BrowserModeKeys();
const prefix = () => assert.equal(keys.accept(key('Backslash'),100), 'prefix');
prefix();
assert.equal(keys.accept(key('ControlLeft',{key:'Control'}),101),undefined);
assert.equal(keys.accept(key('Backslash',{type:'keyUp'}),102),undefined);
assert.equal(keys.accept(key('KeyN'),103),'text');
assert.equal(keys.accept(key('KeyN'),104),undefined);
prefix(); assert.equal(keys.accept(key('KeyN'),1300),undefined,'deadline is exclusive');
for (const interruption of [key('KeyX',{control:false}),key('KeyN',{alt:true}),key('KeyN',{meta:true}),key('KeyQ',{isComposing:true})]) {
 prefix(); assert.equal(keys.accept(interruption,101),undefined);
 assert.equal(keys.accept(key('KeyN'),102),undefined,'interruption cancels prefix');
}
prefix(); keys.reset(); assert.equal(keys.accept(key('KeyN'),102),undefined,'focus/navigation reset');
assert.equal(keys.accept(key('KeyQ'),103),'close');
console.log('Shared browser mode chord expiry, cancellation and composition guards passed');
