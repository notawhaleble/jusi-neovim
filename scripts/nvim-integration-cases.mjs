import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';

export async function nvimIntegrationCases({win, command, waitFor}) {
  const js = code => win.webContents.executeJavaScript(code);
  const press = async key => {
    win.webContents.sendInputEvent({type:'keyDown',keyCode:key,modifiers:key==='G'?['shift']:[]});
    win.webContents.sendInputEvent({type:'keyUp',keyCode:key,modifiers:key==='G'?['shift']:[]});
  };
  const block = () => js(`document.querySelector('#cmdline-block-layer')?.textContent ?? ''`);
  const rendered = () => js('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const signal = join(process.env.JUSI_TEST_PROFILE_ROOT, 'stream-continue');
  const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
  const lines = Array.from({length:120}, (_,i) => `stream-line-${i+1}`).join('\\n') + '\\n';
  const shell = `printf ${quote(lines)}; until test -f ${quote(signal)}; do sleep 0.05; done; printf 'stream-line-121\\nstream-line-122\\n'`;
  try {
    await js(`window.jusi.sendInput(${JSON.stringify(':' + '!' + shell + '<CR>')})`);
    await waitFor(async () => (await js('window.jusi.getInitialState()')).messages.entries.some(e=>e.kind==='shell_out' && e.text.includes('stream-line-120')));
    await rendered();
    writeFileSync('.local/review/nvim-message-tail.png', (await win.webContents.capturePage()).toPNG());
    await press('Up');
    await waitFor(async () => !(await block()).includes('stream-line-120'));
    const scrolled = await block();
    writeFileSync(signal, 'continue');
    await waitFor(async () => (await js('window.jusi.getInitialState()')).messages.entries.some(e=>e.kind==='return_prompt'));
    await rendered();
    assert.equal(await block(), scrolled, 'appended shell output preserves a scrolled-back viewport');
  } finally {
    writeFileSync(signal, 'continue'); // Release the child even if an assertion fails.
  }
  await press('G');
  await waitFor(async () => (await block()).includes('stream-line-122'));
  await press('Enter');
  await waitFor(async () => !(await block()).includes('stream-line-'));
  for (const cmd of ['echo "unrelated message"', 'enew', 'normal! ihello', 'undo', 'redo', 'tabnew', 'tabprevious']) {
    await command(cmd);
    assert.equal((await block()).includes('stream-line-'), false, `dismissed output must not return after ${cmd}`);
  }
  // A later identical command is new output, not a permanently suppressed string.
  await command(`lua vim.api.nvim_echo({{'stream-line-121\\nstream-line-122'}}, false, {})`);
  await waitFor(async () => (await block()).includes('stream-line-122'));
  await press('Enter');
  await waitFor(async () => !(await block()).includes('stream-line-'));

  // Real Neovim hit-enter prompt: dismissal must reach the editor as well.
  for (const key of ['Enter', 'Escape']) {
    await js(`window.jusi.sendInput(":!printf 'native-shell-output\\n'<CR>")`);
    await waitFor(async () => (await js('window.jusi.getInitialState()')).messages.entries.some(e=>e.kind==='return_prompt'));
    await press(key);
    await waitFor(async () => !(await js('window.jusi.getInitialState()')).messages.entries.some(e=>e.kind==='return_prompt'));
    await command('echo "prompt acknowledged"');
    assert.equal((await block()).includes('native-shell-output'), false);
  }

  await command(`lua vim.o.showtabline=2; vim.api.nvim_set_hl(0,'IntegrationAttention',{fg='#201800',bg='#e5b454',bold=true}); vim.o.tabline='%#IntegrationAttention# attention-tab %T%#TabLineFill#%='; vim.cmd.redrawtabline()`);
  try {
  await waitFor(() => js(`Array.from(document.querySelectorAll('#terminal-screen span')).some(s=>s.textContent.includes('attention-tab') && s.style.backgroundColor==='rgb(229, 180, 84)')`));
  } catch(error) { console.error('Tab highlight diagnostic',await js(`(async()=>{const s=await window.jusi.getInitialState();return {options:s.screen.options,lines:s.screen.lines.slice(0,2),runs:s.screen.runs.slice(0,2),highlights:Object.fromEntries((s.screen.runs[0]??[]).map(r=>[r.highlightId,s.screen.highlights[r.highlightId]])),dom:document.querySelector('#terminal-screen').innerHTML.slice(0,4000)}})()`));throw error; }
  writeFileSync('.local/review/nvim-tab-attention.png', (await win.webContents.capturePage()).toPNG());
  await command(`lua vim.api.nvim_set_hl(0,'IntegrationAttention',{fg='#ffffff',bg='#123456'}); vim.cmd.redrawtabline()`);
  await waitFor(() => js(`Array.from(document.querySelectorAll('#terminal-screen span')).some(s=>s.textContent.includes('attention-tab') && s.style.backgroundColor==='rgb(18, 52, 86)')`));
  await command(`set tabline= showtabline=1`);
  await waitFor(() => js(`!document.querySelector('#terminal-screen').textContent.includes('attention-tab')`));
  await command('tabonly!');
  await command('enew!');
  console.log('Neovim message dismissal, streaming viewport, repeat output and tab highlight lifecycle passed');
}
