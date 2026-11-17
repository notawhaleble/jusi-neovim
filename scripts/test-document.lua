vim.opt.runtimepath:prepend(vim.fn.getcwd() .. "/runtime")
local doc = require("jusi_neovim.document")
local buf = vim.api.nvim_create_buf(true, true)
vim.b[buf].jusi_buffer_kind = "web"
vim.b[buf].jusi_incarnation = 1
local ticket = {bufferId = buf, sessionId = "one", incarnation = 1, revision = 1}
assert(doc.invalidate(ticket))
assert(doc.commit(ticket, {"first"}))
local next = vim.tbl_extend("force", ticket, {revision = 2})
assert(doc.invalidate(next))
assert(not doc.commit(ticket, {"stale"}))
assert(vim.api.nvim_buf_get_lines(buf, 0, -1, false)[1] == "")
assert(doc.commit(next, {"current"}))
-- Independent windows retain their anchors through repeated invalidation and insertions.
vim.api.nvim_set_current_buf(buf)
local anchor_ticket = vim.tbl_extend("force", ticket, {revision = 3})
assert(doc.invalidate(anchor_ticket))
assert(doc.commit(anchor_ticket, {"heading", "reading 😀 here", "tail"}))
local first = vim.api.nvim_get_current_win()
vim.api.nvim_win_set_cursor(first, {2, 8})
vim.cmd("vsplit")
local second = vim.api.nvim_get_current_win()
vim.api.nvim_win_set_cursor(second, {3, 2})
local refresh = vim.tbl_extend("force", ticket, {revision = 4})
assert(doc.invalidate(refresh))
refresh.revision = 5
assert(doc.invalidate(refresh))
assert(doc.commit(refresh, {"inserted", "heading", "reading 😀 here", "tail"}))
assert(vim.deep_equal(vim.api.nvim_win_get_cursor(first), {3, 8}))
assert(vim.deep_equal(vim.api.nvim_win_get_cursor(second), {4, 2}))
refresh = vim.tbl_extend("force", ticket, {revision = 6})
assert(doc.invalidate(refresh))
assert(doc.commit(refresh, {"short"}))
assert(vim.api.nvim_win_get_cursor(first)[1] == 1)
vim.api.nvim_win_close(second, true)
vim.b[buf].jusi_incarnation = 2
vim.b[buf].jusi_document = nil
assert(not doc.commit(next, {"old provider"}))
local replaced = {bufferId = buf, sessionId = "two", incarnation = 2, revision = 1}
assert(doc.invalidate(replaced))
assert(not doc.invalidate(next))
vim.b[buf].jusi_text_layer = "off"
assert(not doc.commit(replaced, {"disabled"}))
vim.api.nvim_buf_delete(buf, {force = true})
assert(not doc.commit(replaced, {"deleted"}))
print("Neovim document revision tests passed")
vim.cmd("qa!")
