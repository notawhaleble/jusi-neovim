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
    await command("rightbelow vsplit");
    await command(`lua local b=vim.api.nvim_create_buf(false,true); vim.api.nvim_buf_set_lines(b,0,-1,false,{'float-placement','alpha','alpine','algebra'}); _G.display_float=vim.api.nvim_open_win(b,false,{relative='win',anchor='SE',row=8,col=20,width=16,height=3,border='single',zindex=55})`);
    const floatAligned = (expectedWidth=0) => js(`(async()=>{
      const s=await window.jusi.getInitialState();
      const current=s.snapshot.tabs.find(t=>t.id===s.snapshot.currentTabId)?.currentWindowId;
      const split=s.snapshot.windows.find(w=>w.id===current)?.gridBounds;
      const el=[...document.querySelectorAll('.grid-layer')].find(e=>e.textContent.includes('float-placement'));
      if (!split || !el || (${expectedWidth} && split.width!==${expectedWidth})) return false;
      const grid=s.snapshot.windows.find(w=>w.id===Number(el.dataset.windowId))?.gridBounds;
      const cw=document.querySelector('#cell-ruler').getBoundingClientRect().width/10;
      return grid?.zIndex===55 && grid.row===split.row+3 && grid.col===split.col+2 &&
        Math.abs(el.getBoundingClientRect().x-(split.col+2)*cw)<1;
    })()`);
    await waitFor(floatAligned);
    await command('vertical resize 32');
    await waitFor(()=>floatAligned(32));
    await command('lua vim.api.nvim_set_current_win(_G.display_float)');
    await js(`window.jusi.sendInput("ggOal<C-x><C-n>")`);
    await waitFor(()=>js(`(async()=>{
      const s=await window.jusi.getInitialState(), p=s.popupmenu;
      const grid=s.snapshot.windows.find(w=>w.gridId===p.grid)?.gridBounds;
      const menu=document.querySelector('#popupmenu-layer.popupmenu-layer--visible');
      if (!menu || grid?.zIndex!==55) return false;
      const r=menu.getBoundingClientRect(), cw=document.querySelector('#cell-ruler').getBoundingClientRect().width/10;
      return Math.abs(r.left-(grid.col+p.col)*cw)<1 && menu.contains(document.elementFromPoint(r.left+3,r.top+3));
    })()`));
    writeFileSync('.local/review/nvim-float-completion.png',(await win.webContents.capturePage()).toPNG());
    await js(`window.jusi.sendInput("<C-e><Esc>")`);
    await command('lua vim.api.nvim_win_close(_G.display_float,true)');
    await waitFor(()=>js(`![...document.querySelectorAll('.grid-layer')].some(e=>e.textContent.includes('float-placement'))`));
    await command('close');
    await keyboardRedrawCases({win,js,command,waitFor});
    console.log('Neovim Unicode cells, highlight decorations, cursor lifecycle, split-relative float and completion placement passed');
  } finally { await command('lua vim.o.guicursor = _G.jusi_display_guicursor; _G.jusi_display_guicursor = nil'); await command('enew!'); }
}

