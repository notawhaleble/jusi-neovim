import { browserWorkflowCases } from './browser-workflow-cases.mjs';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { app, clipboard, ClipboardItem } from 'electron';

// Synthetic WebContents input can target hidden views, unlike physical input.
// Check native visibility/focus and deliver in the same main-process turn.
export async function deliverGuestInput({host,guest,waitFor}, events) {
  const native=host.contentView.children.find(view=>view.webContents?.id===guest.id);
  await waitFor(()=>{
    if(native && (!native.getVisible() || (events.some(e=>e.type.startsWith('key')) && !guest.isFocused())))return false;
    for(const event of events)guest.sendInputEvent(event);
    return true;
  });
}

export async function markHintCases({host, guest, command, waitFor}) {
  const input = keys => host.webContents.executeJavaScript(`window.jusi.sendInput(${JSON.stringify(keys)})`);
  await guest.executeJavaScript(`(() => {
    const section=document.createElement('section'); section.id='hint-test';
    section.innerHTML='<h2>Hint heading</h2><div style="width:340px;overflow:auto"><table style="width:800px"><tr><td>alpha</td><td>delta</td><td>far away</td></tr></table></div>';
    document.body.prepend(section); window.scrollTo(0,0);
  })()`);
  await command("lua assert(vim.wait(5000,function() return table.concat(vim.api.nvim_buf_get_lines(0,0,-1,false),' '):find('delta',1,true) ~= nil end))");
  await command('normal! ggma');
  const overlay = "document.querySelector('#jusi-neovim-mark-hints')";
  await input("'");
  const key = await waitFor(()=>guest.executeJavaScript(`(() => { const h=${overlay}; if(!h)return null;
    return [...h.targets].find(([,i])=>window.__jusiMirrorIndexMap[i].node.textContent==='delta')?.[0];})()`));
  assert.notEqual(key,'a');
  await browserReviewPause('mark-hints',host);
  await input(key);
  await waitFor(()=>guest.executeJavaScript(`!${overlay}`));
  await command("lua assert(vim.wait(3000,function() return vim.fn.expand('<cword>')=='delta' end), vim.inspect(vim.api.nvim_win_get_cursor(0))); assert(vim.api.nvim_buf_get_mark(0,'"+key+"')[1]==0)");
  await input("'a");
  await waitFor(()=>host.webContents.executeJavaScript(`window.jusi.getInitialState().then(s=>s.snapshot.windows.some(w=>w.bufferId && w.cursor?.row===0 && w.id===s.snapshot.tabs.find(t=>t.id===s.snapshot.currentTabId)?.currentWindowId))`));
  await input("'");
  await waitFor(()=>guest.executeJavaScript(`!!${overlay}`));
  await input('<Esc>');
  await waitFor(()=>guest.executeJavaScript(`!${overlay}`));
  await guest.executeJavaScript("document.getElementById('hint-test').remove()");
  console.log('Visible table hint, exact jump, existing mark and cancellation passed');
}

