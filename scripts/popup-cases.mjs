import { EventEmitter } from 'node:events';
import { installBrowserLinks, browserLinkUrl } from '../dist/electron/browser-links.js';
import assert from 'node:assert/strict';
import { BrowserWindow, Menu, webContents } from 'electron';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { sandboxEvidence } from './sandbox-evidence.mjs';

export async function popupCases({app,win,guest,url,command,waitFor,evidence,privateMode = false}) {
  const server = createServer((req,res) => {
    if (req.url === '/start') {res.writeHead(302,{Location:'/callback'});res.end();return;}
    res.setHeader('Content-Type','text/html');
    res.end('<!doctype html><title>Untrusted page title</title><h1>Popup callback fixture</h1><p>Cross-origin authentication handoff.</p>');
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const target = `http://127.0.0.1:${server.address().port}/start`;
  const arm = () => win.webContents.executeJavaScript(`(async () => {
    const view = (await window.jusi.getInitialState()).attachedWebViews.find(v => v.surface.uri === ${JSON.stringify(url)} && !!v.privateBrowsing === ${privateMode});
    return window.jusi.armBrowserPopup(view.bufferId, view.sessionId, ${guest.id});
  })()`);
  const children = () => win.contentView.children.map(view => view.webContents).filter(contents => !contents.isDestroyed());
  try {
    await waitFor(() => guest.getURL() === url && guest.executeJavaScript('document.readyState === "complete"').catch(() => false));
    assert.equal(await guest.executeJavaScript(`window.open(${JSON.stringify(target)}) === null`),true);
    assert.equal(children().length,0);
    await guest.executeJavaScript(`window.popupMessage = null; window.addEventListener('message',e => {
      if(e.origin === ${JSON.stringify(new URL(target).origin)} && e.source === window.popupRef) window.popupMessage = e.data;
    });`);
    await command("lua require('jusi_web').last_profile_result=nil");
    await command('JusiWebAllowPopup');
    await command("lua assert(vim.wait(3000,function() local r=require('jusi_web').last_profile_result;return r and r.message:find('One popup allowed',1,true) end,20),'popup command did not arm')");
    await guest.executeJavaScript(`window.popupRef = window.open(${JSON.stringify(target)}, '_blank', 'frame=false,nodeIntegration=yes,contextIsolation=no,width=20,height=20'); void 0`);
    const child = await waitFor(() => children()[0]);
    await waitFor(() => child.getURL().endsWith('/callback') && child.executeJavaScript('document.readyState === "complete"').catch(() => false));
    assert.equal(child.session,guest.session);
    const prefs = child.getLastWebPreferences();
    assert.equal(prefs.sandbox,true);
    assert.equal(prefs.nodeIntegration,false);
    assert.equal(prefs.contextIsolation,true);
    assert.equal(prefs.webviewTag,false);
    assert.deepEqual(await child.executeJavaScript('[typeof process,typeof require,typeof window.jusi,!!window.opener]'),['undefined','undefined','undefined',true]);
    assert.equal(BrowserWindow.getAllWindows().length,1,'popup must use the existing app frame');
    await command(`lua assert(vim.api.nvim_win_get_config(0).relative == '')`);
    assert.equal(await child.executeJavaScript(`window.open(${JSON.stringify(target)}) === null`),true);
    assert.equal(children().length,1);
    assert.equal(await arm(),false,'one child per source');
    evidence.processes.push(sandboxEvidence(app,child,'native popup'));
    mkdirSync('.local/review',{recursive:true});
    writeFileSync(app.isPackaged ? '.local/review/packaged-popup.png' : '.local/review/popup.png',(await child.capturePage()).toPNG());
    await child.executeJavaScript(`window.opener.postMessage('fixture-complete', ${JSON.stringify(new URL(url).origin)}); window.close();`).catch(() => {});
    await waitFor(() => child.isDestroyed());
    await waitFor(() => guest.executeJavaScript('window.popupMessage === "fixture-complete"'));
    assert.equal(await guest.executeJavaScript('window.popupRef.closed'),true);
    assert.equal(await arm(),true);
    assert.equal(await guest.executeJavaScript(`window.open('file:///etc/passwd') === null`),true);
    assert.equal(await arm(),true);
    // Closing/navigating the source destroys its owned popup.
    await guest.executeJavaScript(`window.open(${JSON.stringify(target)}); void 0`);
    const owned = await waitFor(() => children()[0]);
    guest.reload();
    await waitFor(() => owned.isDestroyed());
    await waitFor(() => guest.executeJavaScript('document.readyState === "complete"').catch(() => false));
    assert.equal(await guest.executeJavaScript(`window.open(${JSON.stringify(target)}) === null`),true);
    assert.equal(await arm(),true);
    await guest.executeJavaScript("window.open('about:blank'); void 0");
    const blank = await waitFor(() => children()[0]);
    assert.deepEqual(await blank.executeJavaScript('[typeof process, typeof require, typeof window.jusi, !!window.opener]'), ['undefined','undefined','undefined',true]);
    assert.equal(blank.session, guest.session);
    blank.close();
    await waitFor(()=>blank.isDestroyed() && children().length===0);
    // Exercise the real native-menu handler and trusted shell/Neovim round trip.
    // Only selecting the OS menu is stubbed here; manual desktop coverage uses it.
    const originalPopup = Menu.prototype.popup;
    let menu;
    Menu.prototype.popup = function() { menu = this; };
    try {
      const sourceView = (await win.webContents.executeJavaScript('window.jusi.getInitialState()')).attachedWebViews.find(v => v.surface.uri === url && !!v.privateBrowsing === privateMode);
      assert.equal(await win.webContents.executeJavaScript(`window.jusi.openBrowserLink(${guest.id}, 'forged', ${sourceView.bufferId}, ${JSON.stringify(sourceView.sessionId)})`), false);
      // Menu capabilities cannot be replayed or used after source navigation/destruction.
      const fake = new EventEmitter();
      fake.isDestroyed = () => false;
      let token;
      const controller = installBrowserLinks(fake, win, false, false, () => sourceView, value => { token = value; });
      for (const invalid of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/plain,x', 'about:blank', 'https://a.test/\n', 'https://a.test/' + 'x'.repeat(32768)]) assert.equal(browserLinkUrl(invalid), false);
      fake.emit('context-menu', {}, { linkURL: target });
      menu.items[0].click();
      assert.deepEqual(controller.consume(token), { target: sourceView, url: target });
      assert.equal(controller.consume(token), undefined);
      fake.emit('context-menu', {}, { linkURL: target });
      menu.items[0].click();
      fake.emit('did-start-navigation', {}, url, false, true);
      assert.equal(controller.consume(token), undefined);
      fake.emit('context-menu', {}, { linkURL: target });
      menu.items[0].click();
      fake.emit('destroyed');
      assert.equal(controller.consume(token), undefined);
      await command('lua vim.g.link_test_tabs = #vim.api.nvim_list_tabpages()');
      menu = undefined;
      guest.emit('context-menu', {}, { linkURL: 'file:///etc/passwd' });
      assert.equal(menu, undefined);
      guest.emit('context-menu', {}, { linkURL: target });
      assert.ok(menu.items[0].label.includes(privateMode ? 'fresh session' : 'Neovim tab'));
      const stale = menu;
      guest.emit('did-start-navigation', {}, url, true, true);
      stale.items[0].click();
      // A subsequent menu replaces any earlier selection and authorizes its own URL.
      guest.emit('context-menu', {}, { linkURL: target });
      menu.items[0].click();
      const next = await waitFor(async () => {
        const state = await win.webContents.executeJavaScript('window.jusi.getInitialState()');
        return state.attachedWebViews.find(view => view.surface.uri === target);
      });
      assert.equal(next.privateBrowsing, privateMode);
      assert.equal(next.profile, sourceView.profile);
      assert.equal(next.textLayer, sourceView.textLayer);
      const nextGuest = await waitFor(() => webContents.getAllWebContents().find(w =>
        w.getURL().endsWith('/callback') && w !== guest && w.hostWebContents === win.webContents));
      await command('lua assert(#vim.api.nvim_list_tabpages() == vim.g.link_test_tabs + 1)');
      assert.equal(children().length, 0);
      assert.equal(await nextGuest.executeJavaScript('window.opener === null'), true);
      assert.equal(nextGuest.session === guest.session, !privateMode);
      await command('JusiClose');
      await command('lua assert(#vim.api.nvim_list_tabpages() == vim.g.link_test_tabs)');
      await waitFor(() => nextGuest.isDestroyed());
      await waitFor(async () => (await win.webContents.executeJavaScript('window.jusi.getInitialState()')).attachedWebViews.some(v => v.surface.uri === url && !!v.privateBrowsing === privateMode));
    } finally { Menu.prototype.popup = originalPopup; }
    console.log('Native link menu to Neovim tab and profile/text policy cases passed');
    console.log('Native popup opener/message/close and isolation cases passed');
  } finally {
    for(const child of children()) child.close();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
}
