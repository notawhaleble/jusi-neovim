import { resolveNativeChildPlacement, NativePlacementGate } from '../dist/electron/native-child-placement.js';
import { NativeChildOwner } from '../dist/electron/native-child-owner.js';
import { EmbeddedNvimRpcClient } from '../dist/bridge/nvim-client.js';
import { EmbeddedNvimSession } from '../dist/bridge/rpc-session.js';
import { browserPartition } from '../dist/backends/web/partition.js';
// Capability gate only: no production surface replacement or guest IPC.
import assert from 'node:assert/strict';
import { BrowserWindow, WebContentsView, session } from 'electron';
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { configureBrowserSession, secureGuest } from '../dist/electron/browser-session.js';
import { mirrorExtractorSource } from '../dist/backends/web/document-scripts.js';
import { sandboxEvidence } from './sandbox-evidence.mjs';

export async function adoptionCases({ app, evidence, waitFor }) {
  const servers = [];
  const documents = new Set();
  const windows = [];
  let child, bindingPromise;
  const client = await EmbeddedNvimRpcClient.spawn({ clean: true });
  const nvim = new EmbeddedNvimSession(client);
  const ownershipErrors = [];
  const owner = new NativeChildOwner(client, nvim, error => ownershipErrors.push(String(error)));
  const missing = bufferId => client.request('nvim_buf_is_valid', [bufferId]).then(valid => !valid);
  const fixture = async handler => {
    const server = createServer(handler);
    servers.push(server);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${server.address().port}`;
  };
  const host = title => {
    const window = new BrowserWindow({ width: 820, height: 620, title, show: true,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false } });
    windows.push(window);
    return window;
  };
  const mount = (window, view, bounds) => {
    window.contentView.addChildView(view);
    view.setBounds(bounds);
    view.setVisible(true);
  };
  try {
    nvim.start();
    await nvim.attachUi(100, 35);
    await owner.start();
    let requests = 0;
    let submission;
    const target = await fixture((req, res) => {
      if (req.url === '/submit') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          submission = { method: req.method, body };
          res.writeHead(303, { Location: '/callback' }); res.end();
        });
        return;
      }
      if (req.url === '/start') { res.writeHead(302, { Location: '/callback' }); res.end(); return; }
      if (req.url === '/callback') requests++;
      res.setHeader('Content-Type', 'text/html');
      res.end('<!doctype html><title>Retained child</title><h1>Retained popup document</h1><input aria-label="Retained input"><p id="state">Same document after parking and reattachment.</p>');
    });
    const origin = await fixture((_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end('<!doctype html><h1>Popup source</h1><p>Native-view lifecycle fixture.</p>');
    });
    for (const privateMode of [false, true]) {
      await nvim.command('JusiWebProfile adoption-test');
      await nvim.command(`${privateMode ? 'JusiWebPrivate!' : 'JusiWebBuffer'} ${origin}`);
      const sourcePresentation = await waitFor(() => nvim.getAttachedWebViews().find(view => view.url === origin));
      const sourceIdentity = nvim.getWebSession(sourcePresentation.bufferId);
      const scope = browserPartition(origin, sourceIdentity.bufferId, sourceIdentity.profile, sourceIdentity.sessionId, privateMode);
      const browserSession = session.fromPartition(scope);
      configureBrowserSession(browserSession, false);
      const prefs = { session: browserSession, sandbox: true, contextIsolation: true,
        nodeIntegration: false, nodeIntegrationInSubFrames: false, nodeIntegrationInWorker: false,
        webSecurity: true, allowRunningInsecureContent: false, webviewTag: false };
      const first = host('Jusi adoption fixture · source');
      const second = host('Jusi adoption fixture · reattached child');
      const source = new WebContentsView({ webPreferences: prefs });
      const openerContents = source.webContents;
      documents.add(openerContents);
      secureGuest(source.webContents, false);
      mount(first, source, { x: 0, y: 0, width: 800, height: 580 });
      console.log("[native-view gate] testing", privateMode ? "private session" : "persistent session");
      await source.webContents.loadURL(origin);
      source.webContents.setWindowOpenHandler(details => {
        if (![`${target}/start`, `${target}/submit`, 'about:blank'].includes(details.url) || child) return { action: 'deny' };
        return { action: 'allow', outlivesOpener: false,
          overrideBrowserWindowOptions: { webPreferences: prefs },
          createWindow: options => {
            child = new WebContentsView({ webContents: options.webContents, webPreferences: options.webPreferences });
            documents.add(child.webContents);
            secureGuest(child.webContents, false);
            bindingPromise = owner.reserve(sourceIdentity, source.webContents, child.webContents, details.url);
            bindingPromise.catch(() => {}); // Tests await it below; early failure cannot become unhandled.
            // Remain unmounted until exact Neovim ownership has been observed.
            return child.webContents;
          },
        };
      });
      await source.webContents.executeJavaScript(`window.received = []; addEventListener('message', e => {
        if (e.origin === ${JSON.stringify(target)} && e.source === window.popup) received.push(e.data);
      }); window.popup = window.open(${JSON.stringify(`${target}/start`)}, '_blank', 'nodeIntegration=yes,contextIsolation=no'); void 0;`);
      await waitFor(() => child?.webContents.getURL() === `${target}/callback`);
      const binding = await bindingPromise;
      assert.equal(binding.document, child.webContents);
      assert.ok(!nvim.getAttachedWebViews().some(view => view.bufferId === binding.bufferId), 'DOM backend must not replay a reserved child');
      const boundSession = nvim.getWebSession(binding.bufferId);
      assert.equal(boundSession.nativeChild, binding.token);
      assert.equal(boundSession.privateBrowsing, privateMode);
      assert.equal(boundSession.textLayer, privateMode ? 'off' : 'auto');
      const contents = child.webContents;
      await waitFor(() => contents.executeJavaScript('document.readyState === "complete"'));
      const id = contents.id;
      const requestCount = requests;
      assert.equal(contents.session, browserSession);
      assert.equal(contents.session.isPersistent(), !privateMode);
      assert.deepEqual(await contents.executeJavaScript('[typeof process, typeof require, typeof window.jusi, !!window.opener]'),
        ['undefined', 'undefined', 'undefined', true]);
      assert.equal(await contents.executeJavaScript(`window.open(${JSON.stringify(target)}) === null`), true);
      await contents.executeJavaScript("window.retained = {value: 42}; document.querySelector('input').value = 'retained input'; sessionStorage.setItem('retained', 'yes')");
      const placementGate = new NativePlacementGate(child);
      let generation = placementGate.invalidate();
      const placement = () => resolveNativeChildPlacement({ binding, session: nvim.getWebSession(binding.bufferId),
        snapshot: nvim.getSnapshot(), viewport: { x: 0, y: 0, width: 800, height: 560,
          cellWidth: 8, cellHeight: 16, zoom: 1 }, generation, trustedUiVisible: false });
      const initialPlacement = await waitFor(placement);
      second.contentView.addChildView(child);
      assert.equal(placementGate.apply(initialPlacement), true);
      contents.focus();
      await waitFor(() => contents.isFocused());
      evidence.processes.push(sandboxEvidence(app, contents, privateMode ? 'private native-view child' : 'persistent native-view child'));
      generation = placementGate.invalidate();
      second.contentView.removeChildView(child);
      await contents.executeJavaScript(`opener.postMessage('parked', ${JSON.stringify(origin)})`);
      await waitFor(() => source.webContents.executeJavaScript('received.includes("parked")'));
      // Move the same view to another host and resize; neither changes document identity.
      first.contentView.removeChildView(source);
      first.contentView.addChildView(child);
      assert.equal(placementGate.apply(initialPlacement), false, 'stale geometry cannot reveal parked child');
      assert.equal(placementGate.apply(await waitFor(placement)), true);
      const blocker = await client.request('nvim_exec_lua', [`return vim.api.nvim_open_win(vim.api.nvim_create_buf(false,true), false,
        {relative='editor',row=0,col=12,width=40,height=30,zindex=100,style='minimal'})`, []]);
      generation = placementGate.invalidate();
      await waitFor(() => nvim.getSnapshot().windows.some(w => w.id === blocker && w.gridBounds));
      assert.equal(placement(), null, 'overlapping float parks browser content');
      await client.request('nvim_win_close', [blocker, true]);
      assert.equal(placementGate.apply(await waitFor(placement)), true);
      second.destroy();
      assert.equal(contents.id, id);
      assert.equal(requests, requestCount);
      assert.deepEqual(await contents.executeJavaScript('[retained.value, document.querySelector("input").value, sessionStorage.getItem("retained"), !!opener]'),
        [42, 'retained input', 'yes', true]);
      const text = await contents.executeJavaScript(mirrorExtractorSource());
      assert.ok(text.lines.some(line => line.text.includes('Retained popup document')));
      assert.ok(!text.lines.some(line => line.text.includes('retained input')), 'Input values stay outside extracted text');
      generation = placementGate.invalidate();
      await client.request('nvim_ui_try_resize', [80, 28]);
      const resizedPlacement = await waitFor(() => {
        const value = placement();
        return value && value.bounds.width < initialPlacement.bounds.width && value;
      });
      assert.equal(placementGate.apply(resizedPlacement), true);
      generation = placementGate.invalidate();
      await nvim.command('tabnew');
      await waitFor(() => placement() === null);
      assert.equal(placementGate.apply(placement()), false);
      await nvim.command('tabclose');
      assert.equal(placementGate.apply(await waitFor(placement)), true);
      const bounds = child.getBounds();
      assert.deepEqual(bounds, placement().bounds);
      writeFileSync(app.isPackaged ? '.local/review/packaged-adoption.png' : '.local/review/adoption.png',
        (await contents.capturePage()).toPNG());
      await contents.executeJavaScript(`opener.postMessage('reattached', ${JSON.stringify(origin)}); window.close();`).catch(() => {});
      await waitFor(() => contents.isDestroyed());
      await waitFor(() => missing(binding.bufferId));
      await waitFor(() => source.webContents.executeJavaScript('received.includes("reattached") && popup.closed'));
      child = undefined;
      // about:blank uses Chromium inheritance; adopting must retain the real opener.
      await source.webContents.executeJavaScript("window.popup = window.open('about:blank'); void 0");
      const blank = await waitFor(() => child?.webContents);
      const blankBinding = await bindingPromise;
      const floatWindow = await client.request("nvim_get_current_win", []);
      const floatConfig = await client.request("nvim_win_get_config", [floatWindow]);
      assert.equal(floatConfig.relative, "");
      assert.equal(await client.request("nvim_win_get_buf", [floatWindow]), blankBinding.bufferId);
      assert.deepEqual(await blank.executeJavaScript('[typeof process, typeof require, typeof window.jusi, !!opener]'),
        ['undefined', 'undefined', 'undefined', true]);
      assert.equal(blank.session, browserSession);
      await client.request("nvim_win_close", [floatWindow, true]);
      await waitFor(() => blank.isDestroyed());
      child = undefined;
      // Preserve POST + redirect semantics: a URL-only replacement would silently turn this into GET.
      submission = undefined;
      await source.webContents.executeJavaScript(`{
        const form = document.createElement('form'); form.method = 'POST'; form.target = '_blank'; form.rel = 'opener';
        form.action = ${JSON.stringify(`${target}/submit`)};
        const field = document.createElement('input'); field.name = 'fixture'; field.value = 'literal & value';
        form.appendChild(field); document.body.appendChild(form); form.submit(); form.remove();
      }`);
      const posted = await waitFor(() => child?.webContents);
      const postedBinding = await bindingPromise;
      await waitFor(() => posted.getURL() === `${target}/callback`);
      assert.deepEqual(submission, { method: 'POST', body: 'fixture=literal+%26+value' });
      assert.equal(await posted.executeJavaScript('!!opener'), true);
      posted.close();
      await waitFor(() => posted.isDestroyed());
      await waitFor(() => missing(postedBinding.bufferId));
      child = undefined;
      // Source destruction must clean an unmounted child too; no URL reconstruction.
      await source.webContents.executeJavaScript(`window.popup = window.open(${JSON.stringify(`${target}/start`)}); void 0`);
      const pending = await waitFor(() => child?.webContents);
      await waitFor(() => pending.getURL() === `${target}/callback`);
      const pendingBinding = await bindingPromise;
      if (privateMode) {
        // Neovim 0.11 can leave a noncurrent underlying buffer intact while a
        // float is current. Exercise actual source closure from its own window.
        await client.request("nvim_set_current_win", [sourcePresentation.windowId]);
        await client.request("nvim_buf_delete", [sourceIdentity.bufferId, { force: true }]);
        assert.equal(await missing(sourceIdentity.bufferId), true);
      }
      else source.webContents.close();
      await waitFor(() => pending.isDestroyed());
      await waitFor(() => missing(pendingBinding.bufferId));
      if (!await missing(sourceIdentity.bufferId)) await client.request("nvim_buf_delete", [sourceIdentity.bufferId, { force: true }]);
      if (!openerContents.isDestroyed()) openerContents.close();
      assert.equal(owner.size, 0);
      child = undefined;
      first.destroy();
      await client.request("nvim_ui_try_resize", [100, 35]);
    }
    assert.deepEqual(ownershipErrors, []);
    console.log('Native-view adoption and Neovim ownership/close gates passed');
  } finally {
    owner.dispose();
    await nvim.dispose();
    // Removing a view or closing its host is not a disposal contract; explicitly close every document.
    for (const contents of documents) if (!contents.isDestroyed()) contents.close();
    for (const window of windows) if (!window.isDestroyed()) window.destroy();
    for (const server of servers) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  }
}
