import { markHintCases, browserInteractionCases, browserCommandCases, browserFocusCases, browserReviewPause } from './browser-interaction-cases.mjs';
import assert from 'node:assert/strict';
import { BrowserWindow, webContents } from 'electron';
import { createServer } from 'node:http';
import { writeFileSync, mkdirSync } from 'node:fs';
import { sandboxEvidence } from './sandbox-evidence.mjs';

export async function integratedNativePopupCases({ app, waitFor, evidence }) {
  const server = createServer((req, res) => {
    if (req.url === '/redirect') { res.writeHead(302, {Location:'/next'}); res.end(); return; }
    res.setHeader('Content-Type', 'text/html');
    res.end(req.url === '/child' ? '<!doctype html><title>Untrusted title</title><h1>Floating browser popup</h1><input aria-label="Popup input"><p>This document retains its opener.</p>'
      : '<!doctype html><h1>Popup source</h1>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const host = await waitFor(() => BrowserWindow.getAllWindows().find(window => window.isVisible()));
  const js = code => host.webContents.executeJavaScript(code);
  const command = value => js(`window.jusi.runCommand(${JSON.stringify(value)})`);
  const bar = () => js(`!!document.querySelector('.native-popup-control')`);
  try {
    await waitFor(() => js('!!window.jusi').catch(() => false));
    await command(`JusiWebBuffer ${origin}`);
    const source = await waitFor(() => webContents.getAllWebContents().find(w => w.getType() === 'webview' && w.getURL() === origin + '/'));
    await waitFor(() => js(`document.querySelector('.presentation-text-status')?.dataset.status === 'ready'`));
    if (process.env.JUSI_TEST_POPUP_GRANT_ONLY === '1') {
      const verify = async opener => {
        const request = () => opener.executeJavaScript(`window.open('${origin}/child') !== null`);
        const focus = async () => {
          host.focus();
          await js("window.jusi.sendInput('i')");
          await waitFor(() => opener.isFocused());
        };
        await command('lua require("jusi_web").last_profile_result=nil');
        await command('JusiWebAllowPopup!');
        await command("lua assert(vim.wait(3000,function() local r=require('jusi_web').last_profile_result; return r and r.ok and r.message:find('while this page is focused',1,true) end,20))");
        await focus();
        if (process.env.JUSI_TEST_REVIEW === 'page-popups') {
          await opener.executeJavaScript(`document.body.insertAdjacentHTML('afterbegin', '<button id="copy-url">Copy URL</button><input id="review-url" aria-label="Paste URL" value="Replace me"><button id="review-open">Open popup</button>');
            document.querySelector('#copy-url').onclick=()=>navigator.clipboard.writeText(location.href);
            document.querySelector('#review-open').onclick=()=>window.open('/child'); void 0`);
          await browserReviewPause('page-popups', host);
        }
        for (let attempt = 0; attempt < 2; attempt++) {
          const ids = new Set(webContents.getAllWebContents().map(w => w.id));
          assert.equal(await request(), true);
          const popup = await waitFor(() => webContents.getAllWebContents().find(w => !ids.has(w.id) && w.getURL() === origin+'/child'));
          await waitFor(() => host.contentView.children.some(v => v.webContents?.id === popup.id && v.getVisible()));
          assert.equal(popup.session, opener.session);
          assert.equal(await request(), false, 'one active child per opener');
          if (attempt === 1) return popup;
          popup.close();
          await waitFor(() => popup.isDestroyed());
          await focus();
        }
      };
      const popup = await verify(source);
      const nested = await verify(popup);
      nested.close();
      await waitFor(() => nested.isDestroyed());
      popup.reload();
      await waitFor(() => popup.executeJavaScript('document.readyState === "complete"').catch(() => false));
      popup.focus();
      await waitFor(() => popup.isFocused());
      assert.equal(await popup.executeJavaScript(`window.open('${origin}/child') === null`), true);
      console.log('Page popup grant passed for webview and retained child, repeated opens, child limit and reload');
      return;
    }
    const open = async () => {
      assert.equal(await js(`(async () => { const v = (await window.jusi.getInitialState()).attachedWebViews.find(v => v.bufferId);
        return window.jusi.armBrowserPopup(v.bufferId, v.sessionId, ${source.id}); })()`), true);
      await source.executeJavaScript(`window.popup = window.open('${origin}/child'); void 0`);
      return await waitFor(() => webContents.getAllWebContents().find(w => w.getURL() === origin + '/child'));
    };
    const child = await open();
    await waitFor(bar);
    const view = await waitFor(() => host.contentView.children.find(v => v.webContents?.id === child.id));
    await waitFor(() => view.getVisible());
    await waitFor(() => js(`document.querySelector('.native-popup-text-status')?.dataset.status === 'ready'`));
    await command(`lua assert(table.concat(vim.api.nvim_buf_get_lines(0,0,-1,false),' '):find('Floating browser popup',1,true))`);
    if (process.env.JUSI_TEST_HINTS_ONLY === '1') { await markHintCases({host,guest:child,command,waitFor});return; }
    if (process.env.JUSI_TEST_POPUP_STABILITY === '1') {
      const setVisible = view.setVisible.bind(view);
      let hides = 0;
      view.setVisible = value => { if (!value) hides++; return setVisible(value); };
      try {
        child.focus();
        await waitFor(() => child.isFocused());
        await child.executeJavaScript(`window.stabilityTimer=setInterval(()=>document.querySelector('p').textContent='Changing game score '+Date.now(),100)`);
        await new Promise(resolve => setTimeout(resolve, 3500));
        assert.equal(hides, 0, 'Text refresh must not hide an unchanged native placement');
        assert.equal(child.isFocused(), true);
        await child.executeJavaScript('clearInterval(window.stabilityTimer)');
        // Editor escape and re-entry must work even after continuous text churn.
        child.sendInputEvent({type:'keyDown',keyCode:'\\',modifiers:['control']});
        child.sendInputEvent({type:'keyUp',keyCode:'\\',modifiers:['control']});
        child.sendInputEvent({type:'keyDown',keyCode:'N',modifiers:['control']});
        child.sendInputEvent({type:'keyUp',keyCode:'N',modifiers:['control']});
        await waitFor(() => host.webContents.isFocused());
        await js(`window.jusi.sendInput('i')`);
        await waitFor(() => child.isFocused());
        child.sendInputEvent({type:'keyDown',keyCode:'Q',modifiers:['control']});
        child.sendInputEvent({type:'keyUp',keyCode:'Q',modifiers:['control']});
        await waitFor(() => child.isDestroyed());
        console.log('Continuous text refresh preserves visibility/focus; editor escape, re-entry and Ctrl-Q passed');
      } finally { view.setVisible = setVisible; }
      return;
    }
    if (process.env.JUSI_TEST_FOCUS_ONLY === '1') {
      const trace=[];
      const record=event=>{trace.push({event,time:Date.now(),visible:view.getVisible(),focused:!child.isDestroyed() && child.isFocused()});if(trace.length>100)trace.shift();};
      const setVisible=view.setVisible.bind(view);
      view.setVisible=value=>{record(`visible:${value}`);return setVisible(value);};
      child.on('focus',()=>record('focus'));child.on('blur',()=>record('blur'));
      const restoreFocusMethods=[];
      for (const [name,contents] of [['shell',host.webContents],['child',child]]) {
        const original=contents.focus;
        restoreFocusMethods.push(()=>{contents.focus=original;});
        const focus=original.bind(contents);
        contents.focus=()=>{record(`${name}.focus ${new Error().stack?.split('\n').slice(2,5).join(' | ')}`);return focus();};
      }
      try {
        await browserFocusCases({host,guest:child,waitFor,beforeRetainedFocus:async()=>{
          // Delay this shell frame acknowledgement to exercise the known parking gap.
          await js(`(() => {
            const original=window.requestAnimationFrame;
            window.requestAnimationFrame=callback=>{
              window.requestAnimationFrame=original;
              return original(()=>setTimeout(()=>callback(performance.now()),150));
            };
          })()`);
          await js(`window.jusi.invalidateNativeViewport()`);
          record('forced-invalidation');
        }});
        // Emulate focus delivery interrupted by a new shell placement. The next
        // acknowledged placement must retain and deliver the same request.
        const originalFocus=child.focus.bind(child);
        let interrupted=false;
        child.focus=()=>{
          if (!interrupted) {
            interrupted=true;record('interrupted-focus-delivery');
            void js('window.jusi.invalidateNativeViewport()');return;
          }
          return originalFocus();
        };
        await js(`window.jusi.sendInput('i')`);
        await waitFor(()=>child.executeJavaScript('document.hasFocus()'));
        assert.equal(interrupted,true);
        child.focus=originalFocus;
        await child.executeJavaScript(`document.querySelector('input').focus()`);
        for(let index=0;index<5;index++) {
          await child.executeJavaScript(`document.querySelector('p').textContent=${JSON.stringify('Focus refresh ')}+${index}`);
          await command(`lua assert(vim.wait(3000,function() return table.concat(vim.api.nvim_buf_get_lines(0,0,-1,false),' '):find('Focus refresh ${index}',1,true) ~= nil end,20))`);
          await waitFor(()=>view.getVisible() && child.isFocused());
        }
        writeFileSync('.local/review/native-focus-trace.json',JSON.stringify(trace,null,2));
        console.log('Focused native interrupted focus delivery, chord/typing and five text-refresh cases passed');
      } catch(error) { console.error('Native focus trace',JSON.stringify(trace));throw error; }
      finally { for (const restore of restoreFocusMethods) restore(); view.setVisible=setVisible; }
      return;
    }
    if (process.env.JUSI_TEST_BROWSER_DUPLICATE_ONLY !== '1' && process.env.JUSI_TEST_BROWSER_MODIFIERS_ONLY !== '1') await browserCommandCases({host,guest:child,waitFor,statusSelector:'.native-popup-text-status'});
    if (process.env.JUSI_TEST_EDITING_ONLY === '1') return;
    if (process.env.JUSI_TEST_BROWSER_WORKFLOW === '1') { const {browserWorkflowCases}=await import('./browser-workflow-cases.mjs');await browserWorkflowCases({host,guest:child,command,waitFor,statusSelector:'.native-popup-text-status',openDuplicate:async()=>{
      const existing=new Set(webContents.getAllWebContents().map(w=>w.id));
      await command('tabnew');await command(`JusiWebBuffer ${origin}`);
      const otherSource=await waitFor(()=>webContents.getAllWebContents().find(w=>!existing.has(w.id) && w.getURL()===origin+'/'));
      await waitFor(()=>js(`document.querySelector('.web-view-box:not(.web-view-box--parked) .presentation-text-status')?.dataset.status==='ready'`));
      await command('JusiWebAllowPopup');
      await otherSource.executeJavaScript(`window.open(${JSON.stringify(child.getURL())});void 0`);
      const duplicate=await waitFor(()=>webContents.getAllWebContents().find(w=>!existing.has(w.id) && w.getURL()===child.getURL()));
      await waitFor(()=>host.contentView.children.some(v=>v.webContents?.id===duplicate.id && v.getVisible()));
      const bufferId=await js(`Number(document.querySelector('.native-popup-control').dataset.bufferId)`);
      await command(`lua vim.api.nvim_set_current_win(vim.fn.bufwinid(${bufferId}))`);
      return duplicate;
    }});return; }
    await child.executeJavaScript(`document.querySelector('p').textContent = 'Updated popup text'`);
    await command(`lua assert(vim.wait(3000, function() return table.concat(vim.api.nvim_buf_get_lines(0,0,-1,false),' '):find('Updated popup text',1,true) ~= nil end, 20))`);
    assert.equal(BrowserWindow.getAllWindows().length, 1, 'popup must remain in main app window');
    assert.equal(child.session, source.session);
    assert.deepEqual(await child.executeJavaScript('[typeof process, typeof require, typeof window.jusi, !!opener]'),
      ['undefined', 'undefined', 'undefined', true]);
    await waitFor(() => js(`document.querySelector('.native-popup-control')?.textContent.includes(${JSON.stringify(origin)})`));
    assert.equal(await js(`window.jusi.acknowledgeNativePopup('forged', 1)`), false);
    assert.equal(await js(`window.jusi.closeNativePopup('forged')`), false);
    assert.equal(await js(`window.jusi.retryNativeText('forged')`), false);
    await child.executeJavaScript(`document.querySelector('input').value = 'retained'; window.retained = 42`);
    await command('tabnew');
    await waitFor(() => !view.getVisible());
    await command('tabclose');
    await waitFor(() => view.getVisible());
    assert.equal(await child.executeJavaScript('retained'), 42);
    host.setSize(1050, 720);
    await waitFor(() => view.getVisible());
    const bounds = view.getBounds();
    assert.ok(bounds.x >= 0 && bounds.y > 0 && bounds.width > 100);
    const controls = await js(`(() => { const r = document.querySelector('.native-popup-control').getBoundingClientRect(); return {bottom:r.bottom,left:r.left,width:r.width}; })()`);
    assert.ok(controls.bottom <= bounds.y + 1, 'debug controls leave content clear; normal controls are hidden');
    await command(`lua assert(vim.api.nvim_win_get_config(0).relative == '', 'Popup must use ordinary split')`);
    const blocker = await js(`window.jusi.runCommand("lua vim.g.native_test_blocker = vim.api.nvim_open_win(vim.api.nvim_create_buf(false,true), false, {relative='editor',row=5,col=10,width=60,height=15,zindex=100,style='minimal'})")`);
    await waitFor(() => !view.getVisible());
    await command('lua vim.api.nvim_win_close(vim.g.native_test_blocker,true)');
    await waitFor(() => view.getVisible());
    host.focus(); child.focus();
    await waitFor(() => child.isFocused());
    await child.executeJavaScript(`document.querySelector('input').focus()`);
    child.sendInputEvent({ type: 'keyDown', keyCode: '\\', modifiers: ['control'] });
    child.sendInputEvent({ type: 'keyUp', keyCode: '\\', modifiers: ['control'] });
    child.sendInputEvent({ type: 'keyDown', keyCode: 'N', modifiers: ['control'] });
    child.sendInputEvent({ type: 'keyUp', keyCode: 'N', modifiers: ['control'] });
    await waitFor(() => host.webContents.isFocused());
    await waitFor(() => child.executeJavaScript(`!!document.getElementById("jusi-neovim-mirror-overlay")`));
    await waitFor(() => view.getVisible());
    await browserInteractionCases({ host, guest: child, command, waitFor, statusSelector: '.native-popup-text-status' });
    await js(`window.jusi.sendInput('i')`);
    await waitFor(() => child.isFocused());
    assert.equal(await child.executeJavaScript("document.querySelector('input').value"), 'retained');
    await child.executeJavaScript(`document.querySelector('p').textContent = 'Focused refresh'`);
    await command(`lua assert(vim.wait(3000, function() return table.concat(vim.api.nvim_buf_get_lines(0,0,-1,false),' '):find('Focused refresh',1,true) ~= nil end, 20))`);
    await waitFor(() => js(`document.querySelector('.native-popup-text-status')?.dataset.status === 'ready'`));
    try { await waitFor(() => view.getVisible() && child.isFocused()); }
    catch(error) {
      console.error('Refresh focus diagnostics', {visible:view.getVisible(),nativeFocused:child.isFocused(),
        documentFocused:await child.executeJavaScript('document.hasFocus()'),
        shell:await js('({focused:document.hasFocus(),active:document.activeElement?.tagName})')});
      throw error;
    }
    mkdirSync('.local/review', { recursive: true });
    writeFileSync('.local/review/native-popup.png', (await host.capturePage()).toPNG());
    evidence.processes.push(sandboxEvidence(app, child, 'integrated native popup'));
    writeFileSync('.local/review/native-popup-sandbox.json', JSON.stringify(evidence, null, 2));
    if (process.env.JUSI_TEST_MANUAL === '1') {
      host.focus(); child.focus();
      console.log('Manual review: type in the popup, then press Ctrl-Q.');
      const deadline = Date.now() + 120000;
      while (!child.isDestroyed() && Date.now() < deadline) await new Promise(r => setTimeout(r, 200));
      assert.ok(child.isDestroyed(), 'Manual close did not complete');
    } else await waitFor(() => js(`(() => { const button = document.querySelector('.native-popup-control button:last-child'); if (!button) return false; button.click(); return true; })()`));
    await waitFor(() => child.isDestroyed());
    await waitFor(async () => !await bar());
    assert.equal(await source.executeJavaScript('popup.closed'), true);
    await command(`lua vim.b.jusi_text_layer = 'off'`);
    const second = await open();
    await waitFor(bar);
    await waitFor(() => js(`document.querySelector('.native-popup-text-status')?.dataset.status === 'disabled'`));
    assert.equal(await second.executeJavaScript('typeof window.__jusiDocumentChanges'), 'undefined');
    await second.executeJavaScript('window.close()').catch(() => {});
    await waitFor(() => second.isDestroyed());
    console.log('Integrated native popup placement, trusted controls and close passed');
  } catch (error) {
    console.error('native popup state', await js(`(async () => { const s = await window.jusi.getInitialState(); return JSON.stringify({generation:s.nativeLayoutGeneration,windows:s.snapshot.windows,cmdline:s.cmdline,messages:s.messages,popupmenu:s.popupmenu}); })()`).catch(() => 'unavailable'));
    throw error;
  } finally {
    host.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
}
