vim.opt.runtimepath:prepend(vim.env.JUSI_WORKER_ROOT .. "/runtime")
vim.cmd("runtime plugin/jusi_neovim.lua")
local worker = require("jusi_neovim.worker").start({
  executable = vim.env.JUSI_WORKER_NODE,
  argv = { vim.env.JUSI_WORKER_ROOT .. "/scripts/fixtures/worker/lifecycle.mjs", vim.env.JUSI_WORKER_MODE, vim.env.JUSI_WORKER_FILE },
  cwd = vim.env.JUSI_WORKER_ROOT, env = {},
}, function(err)
  assert(not err, err)
  vim.fn.writefile({ "ready" }, vim.env.JUSI_WORKER_FILE .. ".ready")
end)
vim.fn.writefile({ tostring(worker.pid) }, vim.env.JUSI_WORKER_FILE .. ".guardian")
assert(vim.wait(3000, function() return vim.fn.filereadable(vim.env.JUSI_WORKER_FILE .. ".ready") == 1 end))
if vim.env.JUSI_WORKER_ACTION == "exit" then vim.cmd("qa!") end
if vim.env.JUSI_WORKER_ACTION == "close" then
  worker.close()
  require("jusi_neovim.worker").close_all()
  vim.cmd("qa!")
end
vim.wait(30000, function() return false end)
error("Owner fixture timed out")
