import assert from 'node:assert/strict';
import vm from 'node:vm';
import {installBrowserClicks,takeBrowserClick} from '../../dist/backends/web/link-clicks.js';
const listeners=new Map();
class Element {
  constructor(href,download=false){this.href=href;this.download=download;}
  matches(){return true;}
  hasAttribute(){return this.download;}
}
let now=Date.now();
const world=vm.createContext({Element,URL,Date:{now:()=>now},Promise,setTimeout,clearTimeout,
  addEventListener:(name,listener)=>listeners.set(name,listener)});
vm.runInContext(installBrowserClicks,world);
const take=(x=10,since=now-100)=>vm.runInContext(takeBrowserClick(x,20,'left',since),world);
const click=(fields={})=>{
  const e={isTrusted:true,button:0,ctrlKey:false,metaKey:false,shiftKey:false,clientX:10,clientY:20,
    composedPath:()=>[new Element('https://example.com/')],preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...fields};
  listeners.get('mousedown')(e);now+=fields.holdMs??0;listeners.get('mouseup')(e);listeners.get(e.button===1?'auxclick':'click')(e);return e;
};
let pending=take();let e=click();let result=await pending;
assert.equal(result.url,null);assert(!e.prevented,'ordinary link remains with Chromium');
pending=take();e=click({ctrlKey:true});result=await pending;
assert.equal(result.url,'https://example.com/');assert(e.prevented&&e.stopped);
assert.equal(await take(),null,'a result is consumed once');
for(const fields of [{ctrlKey:true,composedPath:()=>[]},{metaKey:true,composedPath:()=>[new Element('https://example.com/',true)]},{shiftKey:true,composedPath:()=>[new Element('javascript:alert(1)')]}]) {
  pending=take();e=click(fields);assert.equal((await pending).url,null);assert(!e.prevented);
}
pending=take();e=click({isTrusted:false,metaKey:true});assert.equal(await pending,null);assert(!e.prevented,'synthetic page click cannot authorize a tab');
e=click({metaKey:true});assert.equal((await take()).url,'https://example.com/','event before pull is supported');
e=click({metaKey:true});assert.equal(await take(10,now+1000),null,'old click cannot satisfy a new native press');
assert.equal(await take(99),null,'coordinates must match');
e=click({shiftKey:true,holdMs:1500});assert.equal((await take()).url,'https://example.com/','holding the mouse does not expire a deliberate modified press');
pending=take();listeners.get('blur')();assert.equal(await pending,null,'blur cancels pending collection');
console.log('Trusted click current modifiers, non-links, download/protocol, forgery, consume-once and ordering tests passed');