/** Same real command acceptance through either browser transport. */
export async function browserInteractionCases({ host, guest, command, waitFor, statusSelector }) {
  if (process.env.JUSI_TEST_BROWSER_WORKFLOW === '1') { await browserWorkflowCases({host,guest,command,waitFor,statusSelector}); return; }
  const js = code => host.webContents.executeJavaScript(code);
  if (process.env.JUSI_TEST_READING_ONLY === '1') { await browserReadingCases({host,guest,command,waitFor,statusSelector}); return; }
  await markHintCases({host,guest,command,waitFor});
  await browserTextLimitCases({host,guest,command,waitFor,statusSelector});
  await browserReadingCases({host,guest,command,waitFor,statusSelector});
  await guest.executeJavaScript(`(() => {
    const section = document.createElement('section'); section.id = 'interaction-fixture';
    section.innerHTML = '<p id="unicode-fixture">A😀é文 אב</p><p id="block-fixture">abcdef</p><a href="#interaction-done">Shared interaction link</a><div style="height:2000px"></div>';
    document.body.append(section);
  })()`);
  await command(`lua assert(vim.wait(3000, function() return table.concat(vim.api.nvim_buf_get_lines(0,0,-1,false),' '):find('Shared interaction link',1,true) ~= nil end,20))`);
  await waitFor(() => js(`document.querySelector(${JSON.stringify(statusSelector)})?.dataset.status === 'ready'`));
  const atColumn = async column => {
    await command(`lua for i,line in ipairs(vim.api.nvim_buf_get_lines(0,0,-1,false)) do if line:find('A😀',1,true) then vim.api.nvim_win_set_cursor(0,{i,vim.fn.byteidxcomp(line,${column})}); break end end`);
  };
  const aligned = (selector, from, to) => guest.executeJavaScript(`(() => {
    const node=document.querySelector('#unicode-fixture').firstChild;
    const range=document.createRange(); range.setStart(node,${from}); range.setEnd(node,${to});
    const expected=range.getBoundingClientRect(), actual=document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect();
    return !!actual && Math.abs(actual.left-expected.left)<2 && Math.abs(actual.width-expected.width)<2;
  })()`);
  for(const [column,from,to] of [[1,1,3],[2,3,5],[4,5,6],[6,7,8]]) {
    await atColumn(column);
    try { await waitFor(() => aligned('#jusi-neovim-mirror-caret',from,to)); }
    catch(error) {
      console.error('Cursor geometry diagnostics',column,await guest.executeJavaScript(`(() => {
        const rect=n=>{const r=n?.getBoundingClientRect();return r&&{x:r.x,y:r.y,width:r.width,height:r.height}};
        return {zoom:devicePixelRatio,caret:rect(document.querySelector('#jusi-neovim-mirror-caret')),
          sample:rect(document.querySelector('#unicode-fixture')),text:document.querySelector('#unicode-fixture')?.textContent,
          map:window.__jusiMirrorIndexMap?.slice(0,100).map(x=>x?.node?.textContent?.slice(0,40))};
      })()`),await js(`(async()=>{const s=await window.jusi.getInitialState();return s.snapshot.windows})()`));
      throw error;
    }
  }
  await atColumn(1);
  await js(`window.jusi.sendInput('v')`);
  await waitFor(() => aligned('#jusi-neovim-mirror-selection > div',1,3));
  await js(`window.jusi.sendInput('<Esc>')`);
  await command('set selection=exclusive');
  await atColumn(1);
  await js(`window.jusi.sendInput('vl')`);
  await waitFor(() => aligned('#jusi-neovim-mirror-selection > div',1,3));
  await js(`window.jusi.sendInput('<Esc>')`);
  await atColumn(2);
  await js(`window.jusi.sendInput('vh')`);
  await waitFor(() => aligned('#jusi-neovim-mirror-selection > div',1,3));
  await js(`window.jusi.sendInput('<Esc>')`);
  await command('set selection=inclusive');
  await atColumn(1);
  await js(`window.jusi.sendInput('<C-v>')`);
  await command(`lua for i,line in ipairs(vim.api.nvim_buf_get_lines(0,0,-1,false)) do if line == 'abcdef' then vim.api.nvim_win_set_cursor(0,{i,2}); break end end`);
  await waitFor(() => guest.executeJavaScript(`(() => {
    const actual=Array.from(document.querySelectorAll('#jusi-neovim-mirror-selection > div')).map(n=>n.getBoundingClientRect());
    const expected=['#unicode-fixture','#block-fixture'].map(selector=>{
      const node=document.querySelector(selector).firstChild, range=document.createRange();
      range.setStart(node,1);range.setEnd(node,3);return range.getBoundingClientRect();
    });
    return actual.length===2 && expected.every(e=>actual.some(a=>Math.abs(a.left-e.left)<2&&Math.abs(a.top-e.top)<2&&Math.abs(a.width-e.width)<2));
  })()`));
  await js(`window.jusi.sendInput('<Esc>')`);
  await waitFor(() => guest.executeJavaScript(`!document.querySelector('#jusi-neovim-mirror-selection > div')`));
  await command(`lua vim.g.guest_mouse_leaks=0; vim.keymap.set('n','<LeftMouse>',function() vim.g.guest_mouse_leaks=vim.g.guest_mouse_leaks+1 end,{buffer=true})`);
  await atColumn(6);
  await waitFor(() => aligned('#jusi-neovim-mirror-caret',7,8));
  const unicodeView = host.contentView.children.find(view => view.webContents?.id === guest.id);
  // A painted caret may survive while a refresh has revoked its document ticket.
  // Readiness for input requires the current mapping, not the previous paint.
  if (!unicodeView) await waitFor(() => js(`(async()=>{
    const s=await window.jusi.getInitialState();
    const v=s.attachedWebViews.find(v=>v.windowId===s.snapshot.tabs.find(t=>t.id===s.snapshot.currentTabId)?.currentWindowId);
    if(!v?.mirror || v.incarnation===undefined)return false;
    const current=await window.jusi.readBrowserState(v.windowId,{bufferId:v.bufferId,sessionId:v.sessionId,incarnation:v.incarnation,revision:v.mirror.version});
    return !!current?.mirror && current.mirror.version===v.mirror.version;
  })()`));
  if (unicodeView) await waitFor(() => unicodeView.getVisible());
  const unicodeMouse=[];
  const recordUnicodeMouse=(_event,event)=>{ if(unicodeMouse.length<8)unicodeMouse.push(event); };
  guest.on('before-mouse-event',recordUnicodeMouse);
  await js(`window.__unicodePointer=[];if(!window.__unicodePointerTraceInstalled){window.__unicodePointerTraceInstalled=true;window.jusi.onBrowserPointer(e=>{if(window.__unicodePointer?.length<8)window.__unicodePointer.push(e)})}`);
  const unicodePoint=await guest.executeJavaScript(`(() => {
    const range=document.createRange(),node=document.querySelector('#unicode-fixture').firstChild;
    range.setStart(node,5);range.setEnd(node,6);const r=range.getBoundingClientRect();
    return {x:Math.round(r.left+r.width/4),y:Math.round(r.top+r.height/2)};
  })()`);
  await deliverGuestInput({host,guest,waitFor},[
    {type:'mouseDown',button:'left',clickCount:1,...unicodePoint},
    {type:'mouseUp',button:'left',clickCount:1,...unicodePoint}]);
  try {
  await waitFor(() => js(`(async () => { const s=await window.jusi.getInitialState();const tab=s.snapshot.tabs.find(t=>t.id===s.snapshot.currentTabId);return s.snapshot.windows.some(w=>w.id===tab?.currentWindowId&&w.cursor?.col===4); })()`));
  } catch(error) {
    console.error('Unicode click diagnostics', unicodePoint, unicodeMouse, await js('JSON.stringify(window.__unicodePointer)'), await js(`(async()=>({state:JSON.stringify((await window.jusi.getInitialState()).snapshot.windows)}))()`), await guest.executeJavaScript(`(() => {const r=document.caretRangeFromPoint(${unicodePoint.x},${unicodePoint.y});return {offset:r?.startOffset,text:r?.startContainer?.textContent};})()`));
    throw error;
  } finally {guest.removeListener('before-mouse-event',recordUnicodeMouse);await js('window.__unicodePointer=null');}
  await command(`lua assert(vim.g.guest_mouse_leaks==0,'guest click leaked into grid mouse input'); pcall(vim.keymap.del,'n','<LeftMouse>',{buffer=true})`);
  guest.sendInputEvent({type:'keyDown',keyCode:'\\',modifiers:['control']});
  guest.sendInputEvent({type:'keyDown',keyCode:'N',modifiers:['control']});
  await command(`lua for i,line in ipairs(vim.api.nvim_buf_get_lines(0,0,-1,false)) do if line:find('Shared interaction link',1,true) then vim.api.nvim_win_set_cursor(0,{i,0}); break end end`);
  // Both adapters use Neovim's actual line and text readiness, not a possibly old
  // presentation cursor (nor DOM-only attachedWebViews for a native child).
  await command(`lua local since=nil; assert(vim.wait(3000,function()
    if vim.b.jusi_browser_status == 'ready' and vim.api.nvim_get_current_line():find('Shared interaction link',1,true)
      and vim.api.nvim_win_get_cursor(0)[2] == 0 then
      since=since or vim.uv.now(); return vim.uv.now()-since>=200
    end
    since=nil; return false
  end,20),'link cursor/text did not settle: '..vim.inspect({cursor=vim.api.nvim_win_get_cursor(0),line=vim.api.nvim_get_current_line(),status=vim.b.jusi_browser_status,mode=vim.fn.mode()}))`);
  await js(`window.jusi.onWebOpenLink(event => { window.lastInteractionEvent = event; }); window.jusi.sendInput('<C-j>')`);
  try { await waitFor(() => guest.getURL().endsWith('#interaction-done')); }
  catch (error) {
    console.error('interaction diagnostics', await js(`(async () => { const s = await window.jusi.getInitialState(); return JSON.stringify({ event: window.lastInteractionEvent, views: s.attachedWebViews, windows: s.snapshot.windows, tab: s.snapshot.currentTabId }); })()`), await guest.executeJavaScript(`({url:location.href, link:document.querySelector('#interaction-fixture a')?.outerHTML, mapped:window.__jusiMirrorIndexMap?.map((x,i)=>x?.node?.parentElement?.closest("a") ? i : null).filter(x=>x!==null)})`));
    throw error;
  }
  await guest.executeJavaScript('window.scrollTo(0,0)');
  await js(`window.jusi.sendInput('<C-e>')`);
  await waitFor(() => guest.executeJavaScript('window.scrollY > 0'));
  await waitFor(() => js(`(() => { const button = document.querySelector(${JSON.stringify(statusSelector)}); if (!button || button.disabled) return false; button.click(); return true; })()`));
  await waitFor(() => js(`document.querySelector(${JSON.stringify(statusSelector)})?.dataset.status === 'ready'`));
  await guest.executeJavaScript('window.scrollTo(0,0)');
  const nativeView = host.contentView.children.find(view => view.webContents?.id === guest.id);
  await command('normal! G');
  await waitFor(() => js(`(async () => { const s = await window.jusi.getInitialState(); const tab = s.snapshot.tabs.find(t => t.id === s.snapshot.currentTabId); return s.snapshot.windows.some(w => w.id === tab?.currentWindowId && w.cursor?.row > 0); })()`));
  if (nativeView) await waitFor(() => nativeView.getVisible());
  const point = await guest.executeJavaScript(`(() => { const r = document.querySelector('h1').getBoundingClientRect(); return {x:Math.round(r.left+10),y:Math.round(r.top+r.height/2)}; })()`);
  await deliverGuestInput({host,guest,waitFor},[
    { type:'mouseDown',button:'left',clickCount:1,...point },
    { type:'mouseUp',button:'left',clickCount:1,...point }]);
  try { await waitFor(() => js(`(async () => { const s = await window.jusi.getInitialState(); const tab = s.snapshot.tabs.find(t => t.id === s.snapshot.currentTabId); return s.snapshot.windows.some(w => w.id === tab?.currentWindowId && w.cursor?.row === 0); })()`)); }
  catch(error) {console.error('Heading click diagnostic',{point,visible:nativeView?.getVisible(),guest:await guest.executeJavaScript(`({scrollY,heading:document.querySelector('h1').getBoundingClientRect().toJSON(),height:innerHeight,focused:document.hasFocus()})`)});throw error;}
  guest.sendInputEvent({type:'keyDown',keyCode:'\\',modifiers:['control']});
  guest.sendInputEvent({type:'keyDown',keyCode:'N',modifiers:['control']});
  await browserFocusCases({host,guest,waitFor});
  assert.equal(await guest.executeJavaScript('!!document.querySelector("#interaction-fixture")'),true);
  await guest.executeJavaScript(process.env.JUSI_TEST_MANUAL === '1'
    ? `document.querySelector('#interaction-fixture a').remove(); document.querySelector('#interaction-fixture div').remove(); window.scrollTo(0,0)`
    : `document.querySelector('#interaction-fixture').remove(); window.scrollTo(0,0)`);
  if (process.env.JUSI_TEST_REVIEW === 'nvim-conformance' || (process.env.JUSI_TEST_REVIEW === 'nvim-conformance-native' && nativeView)) {
    await command(`lua vim.g.review_origin=vim.api.nvim_get_current_win(); vim.g.review_tabline=vim.o.tabline; vim.g.review_showtabline=vim.o.showtabline; vim.cmd('botright 6new'); vim.g.review_window=vim.api.nvim_get_current_win(); vim.bo.buftype='nofile'; vim.bo.bufhidden='wipe'; vim.api.nvim_buf_set_lines(0,0,-1,false,{'Mouse review: click words and drag a selection.','Second line: alpha beta gamma.','Third line: resize the split above.','Both browser adapters remain above this editor.'}); vim.o.mouse='a'; vim.o.showtabline=2; vim.api.nvim_set_hl(0,'ReviewAttention',{bg='#e5b454',fg='#201800'}); vim.o.tabline='%#ReviewAttention# conformance review %T'`);
    await browserReviewPause(process.env.JUSI_TEST_REVIEW,host);
    // Manual input may leave insert/visual mode or a local/Neovim message pager.
    // Restore input state before resuming deterministic automated acceptance.
    for (let n=0;n<2;n++) {
      host.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
      host.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
      await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    }
    await js(`window.jusi.sendInput('<Esc>')`);
    await waitFor(()=>js(`(async()=>{const s=await window.jusi.getInitialState();return s.screen.mode.name==='normal' && !document.querySelector('#cmdline-block-layer')?.classList.contains('cmdline-block-layer--visible')})()`));
    await command(`lua if vim.api.nvim_win_is_valid(vim.g.review_window) then vim.api.nvim_win_close(vim.g.review_window,true) end; if vim.api.nvim_win_is_valid(vim.g.review_origin) then vim.api.nvim_set_current_win(vim.g.review_origin) end; vim.o.tabline=vim.g.review_tabline; vim.o.showtabline=vim.g.review_showtabline`);
  }
  console.log('Shared browser Unicode cursor, exclusive/block selection, link, scroll, click, retry and focus/input cases passed');
}

