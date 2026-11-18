import assert from 'node:assert/strict';

export async function nvimMouseCases({win, command, waitFor}) {
  const js = code => win.webContents.executeJavaScript(code);
  const state = () => js('window.jusi.getInitialState()');
  const settled = () => js('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const expect = async condition => { await settled(); return command(`lua assert(vim.wait(2000,function() return ${condition} end,10), ${JSON.stringify(condition)})`); };
  const point = async (grid, row, col) => {
    await settled();
    return js(`(() => { const el=document.querySelector(${JSON.stringify(grid===1?'#terminal-screen':`.grid-layer[data-grid-id="${grid}"]`)}); const r=el.getBoundingClientRect(); const c=document.querySelector('#cell-ruler').getBoundingClientRect(); return {x:Math.floor(r.left+(${col}+0.5)*c.width/10),y:Math.floor(r.top+(${row}+0.5)*c.height)}; })()`);
  };
  const mouse = (type,p,extra={}) => win.webContents.sendInputEvent({type,...p,button:'left',...(type==='mouseMove'?{modifiers:['leftButtonDown']}:{}),...extra});
  const click = async (p,modifiers=[]) => {
    mouse('mouseDown',p,{modifiers});
    await new Promise(resolve=>setTimeout(resolve,25));
    mouse('mouseUp',p,{modifiers});
    await settled();
  };
  await js(`(() => { window.mouseTrace=[]; for(const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture']) document.addEventListener(type,e=>{if(type==='pointerdown')window.mousePointerId=e.pointerId;window.mouseTrace.push({type,x:e.clientX,y:e.clientY,buttons:e.buttons,target:e.target.className||e.target.id});if(window.mouseTrace.length>30)window.mouseTrace.shift()},true) })()`);
  try {
    await command(`lua vim.o.mouse='a'; vim.o.showtabline=2; vim.o.tabline=''; vim.o.laststatus=2; vim.o.mousetime=500; vim.cmd('enew!'); vim.bo.buftype='nofile'; vim.bo.bufhidden='wipe'; vim.api.nvim_buf_set_lines(0,0,-1,false,{'alpha beta gamma','second line text','third line text','fourth line text'}); vim.wo.number=false; vim.wo.relativenumber=false; vim.wo.signcolumn='no'; vim.wo.foldcolumn='0'`);
    await command('vsplit');
    const windows=await waitFor(async()=>{const s=await state(); const ws=s.snapshot.windows.filter(w=>w.tabId===s.snapshot.currentTabId);return ws.length===2 && ws.every(w=>w.gridBounds) ? ws.sort((a,b)=>a.gridBounds.col-b.gridBounds.col):null});
    const left=windows[0], width=left.gridBounds.width;
    const separator=await point(1,left.gridBounds.row+2,left.gridBounds.col+width);
    const end=await point(1,left.gridBounds.row+2,left.gridBounds.col+width+4);
    mouse('mouseDown',separator);
    await expect(`vim.fn.getmousepos().screencol == ${left.gridBounds.col+width+1}`);
    mouse('mouseMove',end);
    await expect(`vim.api.nvim_win_get_width(${left.id}) > ${width}`);
    mouse('mouseUp',end);
    await settled();
    await command('only!');
    console.log('Neovim split-divider drag resized the owning split');
    if (process.env.JUSI_TEST_EXTENDED_MOUSE !== '1') return;
    let current=await waitFor(async()=>{const s=await state();return s.snapshot.windows.find(w=>w.tabId===s.snapshot.currentTabId && w.gridId>1)});
    let p=await point(current.gridId,1,3);
    await click(p);
    await expect("vim.fn.line('.') == 2 and vim.fn.col('.') == 4");
    mouse('mouseDown',await point(current.gridId,0,0));
    await expect("vim.fn.line('.') == 1 and vim.fn.col('.') == 1");
    mouse('mouseMove',await point(current.gridId,2,5));
    await expect("vim.fn.mode() == 'v' and vim.fn.line('.') == 3");
    mouse('mouseUp',await point(current.gridId,2,5));
    await js(`window.jusi.sendInput('<Esc>')`);
    await expect("vim.fn.mode() == 'n'");
    // Losing capture releases the gesture; a later move cannot resume selection.
    mouse('mouseDown',await point(current.gridId,0,1)); await settled();
    await js(`document.querySelector('.stage').releasePointerCapture(window.mousePointerId)`);
    mouse('mouseMove',await point(current.gridId,1,5)); await settled();
    mouse('mouseUp',await point(current.gridId,1,5));
    await expect("vim.fn.mode() == 'n' and vim.fn.line('.') == 1");
    // Neovim owns click counting; two real presses select a word.
    p=await point(current.gridId,0,7);
    await click(p); await click(p);
    await expect("vim.fn.mode() == 'v'");
    await js(`window.jusi.sendInput('<Esc>')`);
    await command(`lua vim.g.mouse_shift=0; vim.keymap.set('n','<S-LeftMouse>',function() vim.g.mouse_shift=vim.g.mouse_shift+1 end)`);
    await click(await point(current.gridId,3,2),['shift']);
    await expect('vim.g.mouse_shift == 1');
    await command(`lua vim.keymap.del('n','<S-LeftMouse>'); local t={}; for i=1,150 do t[i]='line '..i..' abcdef' end; vim.api.nvim_buf_set_lines(0,0,-1,false,t); vim.cmd('normal! gg')`);
    p=await point(current.gridId,2,3);
    mouse('mouseWheel',p,{deltaY:-180,deltaX:0,canScroll:true});
    await expect("vim.fn.line('w0') > 1");
    await command(`lua vim.g.wheel_axes={}; for _,k in ipairs({'ScrollWheelLeft','ScrollWheelRight','ScrollWheelUp','ScrollWheelDown'}) do vim.keymap.set('n','<'..k..'>',function() vim.g.wheel_axes=vim.list_extend(vim.g.wheel_axes,{k}) end) end`);
    for (const delta of [{deltaX:120,deltaY:0},{deltaX:-120,deltaY:0},{deltaX:0,deltaY:120},{deltaX:0,deltaY:-120}]) {
      mouse('mouseWheel',p,{...delta,canScroll:true}); await settled();
    }
    await expect('#vim.g.wheel_axes >= 4');
    await command(`lua for _,k in ipairs({'ScrollWheelLeft','ScrollWheelRight','ScrollWheelUp','ScrollWheelDown'}) do assert(vim.tbl_contains(vim.g.wheel_axes,k),k); vim.keymap.del('n','<'..k..'>') end`);
    // Native tab click and close use root-grid cells, not host-generated tab actions.
    await command(`file mouse-first`);await settled(); const first=(await state()).snapshot.currentTabId;
    await command('tabnew');await command('file mouse-second');
    let s=await state();
    await click(await point(1,0,3));
    await expect(`vim.api.nvim_get_current_tabpage() == ${first}`);
    s=await state();const count=2;
    await click(await point(1,0,s.screen.cols-1));
    await expect(`#vim.api.nvim_list_tabpages() == ${count-1}`);
    // Native 0.11.4 truncates excess tabs: preserve its cells and click targets.
    // Custom tabline fitting belongs to the plugin, not a host-side offset.
    await command(`lua vim.cmd('file T00'); for i=1,40 do vim.cmd('tabnew'); vim.cmd('file '..string.format('T%02d',i)) end`);
    await waitFor(async()=>(await state()).screen.lines[0].includes('T27'));
    assert.equal((await state()).screen.lines[0].includes('T40'),false,'native tabline truncates excess tabs');
    await command(`lua assert(vim.fn.tabpagenr()==41); assert(vim.fn.screenstring(1,2)=='T')`);
    await click(await point(1,0,2));
    await expect('vim.fn.tabpagenr() == 1');
    // Clickable custom tabline callback proves modifiers and Neovim hit targets survive.
    await command(`lua _G.MouseTabClick=function(_,clicks,button,mods) vim.g.mouse_tab_click={clicks,button,mods} end; vim.o.tabline='%@v:lua.MouseTabClick@ click-target %T'; vim.cmd.redrawtabline()`);
    await waitFor(async()=>(await state()).screen.lines[0].includes('click-target'));
    await click(await point(1,0,4),['control']);
    await expect("type(vim.g.mouse_tab_click)=='table' and vim.g.mouse_tab_click[2]=='l' and vim.g.mouse_tab_click[3]:find('c') ~= nil");
    // Modal host output must not leak a click into the underlying editor.
    await command(`lua vim.g.mouse_leaked=0; vim.keymap.set('n','<LeftMouse>',function() vim.g.mouse_leaked=vim.g.mouse_leaked+1 end); vim.api.nvim_echo({{'overlay line one\\noverlay line two'}},false,{})`);
    await waitFor(()=>js(`document.querySelector('#cmdline-block-layer')?.textContent.includes('overlay line')`));
    s=await state();current=s.snapshot.windows.find(w=>w.tabId===s.snapshot.currentTabId);
    await click(await point(current.gridId,1,2));
    await command('lua assert(vim.g.mouse_leaked == 0)');
    await js(`window.jusi.sendInput('<CR>')`);
    console.log('Neovim real mouse cursor/selection/multiclick/modifiers/wheel/split/tab/overflow/overlay cases passed');
  } catch(error) {
    const s=await state(); console.error('Mouse diagnostic',JSON.stringify(await js(`({events:window.mouseTrace})`)),JSON.stringify({snapshot:s.snapshot,mode:s.screen.mode,tabline:s.screen.lines[0],cmdline:s.cmdline}));
    await command(`lua print(vim.inspect({mode=vim.fn.mode(),cursor=vim.api.nvim_win_get_cursor(0),mouse=vim.fn.getmousepos()}))`);
    console.error('Mouse editor diagnostic',JSON.stringify((await state()).messages));
    throw error;
  } finally {
    await command(`lua pcall(vim.keymap.del,'n','<LeftMouse>'); pcall(vim.keymap.del,'n','<S-LeftMouse>'); vim.o.tabline=''; vim.o.showtabline=1; vim.cmd('tabonly!'); vim.cmd('only!'); vim.cmd('enew!')`);
  }
}
