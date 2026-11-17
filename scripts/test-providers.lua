vim.opt.runtimepath:prepend(vim.fn.getcwd() .. "/runtime")
vim.opt.runtimepath:append(vim.fn.getcwd() .. "/packages/jusi-web.nvim")
vim.cmd("runtime plugin/jusi_neovim.lua")
vim.cmd("runtime plugin/jusi_web.lua")
local jusi = require("jusi_neovim")
assert(not pcall(jusi.register, { id = "bad", api_version = 2, open = function() end }))
local closed = 0
local late
jusi.register({ id = "fixture", api_version = 1, open = function(request, ready)
  assert(request.options.command[2] == "literal; argument")
  late = ready
  return function() closed = closed + 1 end
end })
assert(not pcall(jusi.register, { id = "fixture", api_version = 1, open = function() end }))
vim.api.nvim_buf_set_lines(0, 0, -1, false, { "keep my edits" })
local edited = vim.api.nvim_get_current_buf()
local buf = jusi.open("fixture", "test", { command = { "viewer", "literal; argument" } })
assert(edited ~= buf)
assert(vim.api.nvim_buf_get_lines(edited, 0, -1, false)[1] == "keep my edits")
jusi.close(buf)
jusi.close(buf)
assert(closed == 1)
late(nil, { backend = "web", url = "https://example.com" })
vim.wait(50)
assert(vim.b[buf].jusi_buffer_kind ~= "web")
vim.cmd("JusiWebBuffer! https://example.com")
assert(vim.wait(1000, function() return vim.b.jusi_buffer_kind == "web" end))
assert(vim.b.jusi_text_layer == "off")
local web = vim.api.nvim_get_current_buf()
local incarnation = vim.b[web].jusi_incarnation
local count_tabs = #vim.api.nvim_list_tabpages()
local open_link = require("jusi_web").open_link_tab
local link = { bufferId = web, incarnation = incarnation, windowId = vim.api.nvim_get_current_win(),
  tabId = vim.api.nvim_get_current_tabpage(), url = "https://example.com/?literal=quote%22|tabnew" }
assert(open_link(vim.tbl_extend("force", link, { incarnation = incarnation + 1 })) == false)
vim.cmd("split")
assert(open_link(link) == false)
vim.cmd("close")
vim.cmd("tab split")
assert(open_link(link) == false)
vim.cmd("tabclose")
assert(#vim.api.nvim_list_tabpages() == count_tabs)
local linked = open_link(link)
assert(vim.wait(1000, function() return vim.b[linked].jusi_buffer_kind == "web" end))
assert(#vim.api.nvim_list_tabpages() == count_tabs + 1)
assert(vim.b[linked].jusi_text_layer == "off" and vim.b[linked].jusi_browser_profile == "default")
assert(vim.api.nvim_buf_is_valid(web))
assert(vim.api.nvim_buf_get_lines(edited, 0, -1, false)[1] == "keep my edits")
vim.cmd("JusiClose")
vim.cmd("JusiClose")
assert(not vim.api.nvim_buf_is_valid(web))
vim.cmd("JusiWebProfile work")
vim.cmd("JusiWebPrivate! https://example.com")
assert(vim.wait(1000, function() return vim.b.jusi_buffer_kind == "web" end))
assert(vim.b.jusi_browser_private == true and vim.b.jusi_browser_profile == "work")
local private = vim.api.nvim_get_current_buf()
vim.cmd("JusiWebProfile personal")
assert(vim.b[private].jusi_browser_profile == "work", "selection does not move existing account")
assert(not pcall(vim.cmd, "JusiWebProfile ../invalid"))
vim.cmd("JusiWebBuffer https://example.com")
assert(vim.wait(1000, function() return vim.b.jusi_buffer_kind == "web" end))
assert(vim.b.jusi_browser_private == false and vim.b.jusi_browser_profile == "personal")
vim.cmd("JusiClose")
vim.api.nvim_buf_delete(private, { force = true })
local errors = {}
local notify = vim.notify
vim.notify = function(message) table.insert(errors, tostring(message)) end
for _, scenario in ipairs({ "throw", "error", "unsupported" }) do
  local disposed = 0
  jusi.register({ id = scenario, api_version = 1, open = function(_, ready)
    if scenario == "throw" then error("startup failed") end
    if scenario == "error" then ready("startup failed")
    else ready(nil, { backend = "unknown", url = "about:blank" }) end
    return function() disposed = disposed + 1 end
  end })
  local count = #errors
  local failed = jusi.open(scenario, "target")
  assert(vim.wait(1000, function() return #errors > count end))
  assert(vim.b[failed].jusi_buffer_kind ~= "web")
  jusi.close(failed)
  assert(disposed == (scenario == "throw" and 0 or 1))
  vim.api.nvim_buf_delete(failed, { force = true })
end
local ready_twice
local disposed = 0
jusi.register({ id = "duplicate-ready", api_version = 1, open = function(_, ready)
  ready_twice = ready
  ready(nil, { backend = "web", url = "about:blank" })
  ready("must be ignored")
  return function() disposed = disposed + 1 end
end })
local count = #errors
local duplicate = jusi.open("duplicate-ready", "target")
assert(vim.wait(1000, function() return vim.b[duplicate].jusi_buffer_kind == "web" end))
assert(#errors == count)
vim.api.nvim_buf_delete(duplicate, { force = true })
ready_twice(nil, { backend = "web", url = "about:blank" })
vim.wait(20)
assert(disposed == 1)
vim.notify = notify
print("provider runtime tests passed")
vim.cmd("qa!")