/** Real keyboard delivery through both installed adapters, before mutable fixtures. */
export async function browserCommandCases({host,guest,waitFor,statusSelector}) {
  const js=code=>host.webContents.executeJavaScript(code);
  host.focus();
  await js(`Array.from(document.querySelectorAll('webview')).find(v=>v.getWebContentsId()===${guest.id})?.focus()`);
  guest.focus();
  await waitFor(()=>guest.executeJavaScript('document.hasFocus()'));
  const nativeView=host.contentView.children.find(view=>view.webContents?.id===guest.id);
  const press=async keyCode=>{
    if(nativeView) await waitFor(()=>nativeView.getVisible());
    guest.sendInputEvent({type:'keyDown',keyCode,modifiers:['control']});
  };
  await browserClipboardCases({host,guest,waitFor});
  if (process.env.JUSI_TEST_EDITING_ONLY === '1') return;
  const original=guest.getURL();
  await guest.executeJavaScript(`history.pushState({},'', '#command-one')`, true);
  await guest.executeJavaScript(`history.pushState({},'', '#command-two')`, true);
  assert.equal(guest.navigationHistory.canGoBack(),true,'fixture history must be user-activated');
  const historyBefore={url:guest.getURL(),back:guest.navigationHistory?.canGoBack(),entries:guest.navigationHistory?.getAllEntries().map(entry=>entry.url)};
  const inputs=[];const observe=(_event,input)=>inputs.push({code:input.code,type:input.type,control:input.control});
  guest.on('before-input-event',observe);
  await press('O');
  try { await waitFor(()=>guest.getURL().endsWith('#command-one')); }
  catch(error) { console.error('History command diagnostics',JSON.stringify({historyBefore,url:guest.getURL(),inputs,entries:guest.navigationHistory?.getAllEntries().map(entry=>entry.url)}));throw error; }
  finally { guest.removeListener('before-input-event',observe); }
  await press('I');await waitFor(()=>guest.getURL().endsWith('#command-two'));
  await press('=');await waitFor(()=>Math.abs(guest.getZoomFactor()-1.1)<.001);
  await press('-');await waitFor(()=>Math.abs(guest.getZoomFactor()-1)<.001);
  await press('=');await waitFor(()=>guest.getZoomFactor()>1);
  await press('0');await waitFor(()=>Math.abs(guest.getZoomFactor()-1)<.001);
  await browserReviewPause('commands',host);
  await guest.executeJavaScript(`history.replaceState({},'',${JSON.stringify(original)});window.commandReloadMarker=true`);
  await press('R');
  await waitFor(async()=>!guest.isLoading() && await guest.executeJavaScript('window.commandReloadMarker === undefined'));
  await waitFor(()=>js(`document.querySelector(${JSON.stringify(statusSelector)})?.dataset.status==='ready'`));
  assert.equal(guest.getURL(),original);
  guest.sendInputEvent({type:'keyDown',keyCode:'\\',modifiers:['control']});
  await press('N');
  await waitFor(()=>guest.executeJavaScript('!document.hasFocus()'));
  console.log('Shared reload/history/zoom keyboard cases passed');
}

