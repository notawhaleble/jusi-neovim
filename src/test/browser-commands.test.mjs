import assert from 'node:assert/strict';
import {browserCommandForInput as command,dispatchBrowserCommand as dispatch} from '../../dist/backends/web/browser-commands.js';
const key=(code,extra={})=>({type:'keyDown',code,control:true,...extra});
for(const [code,expected] of [['KeyP','toggle-pause'],['KeyR','reload'],['KeyL','copy-url'],['KeyO','back'],['KeyI','forward'],['Equal','zoom-in'],['Minus','zoom-out'],['Digit0','zoom-reset']]) {
 assert.equal(command(key(code)),expected);
 for(const extra of [{isComposing:true},{alt:true},{type:'keyUp'},{control:false}]) assert.equal(command(key(code,extra)),undefined);
}
assert.equal(command(key('KeyR',{control:false,meta:true})),'reload');
assert.equal(command(key('Tab',{key:'Tab'})),'forward');
assert.equal(command(key('KeyO',{meta:true})),undefined);
for(const adapter of ['webview','native']) {
 let zoom=1,reloads=0,back=0,forward=0,projections=0,canBack=false,dead=false;
 const port={isDestroyed:()=>dead,reload:()=>reloads++,getZoomFactor:()=>zoom,setZoomFactor:v=>zoom=v,
 navigationHistory:{canGoBack:()=>canBack,canGoForward:()=>true,goBack:()=>back++,goForward:()=>forward++}};
 const run=c=>dispatch(port,c,()=>projections++);
 assert.equal(run('back'),true);assert.equal(back,0);canBack=true;run('back');run('forward');run('reload');
 assert.deepEqual([back,forward,reloads],[1,1,1]);
 run('zoom-in');assert.equal(zoom,1.1);run('zoom-out');assert.equal(zoom,1);zoom=3;run('zoom-in');assert.equal(zoom,3);
 zoom=.3;run('zoom-out');assert.equal(zoom,.3);run('zoom-reset');assert.equal(zoom,1);assert.equal(projections,5);
 for(const c of ['reload','back','forward','zoom-in']) assert.equal(dispatch({isDestroyed:()=>false},c,()=>{}),false,'missing dispatch');
 dead=true;assert.equal(run('reload'),false);dead=false;port.reload=()=>{throw Error('gone')};assert.equal(run('reload'),false);
 console.log(`${adapter} browser command contract passed`);
}

let copied;assert.equal(dispatch({isDestroyed:()=>false,getURL:()=> 'https://example.test/current'},'copy-url',()=>{},url=>{copied=url}),true);assert.equal(copied,'https://example.test/current');
assert.equal(dispatch({isDestroyed:()=>false},'copy-url',()=>{},()=>{}),false);

assert.equal(command(key('F12',{control:false})),'devtools');
for (const extra of [{control:true},{meta:true},{alt:true},{isComposing:true},{type:'keyUp'}])
 assert.equal(command(key('F12',{control:false,...extra})),undefined);
let opened=false;
const tools={isDestroyed:()=>false,isDevToolsOpened:()=>opened,
 openDevTools:options=>{assert.deepEqual(options,{mode:'detach'});opened=true;},closeDevTools:()=>{opened=false;}};
assert.equal(dispatch(tools,'devtools',()=>{}),true);assert.equal(opened,true);
assert.equal(dispatch(tools,'devtools',()=>{}),true);assert.equal(opened,false);
assert.equal(dispatch({isDestroyed:()=>false},'devtools',()=>{}),false);
tools.openDevTools=()=>{throw Error('unavailable')};assert.equal(dispatch(tools,'devtools',()=>{}),false);

assert.equal(command(key('KeyP',{shift:true})),undefined);
assert.equal(dispatch({isDestroyed:()=>false},'toggle-pause',()=>{}),false);

for (const platform of ['darwin','linux']) {
 const modifiers=platform==='darwin'?{meta:true,control:false}:{control:true,meta:false};
 for (const [code,action] of [['KeyC','copy'],['KeyX','cut'],['KeyV','paste']]) {
  const input=key(code,modifiers);
  assert.equal(command(input,platform),action);
  for (const extra of [{type:'keyUp'},{isComposing:true},{alt:true},{control:true,meta:true},{control:false,meta:false}])
   assert.equal(command({...input,...extra},platform),undefined);
  let called=0;
  const port={isDestroyed:()=>false,[action](){assert.equal(this,port);called++;}};
  assert.equal(dispatch(port,action,()=>{}),true);assert.equal(called,1);
  assert.equal(dispatch({isDestroyed:()=>false},action,()=>{}),false);
  assert.equal(dispatch({...port,isDestroyed:()=>true},action,()=>{}),false);
  assert.equal(dispatch({...port,[action](){throw Error('closed');}},action,()=>{}),false);
 }
 assert.equal(command(key('KeyV',{...modifiers,shift:true}),platform),'pasteAndMatchStyle');
 assert.equal(command(key('KeyC',{...modifiers,shift:true}),platform),undefined);
 assert.equal(command(key('KeyX',{...modifiers,shift:true}),platform),undefined);
}
assert.equal(dispatch({isDestroyed:()=>false},'pasteAndMatchStyle',()=>{}),false);
