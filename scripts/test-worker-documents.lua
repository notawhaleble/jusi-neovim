vim.opt.runtimepath:prepend(vim.fn.getcwd() .. "/runtime")
vim.cmd("runtime plugin/jusi_neovim.lua")
local documents = require("jusi_neovim.worker-documents")
local workers = require("jusi_neovim.worker")
local jusi = require("jusi_neovim")
local ticket = { bufferId = 1, incarnation = 1, sessionId = "fixture-session", revision = 1 }
local function config(mode)
  return { executable = vim.fn.exepath("node"), argv = { vim.fn.getcwd() .. "/scripts/fixtures/worker/documents.mjs", mode },
    cwd = vim.fn.getcwd(), env = {}, text_timeout_ms = 200, required_capabilities = { "surface.web", "text.extract" } }
end
local function start(mode)
  local ready, failure
  local worker = workers.start(config(mode), function(err) failure = err; ready = true end, function(err) failure = err end)
  assert(vim.wait(3000, function() return ready end))
  assert(not failure, failure)
  return worker
end
for _, mode in ipairs({ "ok", "ticket", "invalid", "error", "timeout", "large" }) do
  local worker = start(mode)
  local done, error, result
  worker.extract(ticket, function(err, document) error = err; result = document; done = true end)
  assert(vim.wait(3000, function() return done end), mode)
  if mode == "ok" then
    assert(not error, error); assert(result.lines[1].text == "é 文 😀")
    assert(result.lines[1].anchor.endByte == #result.lines[1].text)
  elseif mode == "large" then assert(not error, error); assert(#result.lines == 3000)
  else assert(error and not result, mode) end
  assert(worker.state == "ready", "text error must leave rich worker alive")
  worker.close()
end
-- Cancellation after a valid reply has been queued must suppress the document.
local manager = documents.new(function() end, 100)
local result
local cancel = manager.extract(ticket, function(err, doc) result = { err = err, doc = doc } end)
assert(manager.receive({type="text-result",id=1,ticket=ticket,document={offsetEncoding="utf-8",lines={}}}))
cancel()
assert(vim.wait(1000, function() return result end)); assert(result.err and not result.doc)
manager.close()
-- Supersede a revision; deliberately late/cancel-ignoring replies cannot win.
local worker = start("late")
local first, second
worker.extract(ticket, function(err, doc) first = {err=err,doc=doc} end)
local next_ticket = vim.tbl_extend("force", ticket, {revision=2})
worker.extract(next_ticket, function(err, doc) second = {err=err,doc=doc} end)
assert(vim.wait(2000, function() return first and second end))
assert(first.err and not first.doc); assert(not second.err and second.doc)
worker.close()
local closing = start("late")
local closed_result
closing.extract(ticket,function(err,doc) closed_result={err=err,doc=doc} end)
closing.close()
assert(vim.wait(2000,function() return closed_result end))
assert(closed_result.err and not closed_result.doc)
-- Integrate with real provider buffers and the existing main-authorized ticket.
jusi.register({id="worker-documents",api_version=1,open=jusi.worker(function() return config("late") end)})
local buf = jusi.open("worker-documents", "")
assert(vim.wait(3000,function() return vim.b[buf].jusi_buffer_kind == "web" end))
local identity = {bufferId=buf,incarnation=vim.b[buf].jusi_incarnation,sessionId="integration",revision=1}
assert(require("jusi_neovim.document").invalidate(identity))
local old
jusi.extract(identity,function(err,doc) old={err=err,doc=doc} end)
local newer = vim.tbl_extend("force",identity,{revision=2})
assert(require("jusi_neovim.document").invalidate(newer))
assert(vim.wait(2000,function() return old end)); assert(old.err and not old.doc)
local current
jusi.extract(newer,function(err,doc) current={err=err,doc=doc} end)
assert(vim.wait(2000,function() return current end)); assert(not current.err and current.doc)
-- Transport never writes text: publication remains a separate ticket-checked step.
assert(vim.api.nvim_buf_get_lines(buf,0,-1,false)[1] == "")
vim.b[buf].jusi_text_layer = "off"
local disabled
jusi.extract(newer,function(err) disabled=err end)
assert(vim.wait(1000,function() return disabled end))
jusi.close(buf)
workers.close_all()
assert(not documents.validate({offsetEncoding="utf-8",lines={{text="bad\nline",anchor={source="x",startByte=0,endByte=1}}}}))
for _, bad in ipairs({ string.char(192, 128), string.char(237, 160, 128), string.char(244, 144, 128, 128), string.char(255) }) do
  assert(not documents.validate({offsetEncoding="utf-8",lines={{text=bad,anchor={source="x",startByte=0,endByte=1}}}}))
end
assert(not documents.validate({offsetEncoding="utf-8",lines={{text=string.rep("a",524289),anchor={source="x",startByte=0,endByte=1}}}}))
print("worker document request tests passed")
vim.cmd("qa!")
