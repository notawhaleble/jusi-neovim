local M = {}
-- Window views belong to Neovim. Keep anchors private across repeated invalidations.
local pending = {}
local function capture(buf, ticket)
  if pending[buf] and pending[buf].sessionId == ticket.sessionId
    and pending[buf].incarnation == ticket.incarnation then return end
  local views = {}
  for _, win in ipairs(vim.fn.win_findbuf(buf)) do
    vim.api.nvim_win_call(win, function()
      local view = vim.fn.winsaveview()
      views[win] = { view = view, text = vim.api.nvim_buf_get_lines(buf, view.lnum - 1, view.lnum, false)[1] }
    end)
  end
  pending[buf] = { sessionId = ticket.sessionId, incarnation = ticket.incarnation, views = views }
end
local function restore(buf, ticket, lines)
  local saved = pending[buf]
  pending[buf] = nil
  if not saved or saved.sessionId ~= ticket.sessionId or saved.incarnation ~= ticket.incarnation then return end
  for win, anchor in pairs(saved.views) do
    if vim.api.nvim_win_is_valid(win) and vim.api.nvim_win_get_buf(win) == buf then
      local view, best = anchor.view, nil
      for row, text in ipairs(lines) do
        if text == anchor.text and (not best or math.abs(row - view.lnum) < math.abs(best - view.lnum)) then best = row end
      end
      local row = best or math.min(view.lnum, math.max(1, #lines))
      view.topline = math.max(1, view.topline + row - view.lnum)
      view.lnum = row
      view.col = math.min(view.col, math.max(0, #(lines[row] or "") - 1))
      vim.api.nvim_win_call(win, function() vim.fn.winrestview(view) end)
    end
  end
end
local function matches_buffer(ticket)
  local buf = ticket.bufferId
  return type(buf) == "number" and vim.api.nvim_buf_is_valid(buf)
    and vim.b[buf].jusi_buffer_kind == "web"
    and vim.b[buf].jusi_incarnation == ticket.incarnation
end
local function write(buf, lines)
  local modifiable, readonly = vim.bo[buf].modifiable, vim.bo[buf].readonly
  vim.bo[buf].modifiable, vim.bo[buf].readonly = true, false
  local ok, err = pcall(vim.api.nvim_buf_set_lines, buf, 0, -1, false, lines)
  vim.bo[buf].modified = false
  vim.bo[buf].readonly, vim.bo[buf].modifiable = readonly, modifiable
  if not ok then error(err) end
end
vim.api.nvim_create_autocmd("BufWipeout", { callback = function(event) pending[event.buf] = nil end })
function M.invalidate(ticket)
  if not matches_buffer(ticket) then return false end
  local prior = vim.b[ticket.bufferId].jusi_document
  if prior and (prior.sessionId ~= ticket.sessionId or prior.revision >= ticket.revision) then return false end
  require("jusi_neovim").cancel_text(ticket.bufferId)
  require("jusi_neovim").clear_worker_document(ticket.bufferId)
  vim.b[ticket.bufferId].jusi_document = ticket
  capture(ticket.bufferId, ticket)
  write(ticket.bufferId, {})
  return true
end
function M.commit(ticket, lines)
  if not matches_buffer(ticket) or vim.b[ticket.bufferId].jusi_text_layer == "off" then return false end
  local current = vim.b[ticket.bufferId].jusi_document
  if not current or current.sessionId ~= ticket.sessionId or current.revision ~= ticket.revision then return false end
  write(ticket.bufferId, lines)
  restore(ticket.bufferId, ticket, lines)
  return true
end
function M.commit_worker(ticket, document)
  local validated, err = require("jusi_neovim.worker-documents").validate(document)
  if not validated then error(err) end
  local lines = {}
  for _, line in ipairs(validated.lines) do table.insert(lines, line.text) end
  if not M.commit(ticket, lines) then return false end
  require("jusi_neovim").accept_worker_document(ticket, validated)
  return true
end
return M
