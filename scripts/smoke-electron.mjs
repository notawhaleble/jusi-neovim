import { markHintCases, browserInteractionCases, browserCommandCases } from './browser-interaction-cases.mjs';
import { integratedNativePopupCases } from "./native-popup-cases.mjs";
import { adoptionCases } from "./adoption-cases.mjs";
import { popupCases } from "./popup-cases.mjs";
// Integration harness: real sandboxed guests, loopback fixtures, disposable browser profile.
import { app, BrowserWindow, webContents, ipcMain } from "electron";
import { sandboxEvidence } from "./sandbox-evidence.mjs";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const browserTrace=[];
if (process.env.JUSI_TEST_BROWSER_TRACE==='1') {
  const {NativePopupCoordinator}=await import('../dist/electron/native-popups.js');
  for(const method of ['setMode','park','acknowledge','enter']) {
    const original=NativePopupCoordinator.prototype[method];
    NativePopupCoordinator.prototype[method]=function(...args) {
      browserTrace.push({method,args:method==='setMode'?[args[1],args[2]]:method==='park'?[]:args,
        children:[...this.children].map(c=>({visible:c.visible,mode:c.mode,pending:c.focusWindow,focused:!c.contents.isDestroyed()&&c.contents.isFocused()}))});
      if(browserTrace.length>100)browserTrace.shift();return original.apply(this,args);
    };
  }
}

// Opt-in bounded diagnostics for frame/native-viewport ordering failures.
const frameTrace = [];
if (process.env.JUSI_TEST_FRAME_TRACE === '1') {
  const record = value => { frameTrace.push(value); if (frameTrace.length > 100) frameTrace.shift(); };
  const {EmbeddedNvimSession} = await import('../dist/bridge/rpc-session.js');
  const start = EmbeddedNvimSession.prototype.start;
  EmbeddedNvimSession.prototype.start = function() {
    this.client.onNotification(n => {
      if (n.method === 'redraw') record({redraw:n.args.map(e=>e[0])});
      else if (n.method === 'jusi:layout') record({layout:n.args[0]?.type});
    });
    this.onStateChanged(s=>record({frame:s.screen.rows,windows:s.snapshot.windows.map(w=>w.id)}));
    return start.call(this);
  };
  const handle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, listener) => handle(channel, async (...args) => {
    const result = await listener(...args);
    if (channel === 'jusi:native-viewport') record({viewport:args[1],accepted:result});
    if (channel === 'jusi:ack-native-popup') record({ack:args[2],accepted:result});
    return result;
  });
}

// Electron otherwise shows a blocking native error dialog, hiding the failure
// from automation until the outer watchdog kills the process.
process.on('uncaughtException', error => {
  console.error('Uncaught Electron smoke exception:', error.stack ?? error);
  app.exit(1);
});