/** A capped document stays rich, publishes no partial mirror, and can recover. */
export async function browserTextLimitCases({host,guest,command,waitFor,statusSelector}) {
  const js=code=>host.webContents.executeJavaScript(code);
  await guest.executeJavaScript(`(() => {
    const fixture=document.createElement('pre');fixture.id='text-limit-fixture';
    fixture.textContent='x'.repeat(200001);document.body.append(fixture);
  })()`);
  await waitFor(()=>js(`document.querySelector(${JSON.stringify(statusSelector)})?.dataset.status==='limited'`));
  assert.match(await js(`document.querySelector(${JSON.stringify(statusSelector)}).textContent`),/Text limit reached/);
  assert.equal(await guest.executeJavaScript('window.__jusiMirrorIndexMap.length'),0);
  // Retry with unchanged content must still report the cap, never ready.
  await js(`document.querySelector(${JSON.stringify(statusSelector)}).click()`);
  await waitFor(()=>js(`document.querySelector(${JSON.stringify(statusSelector)})?.dataset.status==='limited'`));
  await js(`window.jusi.sendInput('i')`);
  const nativeView=host.contentView.children.find(view=>view.webContents?.id===guest.id);
  if(nativeView) await waitFor(()=>nativeView.getVisible());
  await guest.executeJavaScript(`(() => {
    const input=document.createElement('input');input.id='limit-input';
    document.body.prepend(input);input.focus();
  })()`);
  host.focus();
  await js(`Array.from(document.querySelectorAll('webview')).find(v=>v.getWebContentsId()===${guest.id})?.focus()`);
  guest.focus();
  await waitFor(()=>guest.executeJavaScript('document.hasFocus()'));
  await guest.executeJavaScript(`document.querySelector('#limit-input').focus()`);
  guest.sendInputEvent({type:'keyDown',keyCode:'q'});
  guest.sendInputEvent({type:'char',keyCode:'q'});
  guest.sendInputEvent({type:'keyUp',keyCode:'q'});
  try { await waitFor(()=>guest.executeJavaScript(`document.querySelector('#limit-input').value==='q'`)); }
  catch(error) { console.error('Limit input diagnostics',await guest.executeJavaScript(`({focused:document.hasFocus(),active:document.activeElement?.id,value:document.querySelector('#limit-input').value})`));throw error; }
  await browserReviewPause('text-limit',host);
  guest.sendInputEvent({type:'keyDown',keyCode:'\\',modifiers:['control']});
  guest.sendInputEvent({type:'keyDown',keyCode:'N',modifiers:['control']});
  await waitFor(()=>guest.executeJavaScript('!document.hasFocus()'));
  await guest.executeJavaScript(`document.querySelector('#limit-input').remove();document.querySelector('#text-limit-fixture').textContent='Recovered text limit'`);
  await command(`lua assert(vim.wait(3000,function() return table.concat(vim.api.nvim_buf_get_lines(0,0,-1,false),' '):find('Recovered text limit',1,true) ~= nil end,20))`);
  await waitFor(()=>js(`document.querySelector(${JSON.stringify(statusSelector)})?.dataset.status==='ready'`));
  await guest.executeJavaScript(`document.querySelector('#text-limit-fixture').remove()`);
  await command(`lua assert(vim.wait(3000,function() return table.concat(vim.api.nvim_buf_get_lines(0,0,-1,false),' '):find('Recovered text limit',1,true) == nil end,20))`);
  await waitFor(()=>js(`document.querySelector(${JSON.stringify(statusSelector)})?.dataset.status==='ready'`));
  console.log('Shared extraction cap, visible status, rich input, retry and recovery passed');
}

