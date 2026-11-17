vim.opt.runtimepath:prepend(vim.fn.getcwd() .. "/runtime")
local workers = require("jusi_neovim.worker")
local node = vim.fn.exepath("node")
local script = vim.fn.getcwd() .. "/scripts/fixtures/worker/worker.mjs"
local function config(mode, file)
  return { executable = node, argv = { script, mode, file or "" }, cwd = vim.fn.getcwd(), env = {}, ready_timeout_ms = 1500 }
end
local function gone(pid)
  return vim.uv.kill(pid, 0) == nil
end
for _, mode in ipairs({ "invalid", "flood", "version", "capability", "missing", "surface", "timeout", "exit", "cursor-without-navigation", "cursor-without-text", "selection-without-cursor", "viewport-without-cursor" }) do
  local result
  local cfg = config(mode)
  if mode == "timeout" then cfg.ready_timeout_ms = 60 end
  local worker = workers.start(cfg, function(err) result = err end)
  assert(vim.wait(3000, function() return result ~= nil end), mode)
  assert(type(result) == "string", mode)
  assert(worker.state == "closed", mode)
  assert(vim.wait(2000, function() return gone(worker.pid) end), mode .. " leaked leader")
end
local result
local cfg = config("ok"); cfg.executable = "/jusi-missing-executable"
local missing = workers.start(cfg, function(err) result = err end)
assert(vim.wait(1000, function() return result ~= nil end))
assert(missing.state == "closed")
assert(not pcall(workers.start, { executable = node, cwd = "/", env = {}, argv = { "bad\0arg" } }, function() end))
for _, mode in ipairs({ "ok", "stderr", "tree" }) do
  local file = vim.fn.tempname()
  local surface
  local worker = workers.start(config(mode, file), function(err, value) assert(not err, err); surface = value end)
  assert(vim.wait(3000, function() return surface ~= nil end))
  assert(surface.url == "about:blank")
  local child
  if mode == "tree" then child = tonumber(vim.fn.readfile(file)[1]); vim.fn.delete(file) end
  if mode == "stderr" then assert(#worker.stderr <= 8192) end
  worker.close(); worker.close()
  assert(vim.wait(2000, function() return gone(worker.pid) end), "leader survived close")
  if child then assert(vim.wait(3000, function() return gone(child) end), "descendant survived close") end
end
for _, mode in ipairs({ "duplicate", "after-exit", "tree-exit" }) do
  local failed
  local file = vim.fn.tempname()
  local worker = workers.start(config(mode, file), function() end, function(err) failed = err end)
  assert(vim.wait(3000, function() return failed ~= nil end))
  assert(worker.state == "closed")
  if mode == "tree-exit" then
    local child = tonumber(vim.fn.readfile(file)[1]); vim.fn.delete(file)
    assert(vim.wait(3000, function() return gone(child) end), "descendant survived parent exit")
  end
end
local called = false
local cancelled = workers.start(config("timeout"), function() called = true end)
cancelled.close()
vim.wait(100)
assert(not called, "closed worker called readiness")
local remaining = workers.start(config("timeout"), function() end)
workers.close_all()
assert(vim.wait(2000, function() return gone(remaining.pid) end))
print("worker transport tests passed")
vim.cmd("qa!")
