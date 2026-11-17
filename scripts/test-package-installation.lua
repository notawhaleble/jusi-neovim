local jusi = require("jusi_neovim")
local notebook = require("jusi")
local function assert_notebook()
  assert(vim.g.notebook_setup == "configured-in-user-init", "Notebook setup must run with host runtime first")
  assert(require("jusi") == notebook and notebook.marker == "separate-notebook")
  assert(jusi ~= notebook and notebook.register == nil, "Host must not occupy the notebook API")
  assert(require("jusi.document").marker == "notebook-document", "Host submodules must remain separate")
end
assert_notebook()
local sessions = {}
local rpcnotify = vim.rpcnotify
vim.rpcnotify = function(channel, method, payload)
  if method == "jusi:web-session" then sessions[payload.bufferId] = payload end
  return rpcnotify(channel, method, payload)
end
assert(vim.g.loaded_jusi_neovim == 1, "Host must load during normal user-init startup")
assert(vim.fn.exists(":JusiOpen") == 2)
if vim.env.JUSI_PACKAGE_MODE == "host-only" then
  assert(vim.deep_equal(jusi.providers(), {}))
  assert(vim.fn.exists(":JusiWebBuffer") == 0)
  print("host without web package passed")
  vim.cmd("qa!")
  return
end
if vim.env.JUSI_PACKAGE_MODE ~= "lazy" then
  require("argv_provider").setup({ command = { vim.env.JUSI_FIXTURE_NODE, vim.env.JUSI_FIXTURE_SCRIPT } })
end
assert(vim.deep_equal(jusi.providers(), { "argv-fixture", "markdown", "web" }))
assert(not pcall(jusi.register, { id = "bad", api_version = 2, open = function() end }))
assert(not pcall(jusi.register, { id = "web", api_version = 1, open = function() end }))
vim.cmd("JusiWebBuffer https://example.com")
assert(vim.wait(1000, function() return vim.b.jusi_buffer_kind == "web" end))
assert(sessions[vim.api.nvim_get_current_buf()].profile == "configured", "Package manager options must survive plugin startup")
assert(vim.b.jusi_text_layer == "off")
vim.cmd("JusiClose")
require("jusi_web").setup({ profile = "updated", text_layer = "auto" })
assert(not pcall(require("jusi_web").setup, { profile = "invalid profile" }))
require("jusi_web").setup() -- repeated startup must not reset explicit settings
vim.cmd("JusiWebBuffer https://example.com")
assert(vim.wait(1000, function() return vim.b.jusi_buffer_kind == "web" end))
assert(sessions[vim.api.nvim_get_current_buf()].profile == "updated")
assert(vim.b.jusi_text_layer == "auto")
vim.cmd("JusiClose")
local args = { "space argument", [[quote"argument]], "literal; argument", "$(touch SHOULD_NOT_EXIST)", "" }
local target = "file with spaces; and 'quotes'.md"
local buf = jusi.open("argv-fixture", target, { text_layer = "off", args = args })
assert(vim.wait(3000, function() return vim.b[buf].jusi_buffer_kind == "web" end))
local actual = vim.json.decode(table.concat(vim.fn.readfile(vim.env.JUSI_FIXTURE_OUTPUT), "\n"))
local expected = vim.deepcopy(args)
table.insert(expected, target)
assert(vim.deep_equal(actual, expected), "Provider argv must reach executable unchanged")
assert(vim.fn.filereadable("SHOULD_NOT_EXIST") == 0)
vim.cmd("JusiClose")
assert(not vim.api.nvim_buf_is_valid(buf))
require("jusi_markdown").setup({ node = vim.env.JUSI_FIXTURE_NODE, text_layer = "off" })
local md = jusi.open("markdown", vim.env.JUSI_TEST_MARKDOWN .. "/examples/demo.md", {text_layer="off"})
assert(vim.wait(3000,function() return vim.b[md].jusi_buffer_kind == "web" end))
assert(vim.b[md].jusi_text_layer == "off")
vim.cmd("JusiClose")
require("jusi_markdown").setup({ node = "/missing/jusi-markdown-node" })
local missing = jusi.open("markdown", "missing.md")
vim.wait(100,function() return false end)
assert(vim.b[missing].jusi_buffer_kind ~= "web")
vim.api.nvim_buf_delete(missing,{force=true})
print(vim.env.JUSI_PACKAGE_MODE .. " independent provider installation passed")
assert_notebook()
vim.cmd("qa!")
