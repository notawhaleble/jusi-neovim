import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';

export async function nvimOverlayCases({win,command,waitFor}) {
  const js=code=>win.webContents.executeJavaScript(code);
  const state=()=>js('window.jusi.getInitialState()');
  const input=keys=>js(`window.jusi.sendInput(${JSON.stringify(keys)})`);
  const rendered=()=>js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const press=async key=>{
    win.webContents.sendInputEvent({type:'keyDown',keyCode:key});
    win.webContents.sendInputEvent({type:'keyUp',keyCode:key});await rendered();
  };
  const hidden=()=>waitFor(async()=>!(await state()).cmdline.visible);
  try {
    await input(':echo "parent"');
    await waitFor(async()=>(await state()).cmdline.level===1);
    const parent=(await state()).cmdline.content;
    await input('<C-r>=1+2');
    await waitFor(async()=>(await state()).cmdline.level===2);
    assert.equal((await state()).cmdline.firstChar,'=');
    await input('<Esc>');
    await waitFor(async()=>{const c=(await state()).cmdline;return c.level===1&&c.content===parent});
    await input('<Esc>');await hidden();
    await input(':echo "文😀é"');
    await waitFor(async()=>(await state()).cmdline.content.endsWith('文😀é"'));
    await rendered();
    const end=await js(`(() => {const c=document.querySelector('.cmdline-content'),r=document.createRange();r.selectNodeContents(c);return {cursor:document.querySelector('.cmdline-cursor').getBoundingClientRect().left,textEnd:r.getBoundingClientRect().right}})()`);
    assert.ok(Math.abs(end.cursor-end.textEnd)<2,'UTF-8 end position matches rendered Unicode text');
    await input('<Left>');await rendered();
    const beforeQuote=await js(`(() => {const c=document.querySelector('.cmdline-content'),r=document.createRange();r.selectNodeContents(c);const walker=document.createTreeWalker(c,NodeFilter.SHOW_TEXT);let n,last;while(n=walker.nextNode())last=n;r.setEnd(last,last.length-1);return {cursor:document.querySelector('.cmdline-cursor').getBoundingClientRect().left,textEnd:r.getBoundingClientRect().right}})()`);
    assert.ok(Math.abs(beforeQuote.cursor-beforeQuote.textEnd)<2,'byte position before quote is not a UTF-16 index');
    await input('<Esc>');await hidden();

    // The external cmdline block has one lines argument, and append has one line.
    await input(':function! OverlayProbe()<CR>');
    await waitFor(async()=>(await state()).cmdline.blockLines.some(l=>l.includes('function')));
    await input('echo "block probe"<CR>');
    await waitFor(async()=>(await state()).cmdline.blockLines.some(l=>l.includes('block probe')));
    await input('endfunction<CR>');
    await waitFor(async()=>(await state()).cmdline.blockLines.length===0);
    await command('delfunction OverlayProbe');

    await input(`:lua vim.g.overlay_answer=vim.fn.confirm('Choose an option', '&Yes\\n&No', 2)<CR>`);
    await waitFor(async()=>(await state()).messages.entries.some(e=>e.kind==='confirm'));
    await rendered();
    assert.equal(await js(`document.querySelector('#message-layer')?.textContent.includes('Press ENTER')`),false,'confirm must not become a local hit-enter pager');
    await press('Y');
    await command('lua assert(vim.g.overlay_answer==1)');
    await command("highlight PromptProbe guifg=#12ab34 gui=bold | highlight! link PromptAlias PromptProbe");
    await input(`:echohl PromptAlias | let g.overlay_styled=input('Styled: ') | echohl None<CR>`);
    await waitFor(async()=>{const c=(await state()).cmdline;return c.prompt==='Styled: ' && c.promptHighlight?.foreground==='#12ab34'});
    await rendered();
    assert.equal(await js(`getComputedStyle([...document.querySelectorAll('.cmdline-content span')].find(e=>e.textContent==='Styled: ')).color`),'rgb(18, 171, 52)');
    writeFileSync('.local/review/nvim-prompt-highlight.png',(await win.webContents.capturePage()).toPNG());
    await command('highlight PromptProbe guifg=#ab1234 gui=italic');
    await waitFor(async()=>(await state()).cmdline.promptHighlight?.foreground==='#ab1234');
    await input('accepted<CR>');await hidden();
    await input(`:lua vim.g.overlay_input=vim.fn.input('Value: ')<CR>`);
    await waitFor(async()=>(await state()).cmdline.prompt==='Value: ');
    await input('文value<CR>');await hidden();
    await command(`lua assert(vim.g.overlay_input=='文value')`);
    await input(`:lua vim.g.overlay_number=vim.fn.inputlist({'Pick one:','1. First','2. Second'})<CR>`);
    await waitFor(async()=>{const s=await state();return s.cmdline.visible && s.cmdline.prompt.includes('Type number') && s.messages.entries.some(e=>e.kind==='confirm')});
    await press('2');await press('Enter');
    await command('lua assert(vim.g.overlay_number==2)');
    await command(`lua vim.api.nvim_buf_set_lines(0,0,-1,false,{'needle needle'}); vim.cmd('normal! gg0')`);
    await input(':%s/needle/replaced/gc<CR>');
    await waitFor(async()=>(await state()).cmdline.prompt.startsWith('replace with replaced?'));
    await press('N');await press('Y');
    await command(`lua assert(vim.api.nvim_get_current_line()=='needle replaced')`);

    await command(`lua vim.api.nvim_set_hl(0,'OverlayRed',{fg='#ff1234'}); vim.api.nvim_set_hl(0,'OverlayBlue',{fg='#1234ff'}); vim.api.nvim_echo({{'red part','OverlayRed'},{' blue part\\nsecond line','OverlayBlue'}},true,{})`);
    await waitFor(()=>js(`Array.from(document.querySelectorAll('#cmdline-block-layer span')).some(s=>s.textContent.includes('red part')&&s.style.color==='rgb(255, 18, 52)')`));
    assert.ok(await js(`Array.from(document.querySelectorAll('#cmdline-block-layer span')).some(s=>s.textContent.includes('second line')&&s.style.color==='rgb(18, 52, 255)')`));
    writeFileSync('.local/review/nvim-c3-highlighted-message.png',(await win.webContents.capturePage()).toPNG());
    await press('Enter');
    await input(':messages<CR>');
    await waitFor(async()=>(await state()).messages.historyVisible);
    await rendered();
    assert.ok(await js(`document.querySelector('#cmdline-block-layer').textContent.includes('red part')`));
    await press('Enter');
    await input(':echoerr "overlay error"<CR>');
    await waitFor(async()=>(await state()).messages.entries.some(e=>e.kind==='echoerr'&&e.text.includes('overlay error')));
    await press('Enter');

    await command(`lua _G.OverlayCompletion=function() return {'alpha','alpine','algebra'} end; vim.cmd('command! -nargs=* -complete=customlist,v:lua.OverlayCompletion OverlayComplete echo <q-args>'); vim.o.wildoptions='pum'; vim.o.wildmode='full'`);
    await input(':OverlayComplete 文 a<Tab>');
    await waitFor(async()=>(await state()).popupmenu.visible);
    await rendered();
    const p=(await state()).popupmenu;assert.equal(p.grid,-1);
    const anchor=await js(`(() => {const e=document.querySelector('.cmdline-content');const text=e.textContent;const index=text.lastIndexOf(' ')+1;const r=document.createRange();r.setStart(e,0);const w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);let n,left=index;while(n=w.nextNode()){if(left<=n.length){r.setEnd(n,left);break}left-=n.length}return {expected:r.getBoundingClientRect().right,actual:document.querySelector('#popupmenu-layer').getBoundingClientRect().left}})()`);
    assert.ok(Math.abs(anchor.actual-anchor.expected)<2,'command completion byte anchor follows Unicode prefix');
    await input('<Tab>');
    await waitFor(async()=>(await state()).popupmenu.selected!==p.selected);
    writeFileSync('.local/review/nvim-c3-completion.png',(await win.webContents.capturePage()).toPNG());
    await input('<Esc>');await hidden();
    await waitFor(async()=>!(await state()).popupmenu.visible);
    await command('delcommand OverlayComplete');
    console.log('External cmdline nesting, UTF-8 caret, blocks, confirm/input/inputlist/substitute, highlights/history/errors and completion passed');
  } catch(error) {
    const s=await state();console.error('Overlay diagnostic',JSON.stringify({cmdline:s.cmdline,popupmenu:s.popupmenu,messages:s.messages,mode:s.screen.mode}));throw error;
  } finally {
    await input('<Esc>');await press('Escape');
    await command('enew!');
  }
}
