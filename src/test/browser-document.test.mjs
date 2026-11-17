import * as scripts from '../../dist/backends/web/document-scripts.js';
import { BrowserRegionNavigator, browserInteraction } from '../../dist/backends/web/interaction.js';
import assert from 'node:assert/strict';
import { WebRendererSurface } from '../../dist/backends/web/renderer-surface.js';
import { nativeBrowserDocument } from '../../dist/electron/native-browser-document.js';
const waitFor = async fn => { for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('conformance timeout'); };
const mirror = text => ({version:1,totalTextLength:text.length,lines:[{lineNumber:0,text,startIndex:0,endIndex:text.length,spans:[]}]});
class Guest extends EventTarget {
 dataset={}; style={}; parentElement=null;
 setAttribute(){} remove(){} focus(){} getWebContentsId(){return 42;}
}
for (const kind of ['webview','native']) {
 let revision=0, ticketRevision=0, output, limited=false, broken=false, publications=0;
 const statuses=[], operations=[], gestures=[];
 let hitResult=2, navigated;
 const guest=new Guest();
 guest.loadURL=async url=>{navigated=url;};
 guest.executeJavaScript=async (code,userGesture)=>{
  gestures.push(userGesture);
  operations.push(code);
  if(code.includes('rangeFromPoint')) return hitResult;
  if(code.includes('element.closest')) return {href:'https://example.test/link'};
  if(code.includes('const jobId')) return limited ? {limitExceeded:true} : broken ? {lines:'malformed'} : mirror(`text ${revision}`);
  if(code.includes('__jusiDocumentChanges')) return revision;
  return {x:1,y:1,width:10,height:10};
 };
 guest.isDestroyed=()=>false;
 const binding={bufferId:1,sessionId:'test',incarnation:1};
 let controller, dispose;
 if(kind==='webview') {
  const view={...binding,surface:{backend:'web',uri:'https://example.test'}};
  const events={ready(){},invalidated(){},crashed(){},loaded(){},pointer(){},scrolled(){},pointerVisible(){},textStatusChanged:s=>statuses.push(s)};
  const surface=new WebRendererSurface(view,events,()=>guest);
  controller=surface.document;
  surface.configureText({invalidate:async()=>{ticketRevision++;},acquire:async()=>({...binding,revision:ticketRevision}),publish:async(_,value)=>{output=value;publications++;return true;}});
  guest.dispatchEvent(new Event('dom-ready')); dispose=()=>surface.dispose();
 } else {
  const session={setBrowserTextStatus:async()=>{},getWebSession:()=>binding,invalidateWebDocument:async()=>true,writeWebMirror:async(_,value)=>{output=value;return true;},publishWebMirror:()=>publications++};
  controller=nativeBrowserDocument(binding,guest,session,true,()=>{});controller.loaded();dispose=()=>controller.dispose();
 }
 await waitFor(()=>controller.status==='ready'); assert.equal(output.lines[0].text,'text 0');
 revision++;await waitFor(()=>output.lines[0].text==='text 1');
 controller.setAutoRefresh(false); const retained=output;
 revision++;await waitFor(()=>controller.status==='idle');
 assert.equal(output,retained,'pause retains the published readable mirror');
 await controller.rebuild(); assert.equal(output.lines[0].text,'text 2','explicit refresh works while paused');
 revision++;await waitFor(()=>controller.status==='idle');controller.setAutoRefresh(true);
 await waitFor(()=>output.lines[0].text==='text 3');
 await controller.projectCursor(output,{row:0,col:2});
 const projected=operations.length;
 await controller.projectCursor(output,{row:0,col:2});assert.equal(operations.length,projected,'shared projection deduplicates');
 // A -> B -> A while B's renderer acknowledgement is still pending. Observing
 // B's painted caret does not mean the executeJavaScript promise has settled.
 const execute=guest.executeJavaScript;
 await controller.projectCursor(output,{row:0,col:1});
 let release;
 guest.executeJavaScript=(code,...args)=>{
   const result=execute(code,...args);
   return code===scripts.mirrorProjectionSource(2,true)
     ? new Promise(resolve=>{release=()=>resolve(result);}) : result;
 };
 const pendingProjection=controller.projectCursor(output,{row:0,col:2});
 await controller.projectCursor(output,{row:0,col:1});
 assert.equal(operations.at(-1),scripts.mirrorProjectionSource(1,true),`${kind}: latest A must not be skipped while B is pending`);
 release();await pendingProjection;
 const settled=operations.length;
 await controller.projectCursor(output,{row:0,col:1});
 assert.equal(operations.length,settled,'late B completion cannot replace A cache');
 guest.executeJavaScript=execute;
 await controller.projectSelection(output,{start:{row:0,col:0},end:{row:0,col:3}});
 const unicode=mirror('A😀e\u0301文 אב');unicode.version=100;
 await controller.projectCursor(unicode,{row:0,col:4});
 assert.equal(operations.at(-1),scripts.mirrorProjectionSource(5,true));
 await controller.projectSelection(unicode,{start:{row:0,col:1},end:{row:0,col:1}});
 assert.equal(operations.at(-1),scripts.mirrorSelectionProjectionSource(1,3));
 await controller.projectSelection(unicode,{start:{row:0,col:2},end:{row:0,col:2}});
 assert.equal(operations.at(-1),scripts.mirrorSelectionProjectionSource(3,5));
 await controller.projectSelection(unicode,{start:{row:0,col:0},end:{row:0,col:7},spans:[
  {row:0,startCol:1,endCol:2},{row:0,startCol:4,endCol:5}]});
 assert.equal(operations.at(-1),scripts.mirrorSelectionRangesSource([{from:1,to:3},{from:5,to:6}]));
 await controller.projectSelection(unicode,{start:{row:0,col:0},end:{row:0,col:7},spans:[]});
 assert.equal(operations.at(-1),scripts.mirrorSelectionRangesSource([]));
 const beforeLimit=publications;
 limited=true; await controller.rebuild(); assert.equal(controller.status,'limited');
 assert.equal(publications,beforeLimit,'cap must not publish partial text');
 limited=false; await controller.rebuild(); assert.equal(controller.status,'ready');
 broken=true; await controller.rebuild(); assert.equal(controller.status,'error');
 broken=false; await controller.rebuild(); assert.equal(controller.status,'ready');
 const target={...binding,windowId:10};
 let visible=true, state={...target,mirror:output,cursor:{row:0,col:2}};
 const port={read:()=>visible?state:undefined,scroll:(...args)=>controller.scroll(...args),
  region:(index,direction)=>controller.region(index,direction),
  activateLink:index=>controller.activateLink(index),hitTest:(x,y)=>controller.hitTest(x,y),
  projectCursor:(...args)=>controller.projectCursor(...args),rebuildText:()=>controller.rebuild()};
 await browserInteraction(port,target,{kind:'link'});assert.equal(operations.at(-1),scripts.mirrorActivateLinkSource(2));
 const region=port.region; port.region=async()=>2;
 assert.deepEqual(await browserInteraction(port,target,{kind:'region',direction:1}),{row:0,col:2});
 assert.equal(await browserInteraction(port,target,{kind:'region',direction:0}),null);
 let finishRegion; port.region=()=>new Promise(resolve=>{finishRegion=resolve;});
 const pendingRegion=browserInteraction(port,target,{kind:'region',direction:-1});
 visible=false;finishRegion(2);assert.equal(await pendingRegion,null);visible=true;port.region=region;
 let linkIndex;
 const activate = port.activateLink;port.activateLink=async index=>{linkIndex=index;};
 await browserInteraction(port,{...target,cursor:{row:0,col:4},documentRevision:output.version},{kind:'link'});
 assert.equal(linkIndex,4,'command uses authoritative cursor before rendered snapshot catches up');
 linkIndex=undefined;
 await browserInteraction(port,{...target,documentRevision:output.version+1},{kind:'link'});
 assert.equal(linkIndex,undefined,'command rejects a different mirror revision');
 port.activateLink=activate;
 await controller.activateLink(0);assert.equal(gestures.at(-1),true,'explicit activation carries a browser user gesture');
 await browserInteraction(port,target,{kind:'scroll',lines:2});
 assert.deepEqual(await browserInteraction(port,target,{kind:'hit',x:5,y:5}),{row:0,col:2});
 for(const bad of [-1,0.5,999,NaN,{},'2']) { hitResult=bad;assert.equal(await browserInteraction(port,target,{kind:'hit',x:5,y:5}),null); }
 const navigator=new BrowserRegionNavigator();
 const regionInputs=[];
 port.region=async(index,direction)=>{regionInputs.push(index);return index+direction;};
 const queuedTarget={...target,documentRevision:state.mirror.version};
 const commit=async position=>{await new Promise(r=>setTimeout(r,10));state={...state,cursor:position};};
 await Promise.all([navigator.navigate(port,queuedTarget,1,async()=>state,commit),navigator.navigate(port,queuedTarget,-1,async()=>state,commit)]);
 assert.deepEqual(regionInputs,[2,3],'rapid region keys read Neovim after preceding commit');
 assert.deepEqual(state.cursor,{row:0,col:2});port.region=region;
 const before=operations.length;
 visible=false;await browserInteraction(port,target,{kind:'link'});visible=true;
 await browserInteraction(port,{...target,windowId:11},{kind:'link'});
 await browserInteraction(port,{...target,sessionId:'replaced'},{kind:'scroll',lines:2});
 await browserInteraction(port,{...target,incarnation:2},{kind:'retry'});
 assert.equal(operations.length,before,'invalid ownership never executes');
 let resolveHit;
 port.hitTest=()=>new Promise(resolve=>{resolveHit=resolve;});
 const pending=browserInteraction(port,target,{kind:'hit',x:5,y:5});
 state={...state,mirror:{...state.mirror,version:state.mirror.version+1}};
 resolveHit(2);assert.equal(await pending,null,'late hit cannot move cursor after publication');
 broken=true;await browserInteraction(port,target,{kind:'retry'});assert.equal(controller.status,'error');
 broken=false;await browserInteraction(port,target,{kind:'retry'});assert.equal(controller.status,'ready');
 const published=publications; controller.invalidate(); await assert.rejects(controller.project(0,true),/not ready/);
 dispose(); await new Promise(r=>setTimeout(r,330)); assert.equal(publications,published);
 console.log(`${kind} shared browser document conformance passed`);
}
