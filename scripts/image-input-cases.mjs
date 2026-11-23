// Electron supplies a real file to a drop in an unfocused Neovim grid.
import { browserReviewPause } from './browser-interaction-cases.mjs';
import { clipboard, ClipboardItem } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export async function imageInputCases({win, command, waitFor, scratch}) {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
  const path = join(scratch, 'one pixel.png');
  writeFileSync(path, png);
  const csvPath = join(scratch, 'values.csv');
  writeFileSync(csvPath, 'a,b');
  await command("lua vim.api.nvim_buf_set_lines(0,0,-1,false,{'one','two','three'}); _G.dest=vim.api.nvim_get_current_win(); require('jusi_neovim.attachments').register(vim.api.nvim_get_current_buf(), function(row) return function(items) vim.g.received={row,items[1].name,vim.base64.encode(items[1].bytes)}; if items[2] then vim.g.extra={items[2].name,items[2].media_type,items[2].bytes} end end end)");
  const saved = await Promise.all((await clipboard.read()).filter(item => item.types.length).map(async item => {
    const entries = await Promise.all(item.types.map(async type => [type, await item.getType(type)]));
    return new ClipboardItem(Object.fromEntries(entries));
  }));
  try {
    await clipboard.write([new ClipboardItem({'image/png': new Blob([png], {type:'image/png'})})]);
    const [item] = await clipboard.read();
    const expected = Buffer.from(await (await item.getType('image/png')).arrayBuffer()).toString('base64');
    await command('JusiPasteImage');
    await command(`lua assert(vim.deep_equal(vim.g.received,{0,'Screenshot.png','${expected}'})); vim.g.received=nil`);
    if (process.env.JUSI_TEST_REVIEW === 'image-paste') await browserReviewPause('image-paste', win);
    else {
      const modifiers = process.platform === 'darwin' ? ['meta'] : ['control', 'shift'];
      for (const type of ['keyDown', 'keyUp']) win.webContents.sendInputEvent({type, keyCode:'V', modifiers});
    }
    const receipt = join(scratch, 'paste-receipt');
    await waitFor(async () => {
      await command(`lua vim.fn.writefile({vim.json.encode(vim.g.received or false)}, ${JSON.stringify(receipt)})`);
      const result = JSON.parse(readFileSync(receipt, 'utf8'));
      return result && result[0] === 0 && result[1] === 'Screenshot.png' && result[2] === expected;
    });
  } finally {
    if (saved.length) await clipboard.write(saved);
    else clipboard.clear();
  }
  const identity = join(scratch, 'drop-destination');
  await command(`lua vim.fn.writefile({tostring(dest)}, ${JSON.stringify(identity)})`);
  const destination = Number(readFileSync(identity, 'utf8'));
  await command('vnew');
  const coords = await waitFor(() => win.webContents.executeJavaScript(`(async () => {
    const s = await window.jusi.getInitialState();
    const tab = s.snapshot.tabs.find(t => t.id === s.snapshot.currentTabId);
    if (!tab || !tab.currentWindowId || tab.currentWindowId === ${destination}
        || Number(document.body.dataset.activeWindowId) !== tab.currentWindowId) return null;
    const other = s.snapshot.windows.find(w => w.id === ${destination});
    const el = other && document.querySelector('.grid-layer[data-window-id="'+other.id+'"]');
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = rect.x + rect.width / 2, y = rect.y + rect.height / other.gridBounds.height * 1.5;
    return document.elementFromPoint(x, y)?.closest('.grid-layer') === el ? {x,y} : null;
  })()`));
  const debuggerPort = win.webContents.debugger;
  debuggerPort.attach();
  try {
    for (const type of ['dragEnter','dragOver','drop']) {
      await debuggerPort.sendCommand('Input.dispatchDragEvent', {type,...coords,
        data:{items:[],files:[path,csvPath],dragOperationsMask:1}});
    }
  } finally { debuggerPort.detach(); }
  const receipt = join(scratch, 'receipt');
  await waitFor(async () => {
    await command(`lua vim.fn.writefile({vim.json.encode({vim.g.received, vim.api.nvim_get_current_win() ~= dest})}, ${JSON.stringify(receipt)})`);
    const [image, stayed] = JSON.parse(readFileSync(receipt,'utf8'));
    return image?.[1] === 'one pixel.png' && stayed && image[0] === 1 && image[2] === png.toString('base64');
  });
  await command("lua assert(vim.deep_equal(vim.g.extra,{'values.csv','text/csv','a,b'}), vim.inspect(vim.g.extra))");
  console.log('Clipboard PNG and unfocused-grid file drop reached the intended rows with matching bytes');
}