/** Shared focus workflow; also callable without selection/command fixtures. */
export async function browserFocusCases({host,guest,waitFor,beforeRetainedFocus=async()=>{}}) {
  const js=code=>host.webContents.executeJavaScript(code);
  const nativeView=host.contentView.children.find(view=>view.webContents?.id===guest.id);
  const created=await guest.executeJavaScript(`(() => {
    if(document.querySelector('#interaction-fixture')) return false;
    const section=document.createElement('section');section.id='interaction-fixture';document.body.append(section);return true;
  })()`);
  // Real rich input and chord cancellation use identical cases for both adapters.
  await guest.executeJavaScript(`(() => {
    const input=document.createElement('input');input.id='focus-fixture';input.setAttribute('aria-label','Focus conformance');
    document.querySelector('#interaction-fixture').append(input);
    window.focusKeys=[];input.addEventListener('keydown',event=>window.focusKeys.push(event.code));
  })()`);
  await js(`window.jusi.sendInput('i')`);
  await waitFor(() => guest.executeJavaScript('document.hasFocus()'));
  await guest.executeJavaScript(`document.querySelector('#focus-fixture').focus()`);
  guest.sendInputEvent({type:'keyDown',keyCode:'\\',modifiers:['control']});
  host.webContents.focus();
  await js(`document.querySelector(".stage").focus({preventScroll:true})`);
  try { await waitFor(() => guest.executeJavaScript('!document.hasFocus()')); }
  catch(error) {
    console.error('Focus boundary diagnostics', {nativeFocused:guest.isFocused(),
      guest:await guest.executeJavaScript('({focused:document.hasFocus(),active:document.activeElement?.outerHTML})'),
      shell:await js('({focused:document.hasFocus(),active:document.activeElement?.outerHTML?.slice(0,500)})')});
    throw error;
  }
  await js(`Array.from(document.querySelectorAll("webview")).find(view=>view.getWebContentsId()===${guest.id})?.focus()`);
  guest.focus();
  await waitFor(() => guest.executeJavaScript('document.hasFocus()'));
  guest.sendInputEvent({type:'keyDown',keyCode:'N',modifiers:['control']});
  await waitFor(() => guest.executeJavaScript(`window.focusKeys.includes('KeyN')`));
  guest.sendInputEvent({type:'keyDown',keyCode:'x'});
  guest.sendInputEvent({type:'char',keyCode:'x'});
  guest.sendInputEvent({type:'keyUp',keyCode:'x'});
  await waitFor(() => guest.executeJavaScript(`document.querySelector('#focus-fixture').value === 'x'`));
  await beforeRetainedFocus();
  try {
    // Native composition may park between typing and this check. Require bounded
    // restoration rather than treating a hidden frame as permanent focus loss.
    await waitFor(async()=> (!nativeView || nativeView.getVisible())
      && await guest.executeJavaScript('document.hasFocus()'));
  } catch(error) {
    console.error('Cancelled chord focus diagnostics',{
      visible:nativeView?.getVisible(),nativeFocused:guest.isFocused(),
      guest:await guest.executeJavaScript(`({focused:document.hasFocus(),active:document.activeElement?.id,value:document.querySelector('#focus-fixture')?.value})`),
      shell:await js(`({focused:document.hasFocus(),active:document.activeElement?.tagName})`)});
    throw error;
  }
  assert.equal(await guest.executeJavaScript(`document.querySelector('#focus-fixture').value`),'x');
  assert.equal(await guest.executeJavaScript('document.activeElement?.id'),'focus-fixture');
  guest.sendInputEvent({type:'keyDown',keyCode:'\\',modifiers:['control']});
  guest.sendInputEvent({type:'keyDown',keyCode:'Control',modifiers:['control']});
  guest.sendInputEvent({type:'keyDown',keyCode:'N',modifiers:['control']});
  await waitFor(() => guest.executeJavaScript('!document.hasFocus()'));
  await js(`window.jusi.sendInput('i')`);
  await waitFor(() => guest.executeJavaScript('document.hasFocus()'));
  assert.equal(await guest.executeJavaScript(`document.querySelector('#focus-fixture').value`),'x');
  assert.equal(await guest.executeJavaScript('document.activeElement?.id'),'focus-fixture');
  guest.sendInputEvent({type:'keyDown',keyCode:'\\',modifiers:['control']});
  guest.sendInputEvent({type:'keyDown',keyCode:'N',modifiers:['control']});
  await waitFor(() => guest.executeJavaScript('!document.hasFocus()'));
  await guest.executeJavaScript(`document.querySelector('#focus-fixture').remove()`);
  if(created) await guest.executeJavaScript(`document.querySelector('#interaction-fixture').remove()`);
}

