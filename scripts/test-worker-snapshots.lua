vim.opt.runtimepath:prepend(vim.fn.getcwd() .. '/runtime')
local frames = {}
local api = require('jusi_neovim.worker-snapshots').new(function(frame) table.insert(frames, frame) end, 1000)
local ticket = { bufferId = 1, incarnation = 1, sessionId = 'fixture', revision = 1 }
local result, failure
api.snapshot(ticket, function(err, value) failure = err; result = value or false end)
local request = frames[#frames]
assert(request.type == 'snapshot' and request.directory:sub(1, 1) == '/')
local path = request.directory .. '/page.png'
local f = assert(io.open(path, 'wb')); f:write('PNG\0bytes'); f:close()
api.receive({ type = 'snapshot-result', id = request.id, ticket = ticket, metadata = { page = 1 },
  files = { { name = 'page.png', media_type = 'image/png', size = 9 } } })
assert(vim.wait(1000, function() return result ~= nil end)); assert(result, failure)
result.release(); assert(vim.fn.isdirectory(request.directory) == 0)
-- Cancel after reply parsing but before the scheduled callback cannot publish.
result = nil
local cancel = api.snapshot(ticket, function(err, value) failure = err; result = value or false end)
request = frames[#frames]
api.receive({ type = 'snapshot-result', id = request.id, ticket = ticket, metadata = {}, files = {} })
cancel()
assert(vim.wait(1000, function() return result ~= nil end)); assert(result == false and failure)
assert(vim.fn.isdirectory(request.directory) == 0)
-- A worker-controlled filename cannot read outside its issued directory.
result = nil
api.snapshot(ticket, function(err, value) failure = err; result = value or false end)
request = frames[#frames]
api.receive({ type = 'snapshot-result', id = request.id, ticket = ticket, metadata = {},
  files = { { name = '../secret', media_type = 'text/plain', size = 1 } } })
assert(vim.wait(1000, function() return result ~= nil end)); assert(not result and failure)
assert(vim.fn.isdirectory(request.directory) == 0)
-- Closing a worker wakes every accepted snapshot waiter.
result = nil
api.snapshot(ticket, function(err, value) failure = err; result = value or false end)
request = frames[#frames]; api.close()
assert(vim.wait(1000, function() return result ~= nil end)); assert(not result and failure)
assert(vim.fn.isdirectory(request.directory) == 0)
print('worker source snapshot tests passed')
vim.cmd('qa!')
