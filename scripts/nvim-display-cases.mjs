import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
export async function nvimDisplayCases({win,command,waitFor}) {
  const js=code=>win.webContents.executeJavaScript(code);
  await command('lua _G.jusi_display_guicursor = vim.o.guicursor');
  try {
    await command(`lua vim.cmd('enew!'); vim.wo.number=false; vim.wo.relativenumber=false; vim.wo.signcolumn='no'; vim.wo.foldcolumn='0'; vim.api.nvim_buf_set_lines(0,0,-1,false,{'Aé文😀Z','A界B','A👩‍💻B'}); vim.cmd('normal! gg$')`);
    await waitFor(()=>js(`(async()=>{const s=await window.jusi.getInitialState();return s.grids.some(g=>g.lines[0]?.startsWith('Aé文😀Z'))})()`));
    await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    const result=await js(`(async()=>{
      const s=await window.jusi.getInitialState();const g=s.grids.find(g=>g.lines[0]?.startsWith('Aé文😀Z'));
      const el=document.querySelector('.grid-layer[data-grid-id="'+g.gridId+'"]');
      const base=el.getBoundingClientRect();const cw=document.querySelector('#cell-ruler').getBoundingClientRect().width/10;
      const spans=[...el.querySelectorAll('span[data-columns]')].filter(e=>Math.abs(e.getBoundingClientRect().top-base.top)<2);
      return {runs:g.runs[0],cursor:g.cursor,parts:spans.map(e=>({text:e.textContent,left:(e.getBoundingClientRect().left-base.left)/cw,width:e.getBoundingClientRect().width/cw}))};
    })()`);
    for(const [text,left,width] of [['A',0,1],['é',1,1],['文',2,2],['😀',4,2]]) {
      const part=result.parts.find(p=>p.text===text);assert.ok(part,`missing ${text}`);
      assert.ok(Math.abs(part.left-left)<0.03,`${text} column`);assert.ok(Math.abs(part.width-width)<0.03,`${text} width`);
    }
    const z=result.parts.find(p=>p.text.startsWith('Z'));assert.ok(z);assert.ok(Math.abs(z.left-6)<0.03);
    assert.equal(result.cursor.col,6);
    writeFileSync('.local/review/nvim-c4-grid.png',(await win.webContents.capturePage()).toPNG());
    await command('set guicursor=');
    await command('normal! gg0ll');
    await waitFor(()=>js(`(()=>{const c=document.querySelector('#terminal-cursor'),cw=document.querySelector('#cell-ruler').getBoundingClientRect().width/10;return c.textContent==='文' && Math.abs(parseFloat(c.style.width)-2*cw)<0.05})()`));
    writeFileSync('.local/review/nvim-cursor-wide.png',(await win.webContents.capturePage()).toPNG());
    await command(`normal! gg0lrx`);
    await waitFor(()=>js(`(async()=>{const s=await window.jusi.getInitialState();return s.grids.some(g=>g.lines[0]?.startsWith('Ax文😀Z'))})()`));
    await command(`lua vim.api.nvim_buf_set_lines(0,0,-1,false,{'double dotted dashed curl strike'}); local ns=vim.api.nvim_create_namespace('display-styles'); for i,v in ipairs({{'underdouble',0,6},{'underdotted',7,13},{'underdashed',14,20},{'undercurl',21,25},{'strikethrough',26,32}}) do vim.api.nvim_set_hl(0,'DisplayStyle'..i,{[v[1]]=true,sp='#ff3366'}); vim.api.nvim_buf_set_extmark(0,ns,0,v[2],{end_col=math.min(v[3],31),hl_group='DisplayStyle'..i}) end`);
    await waitFor(()=>js(`(()=>{const spans=[...document.querySelectorAll('.grid-layer span')];return ['double','dotted','dashed','wavy'].every(style=>spans.some(e=>getComputedStyle(e).textDecorationStyle===style)) && spans.some(e=>getComputedStyle(e).textDecorationLine==='line-through')})()`));
    writeFileSync('.local/review/nvim-c4b-decorations.png',(await win.webContents.capturePage()).toPNG());
    await command(`lua vim.api.nvim_set_hl(0,'DisplayCursorSource',{fg='#ff3366',bg='#123456',bold=true}); vim.api.nvim_buf_set_extmark(0,vim.api.nvim_create_namespace('cursor-source'),0,0,{end_col=6,hl_group='DisplayCursorSource',priority=200}); vim.cmd('normal! gg0'); vim.cmd('set guicursor=a:block-blinkwait700-blinkoff400-blinkon250')`);
    await waitFor(()=>js(`(()=>{const c=document.querySelector('#terminal-cursor');return c.textContent==='d' && getComputedStyle(c).backgroundColor==='rgb(255, 51, 102)' && getComputedStyle(c).color==='rgb(18, 52, 86)' && c.getAnimations().length===1})()`));
    const blink = await js(`(async()=>{
      const c=document.querySelector('#terminal-cursor'),a=c.getAnimations()[0]; a.pause();
      const sample=async time=>{a.currentTime=time;await new Promise(r=>requestAnimationFrame(r));return getComputedStyle(c).opacity};
      const values=[];for(const t of [0,699,701,1099,1101,1349,1351])values.push(await sample(t));
      a.currentTime=100;await new Promise(r=>requestAnimationFrame(r));return values;
    })()`);
    assert.deepEqual(blink,['1','1','0','0','1','1','0']);
    writeFileSync('.local/review/nvim-cursor-highlight.png',(await win.webContents.capturePage()).toPNG());
    await command('redraw');
    assert.equal(await js(`document.querySelector('#terminal-cursor').getAnimations()[0]?.playState`),'paused','redraw preserves blink cycle');
    await command(`highlight DisplayCursor guifg=#abcdef guibg=#654321`);
    await command('set guicursor=a:block-DisplayCursor-blinkwait700-blinkoff400-blinkon250');
    await waitFor(()=>js(`(()=>{const c=document.querySelector('#terminal-cursor');return getComputedStyle(c).backgroundColor==='rgb(101, 67, 33)' && getComputedStyle(c).color==='rgb(171, 205, 239)'})()`));
    await command('set guicursor=a:ver20');
    await waitFor(()=>js(`(async()=>{const s=await window.jusi.getInitialState();const c=document.querySelector('#terminal-cursor');return s.screen.mode.cursor.shape==='vertical' && c.style.display==='block' && parseFloat(c.style.width)<5})()`));
    await command('set guicursor=');
    await waitFor(()=>js(`(async()=>{const s=await window.jusi.getInitialState();return s.screen.mode.cursor.shape==='block' && parseFloat(document.querySelector('#terminal-cursor').style.width)>5})()`));
    await command('set guicursor=a:block-blinkwait700-blinkoff400-blinkon250');
    await js("window.jusi.sendInput(':')");
    await waitFor(()=>js(`document.querySelector('.cmdline-cursor')?.style.display==='block' && document.querySelector('#terminal-cursor').style.display==='none'`));
    await js("window.jusi.sendInput('abc<Home>')");
    await waitFor(()=>js(`document.querySelector('.cmdline-cursor')?.textContent==='a'`));
    await js(`window.__cursorAnimation=document.querySelector('.cmdline-cursor').getAnimations()[0]; window.__cursorAnimation.pause()`);
    await command('redraw');
    await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    assert.equal(await js(`document.querySelector('.cmdline-cursor').getAnimations()[0]===window.__cursorAnimation`),true);
    await js("window.jusi.sendInput('<Esc>')");
    await waitFor(()=>js(`document.querySelector('#terminal-cursor').style.display==='block'`));
    console.log('Neovim Unicode allocation, highlight decorations and cursor shapes, glyph colors and blink lifecycle passed');
  } finally { await command('lua vim.o.guicursor = _G.jusi_display_guicursor; _G.jusi_display_guicursor = nil'); await command('enew!'); }
}
