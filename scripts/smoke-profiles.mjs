// Child process: exercise actual host commands and guest storage, then normal quit.
import { app, BrowserWindow, webContents, dialog } from 'electron';
import assert from 'node:assert/strict';
import { join } from 'node:path';
const { JUSI_TEST_PROFILE_ROOT: root, JUSI_TEST_PROFILE_URL: url, JUSI_TEST_PROFILE_PHASE: phase } = process.env;
assert.ok(root && url && ['seed', 'restart', 'cleared'].includes(phase));
app.setPath('userData', join(root, 'profile'));
process.env.JUSI_NVIM_CLEAN = '1';
process.env.JUSI_STARTUP_DEMO = '0';
const timeout = setTimeout(() => { console.error('Profile smoke timed out'); app.exit(1); }, 30000);
async function waitFor(fn) {
  for (let i = 0; i < 200; i++) {
    const result = await fn();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Profile condition did not become true');
}
async function main() {
try {
  await import('../dist/electron/main.js');
  const win = await waitFor(() => BrowserWindow.getAllWindows().find(window => window.isVisible()));
  await waitFor(() => win.webContents.executeJavaScript('typeof window.jusi === "object"').catch(() => false));
  const command = value => win.webContents.executeJavaScript(`window.jusi.runCommand(${JSON.stringify(value)})`);
  async function open(profile, privateMode = false) {
    const previous = webContents.getAllWebContents().filter(c => c.getType() === 'webview').map(c => c.id);
    await command(`JusiWebProfile ${profile}`);
    await command(`${privateMode ? 'JusiWebPrivate' : 'JusiWebBuffer'}! ${url}`);
    const guest = await waitFor(async () => {
      const id = await win.webContents.executeJavaScript(`(() => {
      const host = document.querySelector('.web-view-box:not(.web-view-box--parked)');
      const guest = host?.querySelector('webview');
      return guest?.dataset.domReady === '1' && host.querySelector('.presentation-text-status')?.dataset.status === 'disabled' && !${JSON.stringify(previous)}.includes(guest.getWebContentsId()) && guest.getWebContentsId();
    })()`);
      return id && webContents.fromId(id);
    });
    assert.equal(guest.session.isPersistent(), !privateMode);
    assert.equal(await win.webContents.executeJavaScript(`document.querySelector('.web-view-box:not(.web-view-box--parked) .browser-profile-label').textContent`),
      privateMode ? 'Private · this buffer' : `Profile · ${profile}`);
    return guest;
  }
  const state = guest => guest.executeJavaScript(`(async () => ({login: await (await fetch('/whoami')).text(), value: localStorage.getItem('fixture')}))()`);
  async function profileCommand(value, pattern) {
    await command(value);
    await waitFor(() => command(`lua assert(require("jusi_web").last_profile_result and string.find(require("jusi_web").last_profile_result.message, "${pattern}", 1, true))`).then(() => true, () => false));
  }
  if (phase === 'cleared') {
    const work = await open('work');
    assert.deepEqual(await state(work), {login: 'anonymous', value: null});
    await command('JusiClose');
    const personal = await open('personal');
    assert.deepEqual(await state(personal), {login: 'anonymous', value: 'personal'});
    console.log('Profile clear survived restart; other profile preserved');
    clearTimeout(timeout);
    await command('qa!').catch(() => {});
    return;
  }
  let guest = await open('work');
  assert.deepEqual(await state(guest), phase === 'seed' ? {login: 'anonymous', value: null} : {login: 'fixture-user', value: 'work'});
  if (phase === 'seed') await guest.executeJavaScript(`fetch('/login').then(() => localStorage.setItem('fixture', 'work'))`);
  assert.deepEqual(await state(guest), {login: 'fixture-user', value: 'work'});
  await command('JusiClose');
  guest = await open('personal');
  assert.deepEqual(await state(guest), {login: 'anonymous', value: phase === 'seed' ? null : 'personal'});
  await guest.executeJavaScript(`localStorage.setItem('fixture', 'personal')`);
  await command('JusiClose');
  guest = await open('work', true);
  assert.deepEqual(await state(guest), {login: 'anonymous', value: null});
  await guest.executeJavaScript(`fetch('/login').then(() => localStorage.setItem('fixture', 'private'))`);
  assert.deepEqual(await state(guest), {login: 'fixture-user', value: 'private'});
  await command('JusiClose');
  guest = await open('work', true);
  assert.deepEqual(await state(guest), {login: 'anonymous', value: null});
  await command('JusiClose');
  guest = await open('work');
  assert.deepEqual(await state(guest), {login: 'fixture-user', value: 'work'});
  if (phase === 'restart') {
    await profileCommand('JusiWebClear work', 'Close all browser buffers');
    await command('tabnew');
    await profileCommand('JusiWebRevoke work', 'Close all browser buffers');
    await command('tabprevious');
    await command('JusiClose');
    await waitFor(() => !webContents.getAllWebContents().some(c => c.getType() === 'webview'));
    const originalDialog = dialog.showMessageBox;
    let response = 0, prompts = 0, hold = false, release;
    dialog.showMessageBox = async (_parent, options) => {
      assert.equal(options.defaultId, 0);
      assert.match(options.message, /profile "work"/);
      prompts++;
      if (hold) await new Promise(resolve => { release = resolve; });
      return {response, checkboxChecked:false};
    };
    try {
      await profileCommand('JusiWebPermissions work', 'session grants');
      await profileCommand('JusiWebClear work', 'cancelled');
      hold = true;
      await command('JusiWebClear work');
      await waitFor(() => release);
      await profileCommand(`JusiWebBuffer! ${url}`, 'is busy');
      assert.equal(webContents.getAllWebContents().some(c => c.getType() === 'webview'), false);
      await command('JusiClose');
      hold = false; release();
      await waitFor(() => command('lua assert(require("jusi_web").last_profile_result.message:find("cancelled"))').then(() => true, () => false));
      guest = await open('work');
      assert.deepEqual(await state(guest), {login:'fixture-user',value:'work'});
      await command('JusiClose');
      await waitFor(() => !webContents.getAllWebContents().some(c => c.getType() === 'webview'));
      response = 1;
      await profileCommand('JusiWebRevoke work', 'session grants revoked');
      await profileCommand('JusiWebClear work', 'browser data cleared');
      assert.equal(prompts, 4);
    } finally { dialog.showMessageBox = originalDialog; }
  }
  console.log(`Profile ${phase} assertions passed`);
  clearTimeout(timeout);
  // Keep a hidden auxiliary window alive across the final Neovim quit. The
  // parent runner requires a natural process exit before reopening the profile.
  const auxiliary = phase === 'seed' ? new BrowserWindow({ show: false }) : undefined;
  app.once('will-quit', () => { if (auxiliary) assert.ok(auxiliary.isDestroyed()); });
  // Do not flush storage in the harness: prove the real application's exit path.
  await command('qa!').catch(() => {});
} catch (error) { console.error(error); app.exit(1); }

}
void main();