/** Reading controls and dynamic refresh, through both production adapters. */
async function browserReadingCases({host,guest,command:runCommand,waitFor,statusSelector}) {
  const command=async code=>{try{return await runCommand(code);}catch(error){console.error('Reading assertion:',code);throw error;}};
  const js = code => host.webContents.executeJavaScript(code);
  await guest.executeJavaScript(`(() => {
    const fixture=document.createElement('section'); fixture.id='reading-fixture';
    fixture.innerHTML='<button id="reading-button"><span>Nested button label</span></button><button disabled id="reading-disabled">Disabled button label</button><div role="button" id="reading-custom"><span>Custom control label</span></div><div id="reading-region-one" style="height:80px;overflow:auto"><p>Region one anchor</p><div style="height:600px"></div></div><div id="reading-region-two" style="height:80px;overflow:auto"><p>Region two anchor</p><div style="height:600px"></div></div><p id="reading-anchor">Preserved reading anchor</p><div id="reading-progress"></div>';
    document.body.append(fixture);window.readingClicks=[];
    for(const id of ['reading-button','reading-disabled','reading-custom']) document.getElementById(id).onclick=()=>window.readingClicks.push(id);
  })()`);
  await command(`lua assert(vim.wait(5000,function() return table.concat(vim.api.nvim_buf_get_lines(0,0,-1,false),' '):find('Preserved reading anchor',1,true) ~= nil end,20))`);
  const move = async text => command(`lua for i,line in ipairs(vim.api.nvim_buf_get_lines(0,0,-1,false)) do local at=line:find('${text}',1,true); if at then vim.api.nvim_win_set_cursor(0,{i,at-1}); break end end`);
  for(const text of ['Nested button label','Disabled button label','Custom control label']) {
    await move(text); await js(`window.jusi.sendInput('<C-j>')`);
    if(text==='Nested button label') await waitFor(()=>guest.executeJavaScript(`window.readingClicks.includes('reading-button')`));
    if(text==='Custom control label') await waitFor(()=>guest.executeJavaScript(`window.readingClicks.includes('reading-custom')`));
  }
  assert.deepEqual(await guest.executeJavaScript('window.readingClicks'),['reading-button','reading-custom']);
  const expectRegion=async text=>command(`lua local since=nil; assert(vim.wait(3000,function() if vim.api.nvim_get_current_line():find('${text}',1,true) then since=since or vim.uv.now(); return vim.uv.now()-since>=200 else since=nil; return false end end,20),'region did not settle: ${text}')`);
  const pressRegion=back=>{
    host.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab',modifiers:back?['shift']:[]});
    host.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab',modifiers:back?['shift']:[]});
  };
  await move('Region one anchor');
  host.webContents.focus(); pressRegion(false);
  await expectRegion('Region two anchor');
  pressRegion(true); await expectRegion('Region one anchor');
  await js(`window.jusi.sendInput('<Tab><Tab><S-Tab>')`);
  await expectRegion('Region two anchor');
  pressRegion(true); await expectRegion('Region one anchor');
  await move('Preserved reading anchor');
  await guest.executeJavaScript(`(() => { const p=document.createElement('p');p.textContent='Inserted above reader';document.querySelector('#reading-fixture').prepend(p); })()`);
  await command(`lua assert(vim.wait(5000,function() return table.concat(vim.api.nvim_buf_get_lines(0,0,-1,false),' '):find('Inserted above reader',1,true) ~= nil end,20)); assert(vim.api.nvim_get_current_line():find('Preserved reading anchor',1,true))`);
  await waitFor(()=>js(`document.querySelector(${JSON.stringify(statusSelector)})?.dataset.status==='ready'`));
  const revision=await guest.executeJavaScript('window.__jusiDocumentChanges.revision');
  await guest.executeJavaScript(`new Promise(resolve=>{let count=0;const timer=setInterval(()=>{document.querySelector('#reading-progress').style.width=(count++)+'px';document.querySelector('#reading-anchor').style.color=count%2?'red':'blue';if(count===20){clearInterval(timer);resolve();}},30);})`);
  assert.equal(await guest.executeJavaScript('window.__jusiDocumentChanges.revision'),revision,'media progress and paint-only styles must not reparse');
  await move('Nested button label');
  await browserReviewPause('reading-controls',host);
  await guest.executeJavaScript(`document.querySelector('#reading-fixture').remove()`);
  await command(`lua assert(vim.wait(5000,function() return table.concat(vim.api.nvim_buf_get_lines(0,0,-1,false),' '):find('Preserved reading anchor',1,true) == nil end,20))`);
  console.log('Shared control activation, region cycling, anchored refresh and animation filtering passed');
}