app.on("will-quit", event => event.preventDefault());
const scratch = process.env.JUSI_TEST_PROFILE_ROOT;
assert.ok(scratch, "Run through scripts/run-smoke-electron.mjs so profile cleanup happens after Chromium exits");
app.setPath("userData", join(scratch, "profile"));
process.env.JUSI_NVIM_CLEAN = "1";
process.env.JUSI_STARTUP_DEMO = "0";
const server = createServer((request, response) => {
  if (request.url === "/redirect") { response.writeHead(302, { Location: "/next" }); response.end(); return; }
  response.writeHead(200, { "Content-Type": "text/html", "Set-Cookie": "jusi_fixture=remembered; SameSite=Lax" });
  response.end('<!doctype html><h1>Presentation fixture</h1><p>Rich content and selectable text.</p><input aria-label="Native input">');
});
const timeout = setTimeout(() => { console.error("Electron smoke timed out"); app.exit(1); }, process.env.JUSI_TEST_REVIEW ? 600000 : process.env.JUSI_TEST_BROWSER_FULLSCREEN_ONLY === '1' ? 90000 : process.env.JUSI_TEST_MANUAL === "1" ? 180000 : process.env.JUSI_TEST_ALPHA_TIMING === "1" ? 120000 : 30000);
const waitFor = async (fn) => {
  for (let n = 0; n < 200; n++) {
    const result = await fn();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error("Condition did not become true");
};
async function main() {
let win;
const evidence = { collectedAt: new Date().toISOString(), platform: process.platform, arch: process.arch, packaged: app.isPackaged,
  electron: process.versions.electron, chromium: process.versions.chrome, processes: [] };
try {
  assert.equal(app.isPackaged, process.env.JUSI_TEST_EXPECT_PACKAGED === "1");
  for (const flag of ["no-sandbox", "disable-setuid-sandbox", "disable-seccomp-filter-sandbox"]) {
    assert.equal(app.commandLine.hasSwitch(flag), false, `Forbidden test switch: ${flag}`);
  }
  if (process.env.JUSI_TEST_EXTRACTION_ONLY === "1") {
    await app.whenReady();
    const { extractionPerformanceCases } = await import('./extraction-performance-cases.mjs');
    await extractionPerformanceCases({app});
    return;
  }
  if (process.env.JUSI_TEST_ADOPTION_ONLY === "1") {
    await app.whenReady();
    mkdirSync(".local/review", { recursive: true });
    await adoptionCases({ app, evidence, waitFor });
    writeFileSync(".local/review/adoption-sandbox.json", JSON.stringify(evidence, null, 2) + "\n");
    return;
  }
  if (process.env.JUSI_TEST_STARTUP_ONLY === "1") {
    const created = new Promise(resolve => app.once('browser-window-created', (_event, window) => resolve(window)));
    await import("../dist/electron/main.js");
    win = await created;
    assert.equal(win.isVisible(), false, 'startup window starts hidden');
    await new Promise(resolve => win.once('show', resolve));
    const frame = await win.webContents.executeJavaScript(`({
      background: document.documentElement.style.getPropertyValue('--bg'),
      grids: document.querySelectorAll('.grid-layer').length
    })`);
    assert.ok(frame.background && frame.grids > 0, 'first visible frame has Neovim colors and grids');
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'I'});
    win.webContents.sendInputEvent({type:'keyUp',keyCode:'I'});
    await waitFor(() => win.webContents.executeJavaScript("window.jusi.getInitialState().then(s => s.screen.mode.name === 'insert')"));
    console.log('First visible frame had Neovim colors, grids and working keyboard input');
    return;
  }
  if (process.env.JUSI_TEST_ALPHA_TIMING === "1") {
    await import("../dist/electron/main.js");
    const { alphaTimingCases } = await import('./alpha-timing-cases.mjs');
    await alphaTimingCases({waitFor});return;
  }
  if (process.env.JUSI_TEST_NATIVE_POPUPS === "1") {
    process.env.JUSI_NATIVE_POPUPS = "1";
    await import("../dist/electron/main.js");
    if (process.env.JUSI_TEST_POPUP_SITE) {
      const {browserPopupStabilityCases} = await import('./browser-popup-stability-cases.mjs');
      await browserPopupStabilityCases({waitFor});
      return;
    }
    await integratedNativePopupCases({ app, waitFor, evidence });
    return;
  }
  await import("../dist/electron/main.js");
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  win = await waitFor(() => BrowserWindow.getAllWindows().find(window => window.isVisible()));
  await waitFor(() => win.webContents.executeJavaScript('typeof window.jusi === "object"').catch(() => false));
  const command = async value => win.webContents.executeJavaScript(`window.jusi.runCommand(${JSON.stringify(value)})`);
  if (process.env.JUSI_TEST_DISPLAY_ONLY === '1') {
    const { nvimDisplayCases } = await import('./nvim-display-cases.mjs');
    await nvimDisplayCases({win,command,waitFor});return;
  }
  if (process.env.JUSI_TEST_BROWSER_WORKFLOW !== '1' && process.env.JUSI_TEST_EDITING_ONLY !== '1' && process.env.JUSI_TEST_HINTS_ONLY !== '1') {
    const { nvimIntegrationCases } = await import('./nvim-integration-cases.mjs');
    await nvimIntegrationCases({win, command, waitFor});
    const { nvimMouseCases } = await import("./nvim-mouse-cases.mjs");
    await nvimMouseCases({win, command, waitFor});
    const { nvimOverlayCases } = await import("./nvim-overlay-cases.mjs");
    await nvimOverlayCases({win, command, waitFor});
    const { nvimDisplayCases } = await import('./nvim-display-cases.mjs');
    await nvimDisplayCases({win, command, waitFor});
    if (process.env.JUSI_TEST_NVIM_ONLY === "1") return;
  }
  const status = async (expected, target = url) => waitFor(() => win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.web-view-box:not(.web-view-box--parked)')).some(x => x.querySelector("webview")?.dataset.currentUrl === ${JSON.stringify(target)} && x.querySelector(".presentation-text-status")?.dataset.status === ${JSON.stringify(expected)})`));
  await command(`JusiWebBuffer ${url}`);
  await status("ready");
  let guest = webContents.getAllWebContents().find(contents => contents.getType() === "webview" && contents.getURL() === url);
  assert.ok(guest);
  if (process.env.JUSI_TEST_HINTS_ONLY === '1') { await markHintCases({host:win,guest,command,waitFor});return; }
  if (process.env.JUSI_TEST_EDITING_ONLY === '1') {
    await win.webContents.executeJavaScript("window.jusi.sendInput('i')");
    await browserCommandCases({host:win,guest,waitFor});return;
  }
  if (process.env.JUSI_TEST_INTERACTION_ONLY === "1") {
    await browserInteractionCases({host:win,guest,command,waitFor,statusSelector:'.web-view-box:not(.web-view-box--parked) .presentation-text-status'});return;
  }
  if (process.env.JUSI_TEST_BROWSER_WORKFLOW === "1") {
    const {browserWorkflowCases}=await import('./browser-workflow-cases.mjs');
    await browserWorkflowCases({host:win,guest,command,waitFor,statusSelector:'.web-view-box:not(.web-view-box--parked) .presentation-text-status'});return;
  }
  if (process.env.JUSI_TEST_ALPHA_WORKFLOW === "1") {
    const {alphaWorkflowCases}=await import('./alpha-workflow-cases.mjs');
    await alphaWorkflowCases({host:win,guest,command,waitFor,url});return;
  }
  await popupCases({ app, win, guest, url, command, waitFor, evidence });
  await status("ready");
  // Real shell measurements travel through the sender-checked production preload.
  const measure = async () => win.webContents.executeJavaScript(`(async () => {
    const state = await window.jusi.getInitialState();
    const rect = document.querySelector('.stage').getBoundingClientRect();
    const cell = document.querySelector('#cell-ruler').getBoundingClientRect();
    return { generation: state.nativeLayoutGeneration, sequence: 100000,
      x: rect.x, y: rect.y, width: rect.width, height: Math.min(rect.height, cell.height * state.screen.rows),
      cellWidth: cell.width / 10, cellHeight: cell.height, blocked: false };
  })()`);
  const acceptFreshReport = () => waitFor(async () => {
    const report = await measure();
    if (await win.webContents.executeJavaScript(`window.jusi.reportNativeViewport(${JSON.stringify(report)})`)) return report;
    const current = await win.webContents.executeJavaScript('window.jusi.getInitialState()');
    assert.ok(current.nativeLayoutGeneration > report.generation, 'current valid geometry must be accepted');
    return false; // A Neovim update legitimately expired the report between the two IPC calls.
  });
  const report = await acceptFreshReport();
  await win.webContents.executeJavaScript('window.jusi.invalidateNativeViewport()');
  assert.equal(await win.webContents.executeJavaScript(`window.jusi.reportNativeViewport(${JSON.stringify(report)})`), false);
  const renewed = await acceptFreshReport();
  assert.ok(renewed.generation > report.generation);

  await win.webContents.executeJavaScript('window.jusi.invalidateNativeViewport()');
  const retainedGuestId = guest.id;
  await command("tabnew");
  await waitFor(() => win.webContents.executeJavaScript('!!document.querySelector(".web-view-box--parked webview")'));
  assert.equal(guest.isDestroyed(), false, "hidden tab retains its guest");
  await command("tabprevious");
  await status("ready");
  assert.equal(await win.webContents.executeJavaScript('document.querySelector(".web-view-box:not(.web-view-box--parked) webview").getWebContentsId()'), retainedGuestId);
  evidence.processes.push(sandboxEvidence(app, win.webContents, "shell"));
  evidence.processes.push(sandboxEvidence(app, guest, "remote guest"));
  assert.deepEqual(await guest.executeJavaScript('[typeof process, typeof require, typeof window.jusi]'), ["undefined", "undefined", "undefined"]);
  assert.equal(await guest.executeJavaScript('document.cookie.includes("jusi_fixture=remembered")'), true);
  assert.equal(await guest.executeJavaScript('fetch("jusi-directory://open/?path=/etc/passwd").then(() => false, () => true)'), true);
  const preferences = guest.getLastWebPreferences();
  assert.equal(preferences.sandbox, true);
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.nodeIntegration, false);
  const acquire = () => win.webContents.executeJavaScript(`(async () => {
    const view = (await window.jusi.getInitialState()).attachedWebViews[0];
    const browser = document.querySelector('.web-view-box:not(.web-view-box--parked) webview');
    if (!view || !browser) return null;
    return window.jusi.acquireDocument(view.bufferId, view.sessionId, browser.getWebContentsId());
  })()`);
  const rejected = ticket => win.webContents.executeJavaScript(`window.jusi.updateWebMirror(${JSON.stringify(ticket)}, {
    version: 1000, totalTextLength: 5, lines: [{lineNumber: 0, text: "STALE", startIndex: 0, endIndex: 5, spans: []}]
  })`);
  const mirrorText = () => win.webContents.executeJavaScript('(async () => (await window.jusi.getInitialState()).attachedWebViews[0]?.mirror?.lines.map(l=>l.text).join("\\n") ?? "")()');
  const beforeMutation = await acquire();
  await guest.executeJavaScript(`document.querySelector('p').textContent = 'Updated browser text é 文 😀';
    const field = document.createElement('textarea'); field.textContent = 'PRIVATE_FORM_VALUE'; document.body.append(field);`);
  await waitFor(async () => (await acquire())?.revision > beforeMutation.revision);
  await waitFor(async () => (await mirrorText()).includes('Updated browser text'));
  await status("ready");
  assert.equal((await mirrorText()).includes('PRIVATE_FORM_VALUE'),false);
  assert.equal(await rejected(beforeMutation),false,"DOM mutation revokes old ticket");
  const beforeSameText = await acquire();
  await guest.executeJavaScript("document.querySelector('p').replaceWith(document.querySelector('p').cloneNode(true))");
  await waitFor(async () => (await acquire())?.revision > beforeSameText.revision);
  await status("ready");
  assert.ok((await mirrorText()).includes('Updated browser text'));
  const stableTicket = await acquire();
  await win.webContents.executeJavaScript('window.jusi.sendInput("j")');
  await new Promise(resolve => setTimeout(resolve, 700));
  assert.equal((await acquire()).revision,stableTicket.revision,"host projection must not trigger mutation rebuilds");
  await command('tabnew');
  await guest.executeJavaScript("document.querySelector('p').textContent = 'Changed while parked'");
  await command('tabprevious');
  await waitFor(async () => (await mirrorText()).includes('Changed while parked'));
  await browserCommandCases({host:win,guest,waitFor,statusSelector:'.web-view-box:not(.web-view-box--parked) .presentation-text-status'});
  await browserInteractionCases({ host: win, guest, command, waitFor, statusSelector: ".web-view-box:not(.web-view-box--parked) .presentation-text-status" });
  const originalTicket = await acquire();
  assert.ok(originalTicket?.sessionId);
  guest.reload();
  const reloaded = await waitFor(async () => { const ticket = await acquire(); return ticket?.revision > originalTicket.revision ? ticket : null; });
  assert.equal(reloaded.sessionId, originalTicket.sessionId);
  assert.equal(await rejected(originalTicket), false, "same-URL reload rejects the old document");
  await status("ready");
  await guest.loadURL(`${url}redirect`);
  const redirected = await waitFor(async () => { const ticket = await acquire(); return ticket?.revision > reloaded.revision ? ticket : null; });
  assert.equal(await rejected(reloaded), false, "redirect revokes the old document");
  await status("ready");
  guest.forcefullyCrashRenderer();
  await waitFor(() => guest.isCrashed());
  await status("error");
  assert.equal(await rejected(redirected), false, "crash revokes outstanding work");
  guest.reload();
  await waitFor(async () => { const ticket = await acquire(); return ticket?.revision > redirected.revision; });
  await status("ready");
  await guest.loadURL(url);
  await status("ready");
  const firstSession = guest.session;
  await command(`JusiWebBuffer! ${url}`);
  await status("disabled");
  await waitFor(() => webContents.getAllWebContents().filter(contents => contents.getType() === "webview" && contents.getURL() === url).length === 2);
  assert.ok(webContents.getAllWebContents().filter(contents => contents.getType() === "webview" && contents.getURL() === url).every(contents => contents.session === firstSession));
  const activeGuest = webContents.getAllWebContents().filter(contents => contents.getType() === "webview" && contents.getURL() === url).find(contents => contents !== guest);
  assert.equal(await activeGuest.executeJavaScript('typeof window.__jusiDocumentChanges'), 'undefined', 'text-off installs no observer');
  await win.webContents.executeJavaScript('window.jusi.sendInput("i")');
  await waitFor(() => win.webContents.executeJavaScript('!!document.querySelector(".web-view-box--web-mode")'));
  activeGuest.sendInputEvent({ type: "keyDown", keyCode: "Q", modifiers: ["control"] });
  await waitFor(() => webContents.getAllWebContents().filter(contents => contents.getType() === "webview" && contents.getURL() === url).length === 1);
  // Independent worker text must not be confused with the visible page's DOM text.
  const workerScript = join(scratch, "text-worker.mjs");
  const workerLog = join(scratch, "worker-extracted");
  writeFileSync(workerScript, `
    import {createInterface} from 'node:readline';
    import {writeFileSync} from 'node:fs';
    const [url, mode, log] = process.argv.slice(2);
    let count = 0;
    createInterface({input:process.stdin}).on('line', line => {
      const f = JSON.parse(line);
      if (f.type === 'shutdown') process.exit(0);
      if (f.type === 'hello') process.stdout.write(JSON.stringify({type:'ready',version:1,capabilities:['surface.web','text.extract'],surface:{backend:'web',url}})+'\\n');
      if (f.type !== 'extract') return;
      writeFileSync(log, 'requested');
      const fail = mode === 'retry' && ++count === 1;
      setTimeout(() => process.stdout.write(JSON.stringify({type:'text-result',id:f.id,ticket:f.ticket,
        ...(fail ? {error:'fixture text failure'} : {document:{offsetEncoding:'utf-8',lines:[{text:'Worker text é 文 😀',anchor:{source:'chapter',startByte:0,endByte:23}}]}})})+'\\n'), 700);
    });
  `);
  const luaString = value => JSON.stringify(value);
  await command(`lua require("jusi_neovim").register({id="worker-smoke",api_version=1,open=require("jusi_neovim").worker(function(r) return {executable=${luaString(process.env.JUSI_TEST_NODE_PATH)},argv={${luaString(workerScript)},${luaString(url)},r.target,${luaString(workerLog)}},cwd=${luaString(scratch)},env={}} end)})`);
  await command('JusiOpen worker-smoke retry');
  await status("building");
  await command('lua assert(vim.b.jusi_buffer_kind == "web")'); // remains responsive while text runs
  await status("error");
  await win.webContents.executeJavaScript('document.querySelector(".web-view-box:not(.web-view-box--parked) .presentation-text-status").click()');
  await status("ready");
  await command('lua assert(vim.api.nvim_buf_get_lines(0,0,1,false)[1] == "Worker text é 文 😀")');
  const workerView = await win.webContents.executeJavaScript('(async () => (await window.jusi.getInitialState()).attachedWebViews[0])()');
  assert.equal(workerView.textSource, "worker");
  assert.equal(workerView.workerText.lines[0].anchor.source, "chapter");
  assert.equal(workerView.mirror, undefined, "worker anchors never become DOM spans");
  await command('tabnew');
  await command('tabprevious');
  await status("ready");
  const workerTicket = await acquire();
  const staleBuild = win.webContents.executeJavaScript(`window.jusi.buildWorkerText(${JSON.stringify(workerTicket)})`).catch(() => false);
  const workerGuest = webContents.getAllWebContents().find(c => c.getType() === "webview" && c.getURL() === url && c !== guest);
  workerGuest.reload();
  assert.equal(await staleBuild, false, "reload rejects in-flight worker text");
  await status("ready");
  await workerGuest.loadURL(`${url}next`);
  await status("error");
  assert.equal((await win.webContents.executeJavaScript('(async () => (await window.jusi.getInitialState()).attachedWebViews[0])()')).workerText, undefined);
  await command('JusiClose');
  const offLog = join(scratch, "worker-off-extracted");
  await command(`lua require("jusi_neovim").register({id="worker-off",api_version=1,open=require("jusi_neovim").worker(function() return {executable=${luaString(process.env.JUSI_TEST_NODE_PATH)},argv={${luaString(workerScript)},${luaString(url)},"off",${luaString(offLog)}},cwd=${luaString(scratch)},env={}} end)})`);
  await command('JusiOpen! worker-off');
  await status("disabled");
  assert.equal(existsSync(offLog), false, "text off sends no extraction request");
  await command('JusiClose');
  // Extract the second provider into a standalone package outside the host tree.
  const viewerPackage = join(scratch, "source-viewer");
  cpSync(new URL("./fixtures/source-viewer", import.meta.url), viewerPackage, { recursive: true });
  await command(`lua vim.opt.runtimepath:append(${luaString(viewerPackage)}); require("source_viewer").setup({node=${luaString(process.env.JUSI_TEST_NODE_PATH)}})`);
  await command('JusiOpen source-viewer');
  const sourceGuest = await waitFor(() => webContents.getAllWebContents().find(c => c.getType() === "webview" && c.getURL().includes("127.0.0.1") && c.getURL() !== url && !c.getURL().startsWith(url)));
  await status("ready", sourceGuest.getURL());
  const selected = () => sourceGuest.executeJavaScript('document.querySelector("p.active")?.id ?? null');
  await waitFor(async () => await selected() === "paragraph-1");
  await win.webContents.executeJavaScript('window.jusi.sendInput("j")');
  await waitFor(async () => await selected() === "paragraph-2");
  await command('tabnew');
  await waitFor(async () => await selected() === null);
  await command('tabprevious');
  await waitFor(async () => await selected() === "paragraph-2");
  await win.webContents.executeJavaScript('window.jusi.sendInput("i")');
  await waitFor(async () => await selected() === null);
  sourceGuest.sendInputEvent({type:"keyDown",keyCode:"\\",modifiers:["control"]});
  sourceGuest.sendInputEvent({type:"keyDown",keyCode:"n",modifiers:["control"]});
  await waitFor(async () => await selected() === "paragraph-2");
  // Native focus also clears projection without the Neovim i mapping.
  await win.webContents.executeJavaScript('document.querySelector(".web-view-box:not(.web-view-box--parked) webview").focus()');
  await waitFor(async () => await selected() === null);
  // Text finishing while rich focus is active must not restore projection.
  const modeView = await win.webContents.executeJavaScript('(async () => (await window.jusi.getInitialState()).attachedWebViews[0])()');
  assert.equal(await win.webContents.executeJavaScript(`window.jusi.setPresentationMode(${modeView.bufferId}, "stale-session", ${modeView.windowId}, "text")`), false);
  const modeTicket = await acquire();
  assert.equal(await win.webContents.executeJavaScript(`window.jusi.buildWorkerText(${JSON.stringify(modeTicket)})`), true);
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(await selected(), null);
  await command('lua assert(vim.api.nvim_win_get_cursor(0)[1] == 2)');
  // Return restores the current line, without any cursor motion.
  sourceGuest.sendInputEvent({type:"keyDown",keyCode:"\\",modifiers:["control"]});
  sourceGuest.sendInputEvent({type:"keyDown",keyCode:"n",modifiers:["control"]});
  await waitFor(async () => await selected() === "paragraph-2");
  await win.webContents.executeJavaScript('window.jusi.sendInput("k")');
  await waitFor(async () => await selected() === "paragraph-1");
  mkdirSync(".local/review", { recursive: true });
  writeFileSync(app.isPackaged ? ".local/review/packaged-source-navigation.png" : ".local/review/source-navigation.png", (await win.webContents.capturePage()).toPNG());
  await command('JusiClose');
  const markdownPackage = join(scratch, "markdown-package");
  cpSync(process.env.JUSI_TEST_MARKDOWN_PACKAGE, markdownPackage, { recursive: true });
  await command(`lua vim.opt.runtimepath:append(${luaString(markdownPackage)}); require("jusi_markdown").setup({node=${luaString(process.env.JUSI_TEST_NODE_PATH)}})`);
  const markdownPath = join(markdownPackage, "examples/demo.md");
  await command(`JusiMarkdown ${markdownPath}`);
  const mdGuest = await waitFor(() => webContents.getAllWebContents().find(c => c.getType() === "webview" && c.getURL().includes("127.0.0.1") && c.getURL() !== url && !c.getURL().startsWith(url)));
  await status("ready", mdGuest.getURL());
  assert.deepEqual(await mdGuest.executeJavaScript('[!!document.querySelector("h1"),!!document.querySelector("table"),!!document.querySelector("pre code"),document.querySelectorAll("img").length,document.body.dataset.unsafe ?? null,typeof window.jusi]'), [true,true,true,0,null,"undefined"]);
  await command('lua assert(vim.api.nvim_buf_get_lines(0,0,1,false)[1] == "Markdown beyond the terminal")');
  await waitFor(() => mdGuest.executeJavaScript('!!document.querySelector("h1.active")'));
  await win.webContents.executeJavaScript('window.jusi.sendInput("j")');
  await waitFor(() => mdGuest.executeJavaScript('document.querySelector(".active")?.textContent.includes("Unicode")'));
  await win.webContents.executeJavaScript('window.jusi.sendInput("i")');
  await waitFor(() => mdGuest.executeJavaScript('!document.querySelector(".active")'));
  mdGuest.sendInputEvent({type:"keyDown",keyCode:"\\",modifiers:["control"]});
  mdGuest.sendInputEvent({type:"keyDown",keyCode:"n",modifiers:["control"]});
  await waitFor(() => mdGuest.executeJavaScript('document.querySelector(".active")?.textContent.includes("Unicode")'));
  writeFileSync(app.isPackaged ? ".local/review/packaged-markdown.png" : ".local/review/markdown.png", (await win.webContents.capturePage()).toPNG());
  await command('JusiClose');
  await command(`JusiMarkdown! ${markdownPath}`);
  const mdOff = await waitFor(() => webContents.getAllWebContents().find(c => c.getType() === "webview" && c.getURL().includes("127.0.0.1") && c.getURL() !== url && !c.getURL().startsWith(url)));
  await status("disabled", mdOff.getURL());
  assert.equal(await mdOff.executeJavaScript('fetch("./state").then(r=>r.json()).then(s=>s.selected)'),null);
  await command('lua assert(vim.api.nvim_buf_get_lines(0,0,1,false)[1] == "")');
  await command('JusiClose');
  mkdirSync(join(scratch, "documents"));
  const file = join(scratch, "documents", "fixture.html");
  await command("JusiWebProfile work");
  await command(`JusiWebPrivate! ${url}`);
  await waitFor(() => win.webContents.executeJavaScript(`document.querySelector('.web-view-box:not(.web-view-box--parked) .browser-profile-label')?.textContent === 'Private · this buffer'`));
  const privateId = await win.webContents.executeJavaScript(`document.querySelector('.web-view-box:not(.web-view-box--parked) webview').getWebContentsId()`);
  const privateGuest = webContents.fromId(privateId);
  assert.equal(privateGuest.session.isPersistent(), false);
  assert.equal(privateGuest.getLastWebPreferences().sandbox, true);
  await popupCases({ app, win, guest: privateGuest, url, command, waitFor, evidence, privateMode: true });
  await command("JusiClose");
  await command("JusiWebProfile default");
  writeFileSync(file, "<!doctype html><h1>Local presentation</h1><p>Selectable local text</p>");
  writeFileSync(join(scratch, "secret"), "not exposed");
  await command(`JusiWebBuffer ${pathToFileURL(file).href}`);
  const localUrl = new URL("jusi-directory://open/");
  localUrl.searchParams.set("path", file);
  await status("ready", localUrl.href);
  guest = await waitFor(() => webContents.getAllWebContents().find(contents => contents.getType() === "webview" && contents.getURL().startsWith("jusi-directory:")));
  evidence.processes.push(sandboxEvidence(app, guest, "local guest"));
  const outside = new URL("jusi-directory://open/");
  outside.searchParams.set("path", join(scratch, "secret"));
  assert.equal(await guest.executeJavaScript(`fetch(${JSON.stringify(outside.href)}).then(r => r.status)`), 403);
  assert.equal(await guest.executeJavaScript(`fetch(${JSON.stringify(url)}).then(() => false, () => true)`), true);
  mkdirSync(".local/review", { recursive: true });
  await new Promise(resolve => setTimeout(resolve, 200));
  await status("ready", localUrl.href);
  writeFileSync(app.isPackaged ? ".local/review/packaged-presentation.png" : ".local/review/presentation.png", (await win.webContents.capturePage()).toPNG());
  await command("JusiClose");
  await adoptionCases({ app, evidence, waitFor });
  writeFileSync(app.isPackaged ? ".local/review/packaged-sandbox.json" : ".local/review/development-sandbox.json", JSON.stringify(evidence, null, 2) + "\n");
  console.log("Electron presentation smoke passed", JSON.stringify({ electron: process.versions.electron, chromium: process.versions.chrome }));
} catch (error) {
  console.error(error);
  if(browserTrace.length)console.error('Native input/placement trace',JSON.stringify(browserTrace));
  if (frameTrace.length) console.error("frame trace", JSON.stringify(frameTrace));
  if (win && !win.isDestroyed()) console.error(await win.webContents.executeJavaScript(`(async () => JSON.stringify({state: (await window.jusi.getInitialState()).attachedWebViews.map(v => ({bufferId:v.bufferId, gridBounds:v.gridBounds})), hosts: [...document.querySelectorAll(".web-view-box")].map(x => ({data:x.dataset, status:x.querySelector(".presentation-text-status")?.textContent}))}))()`).catch(() => "unavailable"));
  process.exitCode = 1;
} finally {
  if (frameTrace.length) {
    mkdirSync(".local/review", {recursive:true});
    writeFileSync(".local/review/nvim-frame-trace.json", JSON.stringify(frameTrace,null,2));
  }
  clearTimeout(timeout);
  server.close();
  win?.close();
  // Let Neovim disposal and Chromium storage shutdown complete before exiting.
  setTimeout(() => { app.exit(process.exitCode ?? 0); }, 1000);
}

}
void main();
