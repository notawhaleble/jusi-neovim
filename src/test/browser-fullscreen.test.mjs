import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {toggleFullscreen} from '../../dist/electron/browser-window-input.js';
import {BrowserFullscreen,allowBrowserFullscreen as checkFullscreen} from '../../dist/electron/browser-fullscreen.js';
const allowBrowserFullscreen = contents => checkFullscreen(contents, true);
const host=Object.assign(new EventEmitter(),{focused:true,full:false,destroyed:false,webContents:new EventEmitter(),
  isFocused(){return this.focused;},isFullScreen(){return this.full;},isDestroyed(){return this.destroyed;},
  setFullScreen(value){if (value===this.full) return;this.full=value;this.emit(value?'enter-full-screen':'leave-full-screen');}});
const guest=()=>Object.assign(new EventEmitter(),{focused:true,destroyed:false,exits:0,
  isFocused(){return this.focused;},isDestroyed(){return this.destroyed;},
  async executeJavaScript(){this.exits++;}});
let owner='session/window/grid',changed=0;
const a=guest(),b=guest(),fullscreen=new BrowserFullscreen(host,()=>changed++);
const remove=fullscreen.register(a,()=>owner);
fullscreen.register(b,()=> 'other');
assert.equal(allowBrowserFullscreen(null),false);
assert.equal(allowBrowserFullscreen(guest()),false);
for(const target of [a,host]) { target.focused=false;assert.equal(allowBrowserFullscreen(a),false);target.focused=true; }
const interrupted=guest();
const unregister=fullscreen.register(interrupted,()=> 'closing before entry');
assert(allowBrowserFullscreen(interrupted));
unregister();
assert.equal(fullscreen.exitForWindowShortcut(),false);
assert(allowBrowserFullscreen(b),'an interrupted grant must release the host');
owner=undefined;assert.equal(allowBrowserFullscreen(a),false);owner='first';
assert(allowBrowserFullscreen(a));owner='second';a.emit('enter-html-full-screen');
assert.equal(fullscreen.active,false);assert.equal(a.exits,1);
assert(allowBrowserFullscreen(a));a.emit('enter-html-full-screen');assert(fullscreen.isActive(a));
assert.equal(allowBrowserFullscreen(b),false);
a.emit('did-start-navigation',null,'#hash',true,true);assert(fullscreen.active);
let prevented=0;
a.emit('before-input-event',{preventDefault(){prevented++;}},{type:'keyDown',key:'Escape'});
assert.equal(fullscreen.active,false);
host.webContents.emit('before-input-event',{preventDefault(){prevented++;}},{type:'keyUp',key:'Escape'});
assert.equal(prevented,2,'Escape release must not escape to the embedder during exit');
await new Promise(resolve=>setTimeout(resolve,5));
host.webContents.emit('before-input-event',{preventDefault(){prevented++;}},{type:'keyDown',key:'Escape'});
assert.equal(prevented,2,'ordinary shell Escape must remain available');
assert(allowBrowserFullscreen(a));a.emit('enter-html-full-screen');
owner='different window';fullscreen.sync();assert.equal(fullscreen.active,false);
await new Promise(resolve=>setTimeout(resolve,5));assert.equal(host.full,false);
assert(allowBrowserFullscreen(a));a.emit('enter-html-full-screen');
a.emit('did-start-navigation',null,'https://next',false,true);assert.equal(fullscreen.active,false);
await new Promise(resolve=>setTimeout(resolve,5));
// A page can probe fullscreen permission while the host is still windowed.
assert(checkFullscreen(a));
host.full=true;
assert(allowBrowserFullscreen(a));a.emit('enter-html-full-screen');
a.emit('leave-html-full-screen');
// Chromium can consume Escape down before before-input-event; its release still needs ownership.
host.webContents.emit('before-input-event',{preventDefault(){prevented++;}},{type:'keyUp',key:'Escape'});
assert.equal(prevented,3);
await new Promise(resolve=>setTimeout(resolve,5));
assert.equal(host.full,true,'preserve pre-existing window fullscreen');
// Captured incident: the window shortcut exits the document first, preserving
// a host that was already fullscreen. Repeats cannot then toggle that host.
assert(allowBrowserFullscreen(a));a.emit('enter-html-full-screen');
toggleFullscreen(host);
assert.equal(host.full,true,'window shortcut must not exit pre-existing host fullscreen');
assert.equal(fullscreen.active,false,'window shortcut must exit the document');
toggleFullscreen(host);assert.equal(host.full,true,'a pending document exit must still own the shortcut');
toggleFullscreen(host,true);
await new Promise(resolve=>setTimeout(resolve,5));
toggleFullscreen(host,true);
assert.equal(host.full,true,'held shortcut repeat changed host fullscreen');
toggleFullscreen(host);assert.equal(host.full,false,'a later explicit shortcut still toggles host');
toggleFullscreen(host);assert.equal(host.full,true);

assert(allowBrowserFullscreen(a));a.emit('enter-html-full-screen');
a.emit('render-process-gone');assert.equal(fullscreen.active,false);
await new Promise(resolve=>setTimeout(resolve,5));
assert(allowBrowserFullscreen(a));a.emit('enter-html-full-screen');a.destroyed=true;remove();
assert.equal(fullscreen.active,false);assert.equal(allowBrowserFullscreen(a),false);
// Destruction must restore even if the renderer never answers exitFullscreen.
const c=guest();host.full=false;
let release;
c.executeJavaScript=()=>new Promise(resolve=>{release=resolve;});
const removeC=fullscreen.register(c,()=> 'closing');
assert(allowBrowserFullscreen(c));c.emit('enter-html-full-screen');host.full=true;
fullscreen.exit(c);assert.equal(allowBrowserFullscreen(b),false,'new request raced pending exit');
c.destroyed=true;removeC();await new Promise(resolve=>setTimeout(resolve,5));
assert.equal(host.full,false);
assert(allowBrowserFullscreen(b));b.emit('enter-html-full-screen');host.full=true;
release();await new Promise(resolve=>setTimeout(resolve,5));
assert.equal(host.full,true,'late exit completion changed new fullscreen owner');
fullscreen.dispose();assert.equal(allowBrowserFullscreen(b),false);assert(changed>0);
console.log('Browser fullscreen permission, owner, navigation, crash, close and prior window state passed');
