import {browserTraceEnabled,browserTraceMark} from '../dist/electron/browser-trace.js';
import {readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {allowBrowserFullscreen} from '../dist/electron/browser-fullscreen.js';
import {app,BrowserWindow,webContents} from 'electron';
import {browserReviewPause,deliverGuestInput} from './browser-interaction-cases.mjs';

/** Same browser workflows through both transports, with real shell and guest input. */
export async function browserWorkflowCases({host,guest,command:runCommand,waitFor,statusSelector,openDuplicate}) {
  if (process.platform === 'darwin') app.focus({steal:true});
  host.focus();
  const command=async value=>{try{return await runCommand(value);}catch(error){console.error('Workflow command failed:',value);throw error;}};
  const js=code=>host.webContents.executeJavaScript(code);
  const historyTrace=[];
  const recordHistory=event=>{if(guest.isDestroyed())return;historyTrace.push({event,url:guest.getURL(),focused:guest.isFocused(),back:guest.navigationHistory.canGoBack(),forward:guest.navigationHistory.canGoForward()});if(historyTrace.length>40)historyTrace.shift();};
  const inputObserver=(_event,input)=>recordHistory(`input:${input.type}:${input.key}`);
  guest.on('before-input-event',inputObserver);
  guest.once('destroyed',()=>guest.removeListener('before-input-event',inputObserver));
  const ready=()=>waitFor(()=>js(`document.querySelector(${JSON.stringify(statusSelector)})?.dataset.status==='ready'`));
  const move=text=>command(`lua for i,line in ipairs(vim.api.nvim_buf_get_lines(0,0,-1,false)) do local at=line:find('${text}',1,true);if at then vim.api.nvim_win_set_cursor(0,{i,at-1});return end end;error('missing fixture text')`);
  await ready();
  if (browserTraceEnabled()) {
    await command('JusiWebDebugMark');
    await waitFor(()=>js(`(async()=>{const state=await window.jusi.getInitialState();return state.messages.entries.some(entry=>entry.text.startsWith('Browser debug marker saved:'))})()`));
    // Long trace paths use the normal message overlay, which parks native views.
    // Acknowledge it through shell input before continuing guest interactions.
    host.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
    host.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
    await ready();
  }
  if (process.env.JUSI_TEST_BROWSER_DEVTOOLS_ONLY === '1') {
    assert.equal(guest.isDevToolsOpened(),false);
    await command('JusiWebDevTools');
    await waitFor(()=>guest.isDevToolsOpened() && guest.devToolsWebContents);
    assert.equal(host.webContents.isDevToolsOpened(),false);
    assert.equal(await guest.devToolsWebContents.executeJavaScript('typeof document'), 'object');
    await command('JusiWebDevTools');
    await waitFor(()=>!guest.isDevToolsOpened());
    host.focus();
    await js(`window.jusi.sendInput('i')`);
    await waitFor(()=>guest.isFocused());
    await deliverGuestInput({host,guest,waitFor},[{type:'keyDown',keyCode:'F12'},{type:'keyUp',keyCode:'F12'}]);
    await waitFor(()=>guest.isDevToolsOpened());
    await command('JusiClose');
    await waitFor(()=>guest.isDestroyed());
    console.log('DevTools current-document command toggle, F12, shell isolation and document close passed');
    return;
  }
  if (process.env.JUSI_TEST_BROWSER_DUPLICATE_ONLY === '1') {
    const url=guest.getURL();
    await command('lua vim.g.w2_first_win=vim.api.nvim_get_current_win(); vim.g.w2_first_tab=vim.api.nvim_get_current_tabpage(); vim.g.w2_first_buf=vim.api.nvim_get_current_buf()');
    const install=async (contents,label)=>contents.executeJavaScript(`(() => {
      window.w2Identity=${JSON.stringify(label)};
      const input=document.createElement('input');input.id='w2-input';input.value=${JSON.stringify(label)};
      document.body.prepend(input);
      window.w2Events=[];
      for(const name of ['focusin','focusout','keydown','beforeinput','input'])document.addEventListener(name,event=>{
        window.w2Events.push({type:event.type,target:event.target.id,data:event.data});
        if(window.w2Events.length>40)window.w2Events.shift();
      },{capture:true});
    })()`);
    await install(guest,'first');
    let second;
    if(openDuplicate) second=await openDuplicate();
    else {
      await command('tabnew');
      await command('JusiWebBuffer '+url);
      second=await waitFor(()=>webContents.getAllWebContents().find(w=>w.id!==guest.id && w.getURL()===url));
    }
    await ready();
    assert.notEqual(second.id,guest.id);
    assert.equal(second.getURL(),url);
    await command('lua assert(vim.api.nvim_get_current_buf()~=vim.g.w2_first_buf); vim.g.w2_second_win=vim.api.nvim_get_current_win(); vim.g.w2_second_tab=vim.api.nvim_get_current_tabpage()');
    await install(second,'second');
    let firstLoads=0,secondLoads=0;
    guest.on('did-start-loading',()=>firstLoads++);
    second.on('did-start-loading',()=>secondLoads++);
    const use=async(contents,label,tab)=>{
      await command('lua vim.api.nvim_set_current_win(vim.g.w2_'+tab+'_win)');
      await ready();
      assert.equal(contents.isDestroyed(),false);
      assert.equal(contents.getURL(),url);
      assert.equal(await contents.executeJavaScript('window.w2Identity'),label);
      await js(`window.jusi.sendInput('i')`);
      await waitFor(()=>contents.isFocused());
      await contents.executeJavaScript(`(()=>{
        window.w2Events=[];
        const input=document.querySelector('#w2-input');input.focus();input.setSelectionRange(input.value.length,input.value.length);
      })()`);
      await deliverGuestInput({host,guest:contents,waitFor},[{type:'char',keyCode:'x'}]);
      try { await waitFor(()=>contents.executeJavaScript(`document.querySelector('#w2-input').value.endsWith('x')`)); }
      catch(error) {
        console.error('W2 input failure',JSON.stringify({label,tab,focused:contents.isFocused(),hostFocused:host.isFocused(),
          guest:await contents.executeJavaScript(`({focus:document.hasFocus(),active:document.activeElement?.outerHTML,value:document.querySelector('#w2-input').value,events:window.w2Events})`),
          shell:await js(`({active:document.activeElement?.outerHTML,hosts:[...document.querySelectorAll('[data-buffer-id]')].map(e=>({data:{...e.dataset},class:e.className}))})`)}));
        throw error;
      }
    };
    for(let i=0;i<5;i++) {
      await use(guest,'first','first');
      await use(second,'second','second');
    }
    assert.equal(await guest.executeJavaScript("document.querySelector('#w2-input').value"),'firstxxxxx');
    assert.equal(await second.executeJavaScript("document.querySelector('#w2-input').value"),'secondxxxxx');
    assert.equal(firstLoads,0,'first document unexpectedly reloaded');
    assert.equal(secondLoads,0,'second document unexpectedly reloaded');
    const reloadTrials=Number(process.env.JUSI_TEST_DUPLICATE_RELOAD_TRIALS ?? 1);
    assert(Number.isInteger(reloadTrials) && reloadTrials>0 && reloadTrials<=20);
    for(let trial=0;trial<reloadTrials;trial++) {
      second.reload();
      await waitFor(()=>secondLoads===trial+1 && !second.isLoading());await ready();
      assert.equal(await second.executeJavaScript('typeof window.w2Identity'),'undefined');
      await install(second,'reloaded');
      await use(guest,'first','first');await use(second,'reloaded','second');
    }
    await command('JusiClose');await waitFor(()=>second.isDestroyed());
    await use(guest,'first','first');
    assert.equal(firstLoads,0);
    assert.equal(await guest.executeJavaScript("document.querySelector('#w2-input').value"),'first'+'x'.repeat(6+reloadTrials));
    console.log('W2 same-URL distinct guests: ten tab switches, independent input, no unexpected loads, explicit reload and sibling close passed');
    return;
  }
  if (process.env.JUSI_TEST_BROWSER_FULLSCREEN_ONLY === '1') {
    const initialFullscreenUrl=guest.getURL();
    await command('lua vim.g.fullscreen_test_tab=vim.api.nvim_get_current_tabpage()');
    // Electron propagates HTML-fullscreen leave to every embedded webview.
    // Keep a second document alive, as in the user's long-lived browsing session.
    const siblingUrl=initialFullscreenUrl.split('#')[0]+'#fullscreen-sibling';
    await command('tabnew');await command(`JusiWebBuffer ${siblingUrl}`);
    await waitFor(()=>webContents.getAllWebContents().some(w=>w.id!==guest.id && w.getURL()===siblingUrl));
    await command('tabprevious');await ready();

    const fixture=()=>guest.executeJavaScript(`(() => {
      const box=document.createElement('section');box.id='fullscreen-fixture';
      box.style='background:#123;color:white;width:400px;height:240px';
      box.innerHTML='<button id="fullscreen-enter">Enter fullscreen</button><button id="fullscreen-exit">Exit fullscreen</button><button id="fullscreen-control">Play</button>';
      document.body.prepend(box);window.fullscreenError='';window.fullscreenClicks=0;
      document.querySelector('#fullscreen-enter').onclick=()=>{window.fullscreenRequested=true;box.requestFullscreen().catch(e=>window.fullscreenError=String(e));};
      document.querySelector('#fullscreen-exit').onclick=()=>document.exitFullscreen();
      document.querySelector('#fullscreen-control').onclick=()=>window.fullscreenClicks++;
      box.ondblclick=()=>{if(document.fullscreenElement)document.exitFullscreen();};
      document.addEventListener('keydown',event=>{if(event.key.toLowerCase()==='f' && !event.ctrlKey && !event.metaKey && document.fullscreenElement)document.exitFullscreen();});
    })()`);
    await fixture();
    await js(`window.jusi.sendInput('i')`);
    await waitFor(()=>guest.executeJavaScript('document.hasFocus()'));
    const click=async (selector,clickCount=1)=>{
      const point=await guest.executeJavaScript(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
      await deliverGuestInput({host,guest,waitFor},[{type:'mouseDown',button:'left',clickCount,...point},{type:'mouseUp',button:'left',clickCount,...point}]);
    };
    let hostLeaves=0;
    let settledFullscreen=host.isFullScreen();
    host.on('enter-full-screen',()=>{settledFullscreen=true;console.log('Host entered fullscreen');});
    host.on('leave-full-screen',()=>{hostLeaves++;settledFullscreen=false;console.log('Host left fullscreen');});
    const nativeView=host.contentView.children.find(view=>view.webContents?.id===guest.id);
    const geometry=()=>guest.executeJavaScript('({width:innerWidth,height:innerHeight})');
    const enter=async()=>{
      await waitFor(()=>guest.isFocused() && (!nativeView || nativeView.getVisible()));
      await guest.executeJavaScript('window.fullscreenRequested=false;window.fullscreenError=""');
      await click('#fullscreen-enter');
      try { await waitFor(()=>guest.executeJavaScript('!!document.fullscreenElement')); }
      catch(error) {
        console.error('Fullscreen entry diagnostics', {allowed:allowBrowserFullscreen(guest),hostFocused:host.isFocused(),guestFocused:guest.isFocused(),bounds:nativeView?.getBounds(),
          page:await guest.executeJavaScript('({requested:window.fullscreenRequested,error:window.fullscreenError,focus:document.hasFocus(),width:innerWidth,height:innerHeight})')});
        throw error;
      }
      await waitFor(async()=>{
        const size=await geometry(),[width,height]=host.getContentSize();
        return size.width===width && size.height===height && host.isFullScreen() && settledFullscreen && guest.isFocused();
      });
      if(nativeView) assert.deepEqual(nativeView.getBounds(),{x:0,y:0,width:host.getContentSize()[0],height:host.getContentSize()[1]});
    };
    const exited=async()=>{
      await waitFor(()=>guest.executeJavaScript('!document.fullscreenElement'));
      await waitFor(()=>!host.isFullScreen() && !settledFullscreen);
      await waitFor(async()=>{const size=await geometry();return size.height<host.getContentSize()[1];});
    };
    console.log('Fullscreen starting controls');
    await enter();
    await click('#fullscreen-control');await waitFor(()=>guest.executeJavaScript('window.fullscreenClicks===1'));
    await click('#fullscreen-exit');await exited();console.log('Fullscreen control exit passed');
    await enter();
    await deliverGuestInput({host,guest,waitFor},[{type:'keyDown',keyCode:'Escape'},{type:'keyUp',keyCode:'Escape'}]);
    await exited();
    console.log('Fullscreen Escape passed');
    await enter();
    await command('tabnew');
    await waitFor(()=>!host.isFullScreen() && !settledFullscreen);
    assert.equal(nativeView?.getVisible()??false,false);
    await command('tabclose');await command('lua vim.api.nvim_set_current_tabpage(vim.g.fullscreen_test_tab)');await ready();await exited();
    await js(`window.jusi.sendInput('i')`);await waitFor(()=>guest.executeJavaScript('document.hasFocus()'));
    await enter();
    await guest.reload();await waitFor(()=>!guest.isLoading());
    await exited();
    await ready();await fixture();
    await js(`window.jusi.sendInput('i')`);await waitFor(()=>guest.executeJavaScript('document.hasFocus()'));
    assert(allowBrowserFullscreen(guest), 'focused capability probe');
    host.setFullScreen(true);await waitFor(()=>settledFullscreen);
    await enter();await click('#fullscreen-exit');
    await waitFor(()=>guest.executeJavaScript('!document.fullscreenElement'));
    await new Promise(resolve=>setTimeout(resolve,700)); // Include queued OS fullscreen transitions.
    assert.equal(host.isFullScreen(),true,'document exit changed pre-existing host fullscreen');
    for(const method of ['F','Escape','double-click','button']) {
      await enter();
      const before=hostLeaves;
      if(method==='button')await click('#fullscreen-exit');
      else if(method==='double-click')await click('#fullscreen-fixture',2);
      else await deliverGuestInput({host,guest,waitFor},[{type:'keyDown',keyCode:method},{type:'keyUp',keyCode:method}]);
      await waitFor(()=>guest.executeJavaScript('!document.fullscreenElement'));
      await new Promise(resolve=>setTimeout(resolve,700));
      assert.equal(host.isFullScreen(),true,`${method} exited pre-existing host fullscreen`);
      assert.equal(hostLeaves,before,`${method} caused an OS fullscreen exit/re-entry`);
    }
    console.log('F, Escape, double-click and button preserve host fullscreen with a sibling webview');
    for (const shortcut of ['F11','command-control-f']) {
      await enter();
      await deliverGuestInput({host,guest,waitFor},[
        {type:'keyDown',keyCode:shortcut==='F11'?'F11':'F',modifiers:shortcut==='F11'?[]:['control','meta']},
        {type:'keyUp',keyCode:shortcut==='F11'?'F11':'F'}]);
      await waitFor(()=>guest.executeJavaScript('!document.fullscreenElement'));
      await new Promise(resolve=>setTimeout(resolve,700));
      assert.equal(host.isFullScreen(),true,`${shortcut} exited pre-existing host fullscreen`);
    }
    console.log('F11 and Ctrl-Cmd-F exit document fullscreen while preserving host fullscreen');
    host.setFullScreen(false);await waitFor(()=>!settledFullscreen);await exited();
    await enter();
    guest.sendInputEvent({type:'keyDown',keyCode:'\\',modifiers:['control']});
    guest.sendInputEvent({type:'keyDown',keyCode:'N',modifiers:['control']});
    await exited();
    await js(`window.jusi.sendInput('i')`);await waitFor(()=>guest.executeJavaScript('document.hasFocus()'));
    console.log('Fullscreen geometry, controls, Escape, tab/navigation, pre-existing host fullscreen and text mode passed');
    if (process.env.JUSI_TEST_REVIEW === 'browser-fullscreen') {
      try { await guest.loadURL('https://www.youtube.com/watch?v=aqz-KE-bpKQ'); }
      catch (error) { if (error.code !== 'ERR_ABORTED' || new URL(guest.getURL()).hostname !== 'www.youtube.com') throw error; }
      await waitFor(()=>!guest.isLoading());
      await js(`window.jusi.sendInput('i')`);
      await browserReviewPause('browser-fullscreen',host);
      // Reviewer leaves the video outside document fullscreen before continuing.
      await guest.loadURL(initialFullscreenUrl);
      await ready();await fixture();
      await js(`window.jusi.sendInput('i')`);await waitFor(()=>guest.executeJavaScript('document.hasFocus()'));
    }
    await enter();
    await command('JusiClose');
    await waitFor(()=>guest.isDestroyed());
    await waitFor(()=>!host.isFullScreen() && !settledFullscreen);
    console.log('Fullscreen close cleanup passed');
    return;
  }
  if (process.env.JUSI_TEST_BROWSER_MODIFIERS_ONLY === '1') {
    await guest.executeJavaScript(`(() => {
      const box=document.createElement('div');box.style='position:fixed;inset:10px;background:white;z-index:999999';
      box.innerHTML='<button id="modifier-button" style="width:250px;height:100px">Pause / replies</button><br><a id="modifier-link" href="#modifier-link">Next video</a>';
      document.body.append(box);window.modifierClicks=0;
      box.querySelector('button').onclick=()=>window.modifierClicks++;
      history.pushState({},'', '#modifier-first');history.pushState({},'', '#modifier-second');
    })()`,true);
    await js(`window.jusi.sendInput('i')`);
    await waitFor(()=>guest.executeJavaScript('document.hasFocus()'));
    await command('lua vim.g.modifier_tabs=#vim.api.nvim_list_tabpages();vim.g.modifier_buffer=vim.api.nvim_get_current_buf()');
    const click=async(selector,modifiers=[],button='left')=>{
      const point=await guest.executeJavaScript(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.left+10),y:Math.round(r.top+10)}})()`);
      await deliverGuestInput({host,guest,waitFor},[{type:'mouseDown',button,clickCount:1,...point,modifiers},{type:'mouseUp',button,clickCount:1,...point,modifiers}]);
    };
    assert.equal(await guest.executeJavaScript('typeof globalThis.__jusiBrowserClicks'),'undefined','page world cannot access isolated click collector');
    // Reproduce the incident's missing release without a focus/keyboard reset.
    guest.sendInputEvent({type:'keyDown',keyCode:'Control',modifiers:['control']});
    guest.sendInputEvent({type:'keyDown',keyCode:'O',modifiers:['control']});
    try { await waitFor(()=>guest.getURL().endsWith('#modifier-first')); } catch(error) { console.error('Modifier history',historyTrace,guest.navigationHistory.getAllEntries());throw error; }
    // Preserve exactly the retained state observed in the incident, independent
    // of synthetic-key delivery's platform-specific release behavior.
    guest.emit('before-input-event',{preventDefault(){}},{type:'keyDown',key:'Control',control:true,meta:false,shift:false});
    await click('#modifier-button');
    await waitFor(()=>guest.executeJavaScript('window.modifierClicks===1'));
    await click('#modifier-link');
    await waitFor(()=>guest.getURL().endsWith('#modifier-link'));
    await command('lua assert(#vim.api.nvim_list_tabpages()==vim.g.modifier_tabs);assert(vim.api.nvim_get_current_buf()==vim.g.modifier_buffer)');
    // Ordinary non-link controls also work while a modifier really IS held.
    await click('#modifier-button',['shift']);
    await waitFor(()=>guest.executeJavaScript('window.modifierClicks===2'));
    guest.sendInputEvent({type:'keyUp',keyCode:'Control'});
    for(const modifier of ['control','meta','shift','middle']) {
      await ready();await js(`window.jusi.sendInput('i')`);
      const view=host.contentView.children.find(view=>view.webContents?.id===guest.id);
      if(view)await waitFor(()=>view.getVisible());
      host.focus();guest.focus();
      await waitFor(()=>guest.executeJavaScript('document.hasFocus()'));
      await click('#modifier-link',modifier==='middle'?[]:[modifier],modifier==='middle'?'middle':'left');
      await command('lua assert(vim.wait(3000,function() return #vim.api.nvim_list_tabpages()==vim.g.modifier_tabs+1 end,20))');
      await command('JusiClose');
      await command('lua assert(#vim.api.nvim_list_tabpages()==vim.g.modifier_tabs);assert(vim.api.nvim_get_current_buf()==vim.g.modifier_buffer)');
    }
    console.log('Ctrl-O missing release preserves ordinary controls/links; current Control/Meta/Shift/middle clicks open one tab');
    return;
  }
  if (process.env.JUSI_TEST_BROWSER_BLUR_ONLY === '1') {
    await guest.executeJavaScript(`(() => {
      const box=document.createElement('div');box.id='blur-fixture';box.style='position:fixed;inset:20px;background:white;z-index:999999';
      box.innerHTML='<button id="blur-player" style="width:300px;height:120px">Playing</button><br><a id="blur-link" href="#ordinary-click">Another video</a>';
      document.body.append(box);window.blurClicks=0;
      box.querySelector('button').onclick=()=>{window.blurClicks++;box.querySelector('button').textContent=window.blurClicks%2?'Paused':'Playing';};
    })()`);
    await js(`window.jusi.sendInput('i')`);
    await waitFor(()=>guest.executeJavaScript('document.hasFocus()'));
    await command('lua vim.g.blur_tabs=#vim.api.nvim_list_tabpages();vim.g.blur_buffer=vim.api.nvim_get_current_buf()');
    const click=async selector=>{
      const point=await guest.executeJavaScript(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
      await deliverGuestInput({host,guest,waitFor},[{type:'mouseDown',button:'left',clickCount:1,...point},{type:'mouseUp',button:'left',clickCount:1,...point}]);
    };
    await click('#blur-player');await waitFor(()=>guest.executeJavaScript('window.blurClicks===1'));
    for (const boundary of ['enter-full-screen','leave-full-screen','blur','focus','document-fullscreen','keyboard-snapshot']) {
      historyTrace.length=0;
      guest.sendInputEvent({type:'keyDown',keyCode:'Meta',modifiers:['meta']});
      await waitFor(()=>historyTrace.some(e=>e.event==='input:keyDown:Meta'));
      // OS app switching/fullscreen may omit both guest blur and modifier key-up.
      if (boundary === 'document-fullscreen') guest.emit('leave-html-full-screen');
      else if (boundary === 'keyboard-snapshot') {
        guest.sendInputEvent({type:'keyDown',keyCode:'X'});
        guest.sendInputEvent({type:'keyUp',keyCode:'X'});
        await waitFor(()=>historyTrace.some(e=>e.event==='input:keyUp:x'));
      } else host.emit(boundary);
      const before=await guest.executeJavaScript('window.blurClicks');
      await click('#blur-player');
      await waitFor(()=>guest.executeJavaScript(`window.blurClicks===${before+1}`));
      guest.sendInputEvent({type:'keyUp',keyCode:'Meta'});
      await click('#blur-link');await waitFor(()=>guest.getURL().endsWith('#ordinary-click'));
      await command('lua assert(#vim.api.nvim_list_tabpages()==vim.g.blur_tabs);assert(vim.api.nvim_get_current_buf()==vim.g.blur_buffer)');
    }
    // Exercise the real host shortcut path and asynchronous OS transition too.
    for(const shortcut of ['F11','command-control-f']) {
      for(const fullscreen of [true,false]) {
        console.log('Host fullscreen shortcut',shortcut,fullscreen);
        let settled=false;
        const event=fullscreen?'enter-full-screen':'leave-full-screen';
        const listener=()=>{settled=true;};host.once(event,listener);
        try {
          if(shortcut==='command-control-f') {
            guest.sendInputEvent({type:'keyDown',keyCode:'Control',modifiers:['control']});
            guest.sendInputEvent({type:'keyDown',keyCode:'Meta',modifiers:['control','meta']});
          }
          await deliverGuestInput({host,guest,waitFor},[{type:'keyDown',keyCode:shortcut==='F11'?'F11':'F',
            modifiers:shortcut==='F11'?[]:['control','meta']}]);
          await waitFor(()=>settled && host.isFullScreen()===fullscreen);
          const before=await guest.executeJavaScript('window.blurClicks');
          await click('#blur-player');
          await waitFor(()=>guest.executeJavaScript(`window.blurClicks===${before+1}`));
          await click('#blur-link');
          await command('lua assert(#vim.api.nvim_list_tabpages()==vim.g.blur_tabs);assert(vim.api.nvim_get_current_buf()==vim.g.blur_buffer)');
          for(const keyCode of ['F11','F','Meta','Control'])guest.sendInputEvent({type:'keyUp',keyCode});
        } finally { host.removeListener(event,listener); }
      }
    }
    console.log('Host F11 and Ctrl-Cmd-F fullscreen entry/exit preserve ordinary clicks');
    // Fresh intentional modifiers still open exactly one independent tab.
    for (const modifier of ['meta','control','shift','middle']) {
      await ready();await js(`window.jusi.sendInput('i')`);await waitFor(()=>guest.executeJavaScript('document.hasFocus()'));
      const point=await guest.executeJavaScript(`(()=>{const r=document.querySelector('#blur-link').getBoundingClientRect();return {x:Math.round(r.left+5),y:Math.round(r.top+5)}})()`);
      if (modifier!=='middle') guest.sendInputEvent({type:'keyDown',keyCode:{meta:'Meta',control:'Control',shift:'Shift'}[modifier],modifiers:[modifier]});
      guest.sendInputEvent({type:'mouseDown',button:modifier==='middle'?'middle':'left',clickCount:1,...point,modifiers:modifier==='middle'?[]:[modifier]});
      guest.sendInputEvent({type:'mouseUp',button:modifier==='middle'?'middle':'left',clickCount:1,...point,modifiers:modifier==='middle'?[]:[modifier]});
      if (modifier!=='middle') guest.sendInputEvent({type:'keyUp',keyCode:{meta:'Meta',control:'Control',shift:'Shift'}[modifier]});
      await command('lua assert(vim.wait(3000,function() return #vim.api.nvim_list_tabpages()==vim.g.blur_tabs+1 end,20))');
      await command('JusiClose');
      await command('lua assert(#vim.api.nvim_list_tabpages()==vim.g.blur_tabs);assert(vim.api.nvim_get_current_buf()==vim.g.blur_buffer)');
    }
    // A pending link lookup must not dispatch after app deactivation.
    await ready();await js(`window.jusi.sendInput('i')`);await waitFor(()=>guest.executeJavaScript('document.hasFocus()'));
    const execute=guest.executeJavaScriptInIsolatedWorld.bind(guest);
    let release, pending;
    guest.executeJavaScriptInIsolatedWorld=(world,scripts,...args)=>{
      if (scripts.some(script=>script.code.startsWith('globalThis.__jusiBrowserClicks?.'))) { pending=true;return new Promise(resolve=>{release=resolve;}); }
      return execute(world,scripts,...args);
    };
    try {
      guest.sendInputEvent({type:'keyDown',keyCode:'Meta',modifiers:['meta']});
      await click('#blur-link');await waitFor(()=>pending);
      host.emit('blur');release({url:guest.getURL(),meta:true});
      await new Promise(resolve=>setImmediate(resolve));
      await command('lua assert(#vim.api.nvim_list_tabpages()==vim.g.blur_tabs)');
    } finally { guest.executeJavaScriptInIsolatedWorld=execute;guest.sendInputEvent({type:'keyUp',keyCode:'Meta'}); }
    await guest.executeJavaScript(`window.blurClicks=1;document.querySelector('#blur-player').textContent='Paused'`);
    await js(`window.jusi.sendInput('i')`);await waitFor(()=>guest.executeJavaScript('document.hasFocus()'));
    await browserReviewPause('browser-blur',host);
    console.log('Browser app-boundary resets, ordinary clicks, deliberate modified/middle clicks and pending-action cancellation passed');
    return;
  }
  if (process.env.JUSI_TEST_BROWSER_LOCATION_ONLY === '1') {
    const checkLocation=async url=>command(`lua assert(vim.wait(3000,function() return vim.b.jusi_browser_url==${JSON.stringify(url)} and vim.b.jusi_browser_name==vim.api.nvim_buf_get_name(0) and (vim.b.jusi_browser_name==${JSON.stringify(url)} or (vim.b.jusi_browser_name:sub(1,${url.length})==${JSON.stringify(url)} and vim.b.jusi_browser_name:sub(${url.length+1}):match("^ %[%d+%]$"))) end,20),'URL/name mismatch: '..vim.inspect({buffer=vim.api.nvim_get_current_buf(),url=vim.b.jusi_browser_url,name=vim.api.nvim_buf_get_name(0),error=vim.b.jusi_browser_name_error})); assert(vim.bo.buftype=='nofile')`);
    const initial=guest.getURL();
    await checkLocation(initial);
    const hash=initial.split('#')[0]+'#literal%20fragment';
    await guest.executeJavaScript(`location.hash='literal%20fragment'`,true);
    await waitFor(()=>guest.getURL()===hash);await checkLocation(hash);
    guest.navigationHistory.goBack();await waitFor(()=>guest.getURL()===initial);await checkLocation(initial);
    guest.navigationHistory.goForward();await waitFor(()=>guest.getURL()===hash);await checkLocation(hash);
    const next=new URL('/workflow-next',initial).href;
    await guest.loadURL(next);await checkLocation(next);
    guest.reload();await waitFor(()=>!guest.isLoading());await checkLocation(next);
    await guest.loadURL(new URL('/redirect',initial).href);await checkLocation(new URL('/next',initial).href);
    await guest.loadURL(initial);await checkLocation(initial);
    await command('lua vim.g.location_source=vim.api.nvim_get_current_buf(); vim.cmd("tabnew")');
    await command('JusiWebBuffer! '+initial);
    await command(`lua assert(vim.wait(3000,function() return vim.b.jusi_browser_url==${JSON.stringify(initial)} end,20)); assert(vim.api.nvim_get_current_buf()~=vim.g.location_source); assert(vim.api.nvim_buf_get_name(0)==${JSON.stringify(initial+' [2]')}); vim.g.location_duplicate=vim.api.nvim_get_current_buf()`);
    await command('lua vim.cmd("tabclose"); vim.api.nvim_buf_delete(vim.g.location_duplicate,{force=true})');
    await checkLocation(initial);
    await browserReviewPause('browser-location',host);
    console.log('Browser URL initial/hash/history/navigation/reload/redirect/duplicate-buffer cases passed');
    return;
  }
  await command(`lua local s=vim.wo.statusline; vim.cmd('split'); assert(vim.wo.statusline==s,'duplicate split status'); vim.cmd('close'); vim.cmd('tab split'); assert(vim.wo.statusline==s,'duplicate tab status'); vim.cmd('tabclose'); assert(vim.wo.statusline==s)`);
  console.log('Browser statusline split/tab lifecycle passed');
  if (process.env.JUSI_TEST_BROWSER_STATUS_ONLY === '1') return;
  await guest.executeJavaScript(`(() => {
    const box=document.createElement('section');box.id='workflow-fixture';
    box.innerHTML='<style>.reference-accessibility {position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(1px,1px,1px,1px);clip-path:inset(50%);border:0}</style><p id="volatile-word">Stable reading text</p><span class="reference-accessibility"><span>Jump up to:</span></span>';
    document.body.append(box);
  })()`);
  await command(`lua assert(vim.wait(5000,function() return table.concat(vim.api.nvim_buf_get_lines(0,0,-1,false),' '):find('Stable reading text',1,true) ~= nil end,20))`);
  try { await ready(); } catch(error) {
    console.error('Workflow readiness diagnostics', await js(`(async()=>{const s=await window.jusi.getInitialState();return {status:[...document.querySelectorAll('.native-popup-text-status,.presentation-text-status')].map(e=>({text:e.textContent,status:e.dataset.status})),views:s.attachedWebViews?.map(v=>({buffer:v.bufferId,session:v.sessionId,mode:v.mode})),windows:s.snapshot.windows}})()`));
    throw error;
  }
  await command(`lua assert(not table.concat(vim.api.nvim_buf_get_lines(0,0,-1,false),''):gsub('%s+', ''):find('Jumpupto:',1,true),'clipped accessibility label leaked into visual text')`);
  await move('Stable reading text');
  await js(`window.jusi.sendInput('<C-p>')`);
  await waitFor(()=>js(`document.querySelector('#terminal-screen')?.textContent.replaceAll(String.fromCharCode(160),' ').includes('Text paused')`));
  await command('lua assert(vim.b.jusi_auto_refresh==false)');
  writeFileSync(`.local/review/browser-paused-${process.env.JUSI_TEST_NATIVE_POPUPS==='1'?'native':'dom'}.png`, (await host.webContents.capturePage()).toPNG());
  await guest.executeJavaScript(`document.querySelector('#volatile-word').textContent='Changed while paused';window.workflowTimer=setInterval(()=>document.querySelector('#volatile-word').textContent='Paused word '+Date.now(),60)`);
  await waitFor(()=>js(`document.querySelector(${JSON.stringify(statusSelector)})?.dataset.status==='idle'`));
  await command(`lua assert(vim.b.jusi_auto_refresh==false); assert(table.concat(vim.api.nvim_buf_get_lines(0,0,-1,false),' '):find('Stable reading text',1,true));assert(not require('jusi_neovim.browser').statusline():find('Text ready',1,true))`);
  await guest.executeJavaScript(`clearInterval(window.workflowTimer);document.querySelector('#volatile-word').textContent='Manual paused refresh'`);
  await command('JusiWebRefresh');
  await command(`lua assert(vim.wait(5000,function() return table.concat(vim.api.nvim_buf_get_lines(0,0,-1,false),' '):find('Manual paused refresh',1,true) ~= nil end,20))`);
  await command('JusiWebTogglePause');
  await guest.executeJavaScript(`document.querySelector('#volatile-word').textContent='Automatic resumed text'`);
  await waitFor(()=>guest.executeJavaScript(`window.__jusiMirrorIndexMap?.some(entry=>entry?.node?.textContent==='Automatic resumed text')`));
  await ready();
  await command("lua assert(table.concat(vim.api.nvim_buf_get_lines(0,0,-1,false),' '):find('Automatic resumed text',1,true))");
  await ready();
  await command(`lua assert(vim.wait(3000,function() return require('jusi_neovim.browser').statusline():find('Text ready',1,true) ~= nil end,20));assert(vim.wo.statusline:find('jusi_neovim_browser_statusline',1,true))`);
  await waitFor(()=>js(`(() => {const status=document.querySelector(${JSON.stringify(statusSelector)}); if(!status)return false;return getComputedStyle(status.closest('.native-popup-control')||status).display==='none';})()`));
  // sendInput is RPC: unlike a physical key it can run in an inactive app.
  if (process.platform === 'darwin') app.focus({steal:true});
  host.focus();
  await waitFor(()=>host.isFocused());
  await js(`window.jusi.sendInput('i')`);
  await waitFor(()=>guest.isFocused());
  for (const paused of [true,false]) {
    await deliverGuestInput({host,guest,waitFor},[{type:'keyDown',keyCode:'P',modifiers:['control']},{type:'keyUp',keyCode:'P',modifiers:['control']}]);
    await waitFor(()=>js(`document.querySelector('#terminal-screen')?.textContent.replaceAll(String.fromCharCode(160),' ').includes('Text paused')===${paused}`));
    await command(`lua assert(vim.b.jusi_auto_refresh==${!paused})`);
    await waitFor(()=>guest.isFocused()); // Native layout acknowledgements briefly park the view.
  }
  await deliverGuestInput({host,guest,waitFor},[{type:'keyDown',keyCode:'\\',modifiers:['control']},{type:'keyDown',keyCode:'N',modifiers:['control']}]);
  await ready();
  console.log('Ctrl-P text/rich and command pause/resume toggles passed');
  await browserReviewPause('browser-workflows',host);
  const url=guest.getURL();
  await js(`window.jusi.sendInput('i')`);
  await waitFor(()=>guest.executeJavaScript('document.hasFocus()'));
  guest.sendInputEvent({type:'keyDown',keyCode:'L',modifiers:['control']});
  await command(`lua assert(vim.wait(3000,function() return vim.fn.getreg('*')==${JSON.stringify(url)} end,20),'URL not copied')`);
  guest.sendInputEvent({type:'keyDown',keyCode:'\\',modifiers:['control']});
  guest.sendInputEvent({type:'keyDown',keyCode:'N',modifiers:['control']});
  await guest.executeJavaScript(`document.querySelector('#workflow-fixture').remove()`);
  await command(`lua assert(vim.wait(5000,function() return not table.concat(vim.api.nvim_buf_get_lines(0,0,-1,false),' '):find('Automatic resumed text',1,true) end,20))`);
  // Ordinary target=_blank links keep the same document/buffer and history.
  await command('lua vim.g.workflow_source_buf=vim.api.nvim_get_current_buf();vim.g.workflow_tabs=#vim.api.nvim_list_tabpages()');
  const next=new URL('/workflow-next',url).href;
  await guest.executeJavaScript(`const a=document.createElement('a');a.id='workflow-link';a.target='_blank';a.href=${JSON.stringify(next)};a.textContent='Workflow next link';document.body.prepend(a)`);
  await command(`lua assert(vim.wait(5000,function() return table.concat(vim.api.nvim_buf_get_lines(0,0,-1,false),' '):find('Workflow next link',1,true) ~= nil end,20))`);
  await ready(); await move('Workflow next link');
  await js(`window.jusi.sendInput('<C-j>')`);
  await waitFor(()=>guest.getURL()===next);
  await ready();
  await command('lua assert(vim.api.nvim_get_current_buf()==vim.g.workflow_source_buf);assert(#vim.api.nvim_list_tabpages()==vim.g.workflow_tabs)');
  await js(`window.jusi.sendInput('i')`);await waitFor(()=>guest.executeJavaScript('document.hasFocus()'));
  await deliverGuestInput({host,guest,waitFor},[{type:'keyDown',keyCode:'O',modifiers:['control']},{type:'keyUp',keyCode:'O',modifiers:['control']}]);
  try { await waitFor(()=>guest.getURL()===url); }
  catch(error) { console.error('History input diagnostic',JSON.stringify(historyTrace));throw error; }
  await ready();
  await deliverGuestInput({host,guest,waitFor},[{type:'keyDown',keyCode:'I',modifiers:['control']},{type:'keyUp',keyCode:'I',modifiers:['control']}]);
  await waitFor(()=>guest.getURL()===next);await ready();
  // Real modified click opens a foreground Neovim link tab.
  await guest.executeJavaScript(`const a=document.createElement('a');a.href=${JSON.stringify(url)};a.textContent='Modified link';a.style='position:fixed;top:30px;left:30px;z-index:999999';a.id='modified-link';document.body.prepend(a)`);
  await ready();
  for (const modifier of ['meta','control']) {
    const previous = new Set(webContents.getAllWebContents().map(contents=>contents.id));
    // Closing the preceding tab returns input to Neovim. Enter the original
    // browser buffer through its normal mapping before the next gesture.
    await ready();
    await js("window.jusi.sendInput('i')");
    await waitFor(()=>guest.executeJavaScript('document.hasFocus()'));
    // A history commit and a ready text mirror can precede the first painted
    // frame. Wait for the actual click target to reach the compositor.
    const point = await guest.executeJavaScript(`new Promise(resolve=>requestAnimationFrame(()=>
      requestAnimationFrame(()=>{
        const link=document.querySelector('#modified-link');
        const rect=link.getBoundingClientRect(), x=Math.round(rect.left+5), y=Math.round(rect.top+5);
        resolve(document.elementFromPoint(x,y)===link ? {x,y} : null);
      })))`);
    assert.ok(point, 'modified link must be visible at the click position');
    const keyCode = modifier==='meta' ? 'Meta' : 'Control';
    await deliverGuestInput({host,guest,waitFor},[
      {type:'keyDown',keyCode,modifiers:[modifier]},
      {type:'mouseDown',button:'left',clickCount:1,...point,modifiers:[modifier]},
      {type:'mouseUp',button:'left',clickCount:1,...point,modifiers:[modifier]},
      {type:'keyUp',keyCode},
    ]);
    const tabChild = await waitFor(()=>webContents.getAllWebContents().find(c=>
      !previous.has(c.id) && c.getType()==='webview' && c.getURL()===url));
    await command('lua assert(#vim.api.nvim_list_tabpages()==vim.g.workflow_tabs+1)');
    assert.equal(BrowserWindow.getAllWindows().length,1);
    await command('JusiClose');await waitFor(()=>tabChild.isDestroyed());
    await command('lua assert(vim.api.nvim_get_current_buf()==vim.g.workflow_source_buf)');
  }
  // Text-mode Ctrl-N opens an independent tab; Ctrl-Q closes that presentation.
  await ready();
  await command(`lua assert(vim.wait(5000,function() return table.concat(vim.api.nvim_buf_get_lines(0,0,-1,false),' '):find('Modified link',1,true) ~= nil end,20),'source link lost')`);
  await move('Modified link');await js(`window.jusi.sendInput('<C-n>')`);
  await command('lua assert(vim.wait(5000,function() return #vim.api.nvim_list_tabpages()==vim.g.workflow_tabs+1 end,20))');
  await js(`window.jusi.sendInput('<C-q>')`);
  await command('lua assert(vim.wait(3000,function() return vim.api.nvim_get_current_buf()==vim.g.workflow_source_buf end,20))');
  // The original page is still the same presentation after back/forward.
  await command('lua assert(vim.api.nvim_get_current_buf()==vim.g.workflow_source_buf)');
  await js(`window.jusi.sendInput('<C-q>')`);
  await command('lua assert(vim.wait(3000,function() return not vim.api.nvim_buf_is_valid(vim.g.workflow_source_buf) end,20))');
  if (browserTraceEnabled()) {
    const directory = await browserTraceMark({fixture:'workflow-end'});
    assert(directory);
    const raw = readdirSync(directory).filter(n=>n.endsWith('.jsonl')).map(n=>readFileSync(join(directory,n),'utf8')).join('');
    const events = raw.trim().split('\n').map(line=>JSON.parse(line));
    assert(events.some(e=>e.event==='user.mark' && e.contents===guest.id), 'marker command not persisted');
    assert(events.some(e=>e.event==='link.dispatch' && e.route==='modified-mouse'), 'missing modified-click routing');
    assert(events.some(e=>e.event==='text.toggle-request'), 'missing rich toggle request');
    assert(events.some(e=>e.event==='layout'), 'missing authoritative layout');
    assert(!raw.includes('"document":') && !raw.includes('"token":'), 'native owner object leaked into trace');
    assert(!raw.includes('http://') && !raw.includes('https://'), 'raw browsing URL leaked');
    console.log('Browser trace marker, mouse dispatch, toggle and layout evidence passed:',directory);
  }
  console.log('Browser clipped-label, refresh, statusline, URL-copy, history and link-tab workflows passed');
}
