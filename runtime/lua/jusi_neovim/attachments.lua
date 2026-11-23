-- Consumers resolve a row to a live destination before clipboard I/O begins.
local M = {}
local consumers = {}
local limit = 16 * 1024 * 1024

function M.register(buf, capture)
  consumers[buf] = capture
  return function() if consumers[buf] == capture then consumers[buf] = nil end end
end

function M.paste()
  local buf = vim.api.nvim_get_current_buf()
  local capture = assert(consumers[buf], 'This buffer does not accept attachments')
  local accept = capture(vim.api.nvim_win_get_cursor(0)[1] - 1)
  local encoded = vim.rpcrequest(vim.g.jusi_neovim_rpc_channel, 'jusi:image-paste')
  assert(type(encoded) == 'string' and encoded ~= '', 'Clipboard has no supported PNG image')
  accept({ { name = 'Screenshot.png', media_type = 'image/png', bytes = vim.base64.decode(encoded) } })
end

function M.drop(target, files)
  local win, buf = target.windowId, target.bufferId
  assert(vim.api.nvim_win_is_valid(win) and vim.api.nvim_win_get_buf(win) == buf
    and vim.api.nvim_get_current_tabpage() == target.tabId and vim.api.nvim_win_get_tabpage(win) == target.tabId,
    'Image drop destination changed')
  local capture = assert(consumers[buf], 'This buffer does not accept attachments')
  local row = vim.api.nvim_win_call(win, function()
    local screenrow = vim.fn.win_screenpos(win)[1] + target.row
    local line, last = vim.fn.line('w0'), vim.fn.line('w$')
    while line <= last do
      local start = vim.fn.screenpos(win, line, 1).row
      local finish = vim.fn.screenpos(win, line, math.max(1, vim.fn.col({line, '$'}) - 1)).row
      if start > 0 and start <= screenrow and screenrow <= math.max(start, finish) then return line - 1 end
      line = math.max(line, vim.fn.foldclosedend(line)) + 1
    end
  end)
  local accept = capture(assert(row, 'Drop onto a visible notebook line'))
  local attachments, total = {}, 0
  assert(#files > 0 and #files <= 8, 'Drop up to eight files')
  for _, dropped in ipairs(files) do
    local path = dropped.path
    local stat = vim.uv.fs_stat(path)
    assert(stat and stat.type == 'file' and stat.size <= limit - total, 'Attachment exceeds 16 MiB or is not a file')
    local file = assert(io.open(path, 'rb'))
    local bytes = file:read(stat.size + 1)
    file:close()
    assert(bytes and #bytes == stat.size, 'File changed during drop')
    total = total + #bytes
    table.insert(attachments, { name = vim.fs.basename(path), media_type = dropped.media_type, bytes = bytes })
  end
  accept(attachments)
end

return M
