local M = {}

function M.jump()
  local win, buf = vim.api.nvim_get_current_win(), vim.api.nvim_get_current_buf()
  local ticket = vim.b[buf].jusi_document
  local channel = vim.g.jusi_browser_rpc_channel
  if not ticket or not channel then
    vim.api.nvim_feedkeys("'", "ni", false)
    return
  end
  local free = {}
  for byte = 97, 122 do
    local letter = string.char(byte)
    if vim.api.nvim_buf_get_mark(buf, letter)[1] == 0 then table.insert(free, letter) end
  end
  local letters = table.concat(free)
  local token = tostring(vim.uv.hrtime())
  local function request(...)
    return vim.rpcrequest(channel, "jusi:mark-hints", ticket, win, token, letters, ...)
  end
  local ok, shown = pcall(request)
  if not ok or type(shown) ~= "string" then
    pcall(request, "")
    vim.api.nvim_feedkeys("'", "ni", false)
    return
  end
  local read, key = pcall(vim.fn.getcharstr)
  local delivered, position = pcall(request, read and key or "")
  if not read or key == "\027" or key == "\003" then return end
  if win ~= vim.api.nvim_get_current_win() or buf ~= vim.api.nvim_get_current_buf()
    or not vim.deep_equal(ticket, vim.b[buf].jusi_document) then return end
  if delivered and type(position) == "table" and position.row and position.col
    and key:match("^[a-z]$") and vim.api.nvim_buf_get_mark(buf, key)[1] == 0 then
    local row = position.row + 1
    local line = vim.api.nvim_buf_get_lines(buf, row - 1, row, true)[1]
    local col = vim.fn.byteidxcomp(line, position.col)
    if col >= 0 then
      vim.api.nvim_buf_set_mark(buf, key, row, col, {})
      -- Exact column distinguishes two cells on the same mirror line.
      local jumped, err = pcall(vim.cmd, "normal! `" .. key)
      vim.api.nvim_buf_del_mark(buf, key)
      if not jumped then error(err) end
    end
  elseif not shown:find(key, 1, true) then
    vim.api.nvim_feedkeys("'" .. key, "ni", false)
  end
end

return M
