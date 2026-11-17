vim.opt.runtimepath:prepend(vim.fn.getcwd() .. "/runtime")
vim.cmd("runtime plugin/jusi_neovim.lua")
local jusi = require("jusi_neovim")
local documents = require("jusi_neovim.document")
local frames = {}
local cursor_navigation, selection_navigation, viewport_navigation = false, false, false
-- Isolate authoritative runtime cursor/ticket routing; desktop tests use real pipes.
require("jusi_neovim.worker").start = function(_, ready)
  ready(nil, {backend="web",url="http://127.0.0.1/"})
  return {capabilities={["text.extract"]=true,["source.navigate"]=true,["source.navigate.cursor"]=cursor_navigation,["source.navigate.selection"]=selection_navigation,["source.navigate.viewport"]=viewport_navigation,["surface.actions"]=true},
    navigate=function(ticket, window, anchor, cursor_byte, selection, viewport) table.insert(frames,{ticket=ticket,window=window,anchor=anchor,cursorByte=cursor_byte,selection=selection,viewport=viewport}) end,
    action=function(window, action, count) table.insert(frames,{window=window,action=action,count=count}); return true end,
    close=function() end}
end
jusi.register({id="navigation",api_version=1,open=jusi.worker(function() return {} end)})
local buf = jusi.open("navigation")
assert(vim.wait(1000,function() return vim.b[buf].jusi_incarnation ~= nil end))
local ticket={bufferId=buf,incarnation=vim.b[buf].jusi_incarnation,sessionId="navigation",revision=1}
local document={offsetEncoding="utf-8",lines={
  {text="é 文 😀",anchor={source="first",startByte=10,endByte=20}},
  {text="second",anchor={source="second",startByte=0,endByte=6}},
}}
assert(documents.invalidate(ticket))
assert(documents.commit_worker(ticket,document))
assert(vim.wait(1000,function() return #frames==1 end))
assert(frames[1].anchor.source=="first" and frames[1].window==vim.api.nvim_get_current_win())
-- Character motions never guess byte positions in transformed provider source.
vim.api.nvim_win_set_cursor(0,{1,3}); jusi.navigate()
vim.wait(50,function() return false end)
assert(#frames==1)
for _=1,30 do jusi.navigate() end
vim.api.nvim_win_set_cursor(0,{2,0}); jusi.navigate()
assert(vim.wait(1000,function() return #frames==2 end))
assert(frames[2].anchor.source=="second")
-- Leaving a split clears the old explicit window and projects in the new one.
local oldwin=vim.api.nvim_get_current_win()
vim.cmd("split")
assert(vim.wait(1000,function() return #frames>=4 end))
assert(frames[3].anchor==nil and frames[3].window==oldwin)
assert(frames[4].window==vim.api.nvim_get_current_win())
-- Rich mode suppresses both cursor events and a newly committed document.
local win=vim.api.nvim_get_current_win()
assert(not jusi.set_mode(buf,ticket.incarnation+1,win,"rich"))
assert(jusi.set_mode(buf,ticket.incarnation,win,"rich"))
assert(frames[#frames].anchor==nil)
local rich_count=#frames
assert(documents.commit_worker(ticket,document))
jusi.navigate(); vim.wait(50,function() return false end)
assert(#frames==rich_count)
assert(jusi.set_mode(buf,ticket.incarnation,win,"text"))
assert(vim.wait(1000,function() return #frames==rich_count+1 end))
assert(frames[#frames].anchor.source=="second")
local next_ticket=vim.tbl_extend("force",ticket,{revision=2})
assert(documents.invalidate(next_ticket))
assert(frames[#frames].anchor==nil)
local count=#frames
assert(not documents.commit_worker(ticket,document))
jusi.navigate(); vim.wait(50,function() return false end)
assert(#frames==count,"stale document must not navigate")
assert(documents.commit_worker(next_ticket,document))
jusi.clear_navigation(buf) -- also cancels a queued projection
vim.wait(50,function() return false end)
assert(#frames==count)
vim.b[buf].jusi_text_layer="off"
jusi.navigate(); vim.wait(50,function() return false end)
assert(#frames==count)
jusi.close(buf)
-- Opt-in position is a byte column in the returned line, never in the source.
cursor_navigation = true
frames = {}
local cursor_buf = jusi.open("navigation")
assert(vim.wait(1000,function() return vim.b[cursor_buf].jusi_incarnation ~= nil end))
local cursor_ticket={bufferId=cursor_buf,incarnation=vim.b[cursor_buf].jusi_incarnation,sessionId="cursor",revision=1}
assert(documents.invalidate(cursor_ticket))
assert(documents.commit_worker(cursor_ticket,document))
assert(vim.wait(1000,function() return #frames==1 end))
assert(frames[1].cursorByte==0 and frames[1].anchor.startByte==10)
for index, column in ipairs({3,7}) do
  vim.api.nvim_win_set_cursor(0,{1,column}); jusi.navigate()
  assert(vim.wait(1000,function() return #frames==index+1 end))
  assert(frames[#frames].cursorByte==column and frames[#frames].anchor.startByte==10)
end
jusi.navigate(); vim.wait(50,function() return false end); assert(#frames==3)
local cursor_win=vim.api.nvim_get_current_win()
assert(jusi.set_mode(cursor_buf,cursor_ticket.incarnation,cursor_win,"rich"))
assert(frames[#frames].anchor==nil and frames[#frames].cursorByte==nil)
assert(jusi.set_mode(cursor_buf,cursor_ticket.incarnation,cursor_win,"text"))
assert(vim.wait(1000,function() return #frames==5 end))
assert(frames[5].cursorByte==7)
jusi.close(cursor_buf)
selection_navigation = true
frames = {}
local selection_buf = jusi.open("navigation")
assert(vim.wait(1000,function() return vim.b[selection_buf].jusi_incarnation ~= nil end))
local selection_ticket={bufferId=selection_buf,incarnation=vim.b[selection_buf].jusi_incarnation,sessionId="selection",revision=1}
assert(documents.invalidate(selection_ticket))
assert(documents.commit_worker(selection_ticket,document))
assert(vim.wait(1000,function() return #frames==1 end))
assert(frames[1].selection == vim.NIL)
vim.cmd('normal! v')
vim.api.nvim_win_set_cursor(0,{1,3}); jusi.navigate()
assert(vim.wait(1000,function() return #frames==2 end))
assert(vim.deep_equal(frames[2].selection, {{row=0,startByte=0,endByte=6}}), vim.inspect(frames[2]))
-- Exclusive endpoint changes must publish even when the cursor does not move.
vim.o.selection = 'exclusive'; jusi.navigate()
assert(vim.wait(1000,function() return #frames==3 end))
assert(vim.deep_equal(frames[3].selection, {{row=0,startByte=0,endByte=3}}))
vim.cmd('normal! o'); jusi.navigate()
assert(vim.wait(1000,function() return #frames==4 end))
assert(vim.deep_equal(frames[4].selection, frames[3].selection))
vim.cmd('normal! '..string.char(27)); jusi.navigate()
assert(vim.wait(1000,function() return frames[#frames].selection == vim.NIL end))
vim.o.selection = 'inclusive'
vim.cmd('normal! Vj'); jusi.navigate()
assert(vim.wait(1000,function() return type(frames[#frames].selection) == 'table' and #frames[#frames].selection == 2 end))
assert(vim.deep_equal(frames[#frames].selection, {{row=0,startByte=0,endByte=11},{row=1,startByte=0,endByte=6}}))
assert(jusi.set_mode(selection_buf,selection_ticket.incarnation,vim.api.nvim_get_current_win(),'rich'))
assert(frames[#frames].anchor == nil and frames[#frames].selection == nil)
vim.cmd('normal! '..string.char(27))
jusi.close(selection_buf)
viewport_navigation = true
frames = {}
local view_buf = jusi.open("navigation")
assert(vim.wait(1000,function() return vim.b[view_buf].jusi_incarnation ~= nil end))
-- Actions do not depend on a text ticket, and stay scoped to the current window.
assert(jusi.worker_action('next-page', 2))
assert(frames[1].action == 'next-page' and frames[1].count == 2 and frames[1].window == vim.api.nvim_get_current_win())
assert(not pcall(jusi.worker_action,'bad action',1))
assert(not pcall(jusi.worker_action,'next-page',0))
local view_ticket={bufferId=view_buf,incarnation=vim.b[view_buf].jusi_incarnation,sessionId="viewport",revision=1}
local view_doc={offsetEncoding='utf-8',lines={}}
for row=1,100 do view_doc.lines[row]={text='Row '..row,anchor={source='page',startByte=row*10,endByte=row*10+6}} end
assert(documents.invalidate(view_ticket)); assert(documents.commit_worker(view_ticket,view_doc))
assert(vim.wait(1000,function() return #frames==2 end))
assert(frames[2].viewport.topRow == 0 and frames[2].viewport.bottomRow > 0)
vim.api.nvim_win_set_cursor(0,{30,0}); vim.fn.winrestview({topline=25}); jusi.navigate()
assert(vim.wait(1000,function() return #frames==3 end))
assert(frames[3].viewport.topRow == vim.fn.line('w0')-1)
local count=#frames
vim.fn.winrestview({topline=24}); jusi.navigate()
assert(vim.wait(1000,function() return #frames==count+1 end), 'viewport-only changes must publish')
assert(frames[#frames].cursorByte==frames[#frames-1].cursorByte)
local win=vim.api.nvim_get_current_win()
assert(jusi.set_mode(view_buf,view_ticket.incarnation,win,'rich'))
assert(frames[#frames].viewport == nil)
assert(not jusi.worker_action('next-page',1), 'rich mode must not dispatch Neovim actions')
assert(jusi.set_mode(view_buf,view_ticket.incarnation,win,'text'))
vim.b[view_buf].jusi_text_layer='off'
assert(jusi.worker_action('previous-page',1))
jusi.close(view_buf)
assert(not jusi.worker_action('next-page',1))
print("worker source navigation tests passed")
vim.cmd("qa!")