async function keyboardRedrawCases({win, js, command, waitFor}) {
  const input = keys => js(`window.jusi.sendInput(${JSON.stringify(keys)})`);
  await command('rightbelow vnew');
  try {
    await command("lua local rows={}; for i=1,200 do rows[i]='é文 row '..i end; vim.api.nvim_buf_set_lines(0,0,-1,false,rows); vim.cmd('setlocal scroll=5 scrolloff=0 nowrap nonumber norelativenumber'); vim.cmd('set guicursor='); vim.cmd('normal! gg0')");
    const windowId = await waitFor(() => js(`[...document.querySelectorAll('.grid-layer')].find(el=>el.textContent.startsWith('é文 row 1'))?.dataset.windowId`));
    const active = `.grid-layer[data-window-id="${windowId}"]`;
    const rows = () => js(`document.querySelector(${JSON.stringify(active)}).textContent.split('\\n').map(line=>line.trimEnd())`);
    const sibling = () => js(`document.querySelector(${JSON.stringify('.grid-layer:not('+active+')')}).textContent`);
    await waitFor(async () => (await rows())[0] === 'é文 row 1');
    const original = await rows(), stationary = await sibling();
    for (const [key, offset] of [['<C-d>',5],['<C-u>',0]]) {
      await input(key);
      await waitFor(async () => (await rows())[0] === 'é文 row ' + (1+offset));
      assert.deepEqual(await rows(), original.map((_,i) => 'é文 row ' + (i+1+offset)));
      assert.equal(await sibling(), stationary);
    }
    for (const [key, glyph, column, width] of [['0','é',0,1],['l','文',1,2]]) {
      await input(key);
      await waitFor(() => js(`(()=>{
        const c=document.querySelector('#terminal-cursor'), r=c.getBoundingClientRect();
        const g=document.querySelector(${JSON.stringify(active)}).getBoundingClientRect();
        const cw=document.querySelector('#cell-ruler').getBoundingClientRect().width/10;
        return c.textContent===${JSON.stringify(glyph)} && Math.abs(r.left-g.left-${column}*cw)<1 &&
          Math.abs(r.top-g.top)<1 && Math.abs(r.width-${width}*cw)<1;
      })()`));
    }
    const message = 'aé文'.repeat(160) + ' tail';
    await input(":echo '" + message + "'");
    const layer = '#cmdline-layer';
    const atEnd = () => js(`(()=>{
      const el=document.querySelector('${layer}'), c=el.querySelector('.cmdline-cursor');
      const end=el.querySelector('.cmdline-end')?.getBoundingClientRect();
      if (!end || !c || !el.textContent.includes('tail')) return false;
      const r=c.getBoundingClientRect(), box=el.getBoundingClientRect();
      return box.height>r.height*2 && Math.abs(end.left-r.left)<1 && end.top>=r.top && end.top<=r.bottom &&
        r.left>=box.left && r.right<=box.right+1 && r.bottom<=box.bottom+1;
    })()`);
    await waitFor(atEnd);
    await input('<Home>');
    await waitFor(() => js(`(()=>{
      const el=document.querySelector('${layer}'), c=el.querySelector('.cmdline-cursor');
      return c.textContent==='e' && Math.abs(c.getBoundingClientRect().top-el.getBoundingClientRect().top)<1;
    })()`));
    await input('<End>');
    await waitFor(atEnd);
    writeFileSync('.local/review/nvim-keyboard-command.png',(await win.webContents.capturePage()).toPNG());
    await input('<CR>');
    await waitFor(() => js(`(()=>{
      const lines=[...document.querySelectorAll('.cmdline-block-line')];
      return lines.length>1 && lines.map(l=>l.textContent).join('')===${JSON.stringify(message)} &&
        lines.every(l=>l.scrollWidth<=l.clientWidth+1 && !l.textContent.startsWith('́'));
    })()`));
    await input('<CR>');
    const {screen} = await js('window.jusi.getInitialState()');
    const tall = 'x'.repeat(screen.cols*(screen.rows+4));
    await input(':' + tall);
    const caretVisible = () => js(`(()=>{
      const el=document.querySelector('#cmdline-layer'), c=el.querySelector('.cmdline-cursor');
      if (!c || !el.classList.contains('cmdline-layer--visible')) return false;
      const r=c.getBoundingClientRect(), box=el.getBoundingClientRect();
      return r.top>=box.top-1 && r.bottom<=box.bottom+1 && box.top>=0;
    })()`);
    await waitFor(async()=>await caretVisible() && await js("document.querySelector('#cmdline-layer').scrollTop>0"));
    await input('<Home>');
    await waitFor(async()=>await caretVisible() && await js("document.querySelector('#cmdline-layer').scrollTop===0"));
    await input('<Esc>');
    console.log('Keyboard split scrolling, Unicode cursor placement, wrapped command and message passed');
  } finally {
    await input('<Esc>');
    await command('close!');
  }
}