// Reusable, opt-in review checkpoints; the normal automated run never pauses.
export async function browserReviewPause(stage, host) {
  if (process.env.JUSI_TEST_REVIEW !== '1' && process.env.JUSI_TEST_REVIEW !== stage) return;
  const signal='.local/review/browser-review-continue';
  rmSync(signal,{force:true});
  writeFileSync('.local/review/browser-review-stage',stage);
  host.show(); host.focus();
  console.log('Browser manual review checkpoint:',stage);
  const deadline=Date.now()+180000;
  while(!existsSync(signal) && Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,250));
  assert(existsSync(signal),'Manual review checkpoint timed out: '+stage);
  rmSync(signal,{force:true});
}


// Clipboard stays a native editing action; page scripts get no clipboard bridge.
async function browserClipboardCases({host,guest,waitFor}) {
  const saved=await Promise.all((await clipboard.read()).filter(item => item.types.length > 0).map(async item=>
    new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async type=>[type,await item.getType(type)]))))));
  const modifiers=[process.platform==='darwin'?'meta':'control'];
  const press=async(keyCode,shift=false)=>deliverGuestInput({host,guest,waitFor},[
    {type:'keyDown',keyCode,modifiers:shift?[...modifiers,'shift']:modifiers},
    {type:'keyUp',keyCode,modifiers:shift?[...modifiers,'shift']:modifiers}]);
  try {
    await guest.executeJavaScript(`(() => {
      const section=document.createElement('section');section.id='clipboard-fixture';
      section.innerHTML='<p id="clipboard-selection">Copy 😀 from page</p><input id="clipboard-input" aria-label="Single-line clipboard test"><textarea id="clipboard-field" aria-label="Clipboard test"></textarea><div id="clipboard-rich" contenteditable="true" aria-label="Rich clipboard test"></div>';
      document.body.prepend(section);
      const range=document.createRange();range.selectNodeContents(section.firstChild);
      getSelection().removeAllRanges();getSelection().addRange(range);
    })()`);
    await press('C');
    await waitFor(async()=>await clipboard.readText()==='Copy 😀 from page');
    await clipboard.writeText('Paste 😀\nsecond line');
    await guest.executeJavaScript(`document.querySelector('#clipboard-field').focus()`);
    await press('V');
    await waitFor(()=>guest.executeJavaScript(`document.querySelector('#clipboard-field').value===${JSON.stringify('Paste 😀\nsecond line')}`));
    await guest.executeJavaScript(`document.querySelector('#clipboard-field').select()`);
    await press('X');
    await waitFor(()=>guest.executeJavaScript(`document.querySelector('#clipboard-field').value===''`));
    assert.equal(await clipboard.readText(),'Paste 😀\nsecond line');
    await press('V');
    await waitFor(()=>guest.executeJavaScript(`document.querySelector('#clipboard-field').value===${JSON.stringify('Paste 😀\nsecond line')}`));
    await guest.executeJavaScript(`document.querySelector('#clipboard-rich').focus()`);
    await press('V',true);
    await waitFor(()=>guest.executeJavaScript(`document.querySelector('#clipboard-rich').innerText.includes('Paste 😀')`));
    await deliverGuestInput({host,guest,waitFor},[
      {type:'keyDown',keyCode:'\\',modifiers:['control']}, {type:'keyUp',keyCode:'\\',modifiers:['control']},
      {type:'keyDown',keyCode:'N',modifiers:['control']}, {type:'keyUp',keyCode:'N',modifiers:['control']}]);
    await waitFor(()=>guest.executeJavaScript('!document.hasFocus()'));
    await host.webContents.executeJavaScript("window.jusi.sendInput('i')");
    await waitFor(()=>guest.executeJavaScript('document.hasFocus()'));
    const replacement='Replacement 😀';
    await clipboard.writeText(replacement);
    for (const id of ['clipboard-input','clipboard-field','clipboard-rich']) {
      const field = `document.getElementById(${JSON.stringify(id)})`;
      const value = field + (id==='clipboard-rich'?'.textContent':'.value');
      const original = 'Original ' + id;
      await guest.executeJavaScript(`${value}=${JSON.stringify(original)}; ${field}.focus()`);
      await press('A');
      await press('V');
      const expectValue = expected=>waitFor(()=>guest.executeJavaScript(`${value}===${JSON.stringify(expected)}`));
      await expectValue(replacement);
      await press('Z');
      await expectValue(original);
      await press('Z',true);
      await expectValue(replacement);
    }
    assert.equal(await guest.executeJavaScript(`typeof window.jusi`),'undefined');
    const cloneUrl = 'https://github.com/example/fixture.git';
    await waitFor(()=>guest.executeJavaScript('!navigator.userActivation.isActive'));
    assert.equal(await guest.executeJavaScript(`navigator.clipboard.writeText('unexpected').then(()=>true,()=>false)`),false);
    assert.equal(await clipboard.readText(),replacement);
    const point = await guest.executeJavaScript(`(() => {
      const section=document.querySelector('#clipboard-fixture');
      const button=document.createElement('button');
      button.textContent='Copy clone URL';
      button.onclick=async () => {
        button.dataset.read=await navigator.clipboard.readText().then(()=>'allowed',()=>'denied');
        try { await navigator.clipboard.writeText(${JSON.stringify(cloneUrl)}); button.dataset.copied='yes'; }
        catch (error) { button.dataset.copied=error.name; }
      };
      section.prepend(button);
      button.scrollIntoView({block:'center'});
      const r=button.getBoundingClientRect();
      return {x:Math.floor(r.left+r.width/2),y:Math.floor(r.top+r.height/2)};
    })()`);
    // Activate the test app as a physical click would, including the embedded
    // webview element after a Neovim tab switch.
    if (process.platform === 'darwin') app.focus({steal:true});
    host.focus();
    await host.webContents.executeJavaScript(`Array.from(document.querySelectorAll('webview'))
      .find(view => view.getWebContentsId() === ${guest.id})?.focus()`);

    guest.focus();
    await waitFor(() => {
      if (!host.isFocused() || !guest.isFocused()) return false;
      guest.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});
      guest.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});
      return true;
    });
    const copied=await waitFor(()=>guest.executeJavaScript("document.querySelector('#clipboard-fixture button').dataset.copied"));
    assert.equal(await guest.executeJavaScript("document.querySelector('#clipboard-fixture button').dataset.read"),'denied');
    assert.equal(copied,'yes','trusted copy button can write the clone URL');
    await guest.executeJavaScript("document.querySelector('#clipboard-input').focus()");
    await press('A');await press('V');
    await waitFor(()=>guest.executeJavaScript(`document.querySelector('#clipboard-input').value===${JSON.stringify(cloneUrl)}`));
    if (process.env.JUSI_TEST_REVIEW === 'composition') {
      await guest.executeJavaScript(`(() => {
        const field = document.querySelector('#clipboard-input');
        field.select();
        window.compositionLog = [];
        for (const type of ['keydown','keyup','compositionstart','compositionupdate','compositionend','beforeinput','input','blur']) {
          field.addEventListener(type, event => {
            if (event.isTrusted) window.compositionLog.push({type, data:event.data, composing:event.isComposing, inputType:event.inputType});
          });
        }
      })()`);
      await browserReviewPause('composition', host);
      const result = await guest.executeJavaScript(`(() => {
        const field = document.querySelector('#clipboard-input');
        const events=window.compositionLog;
        return {started:events.some(e=>e.type==='compositionstart'), committed:events.find(e=>e.type==='compositionend')?.data, value:field.value, events};
      })()`);
      const lastInput = result.events.findLast(e => e.type === 'input');
      const released = result.events.slice(result.events.lastIndexOf(lastInput) + 1)
        .some(e => e.type === 'keyup' && e.composing === false);
      // AppKit dead keys can end marked text before key-up without a DOM
      // compositionend on the input. Require trusted events and the final value.
      assert.ok(result.started && lastInput?.inputType === 'insertCompositionText'
        && lastInput.data === result.value && (result.committed === result.value || released),
        'expected native composition and committed text: '+JSON.stringify(result));
      console.log('Native composition committed in browser input', JSON.stringify(result));
    }
    await browserReviewPause('clipboard',host);
    console.log('Shared clipboard editing, activated copy button, paste round trip and permission denials passed');
  } finally {
    await guest.executeJavaScript(`document.querySelector('#clipboard-fixture')?.remove()`);
    if (saved.length) await clipboard.write(saved);
    else clipboard.clear();
  }
}
