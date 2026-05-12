if vim.g.loaded_jusi_neovim == 1 then
  return
end
vim.g.loaded_jusi_neovim = 1

local M = {}
local snapshot_scheduled = false

local function notify(method, payload)
  pcall(vim.rpcnotify, 0, method, payload)
end

local function buffer_kind(bufnr)
  local value = vim.b[bufnr].jusi_buffer_kind
  if value == "web" then
    return "web"
  end
  return "text"
end

local function buffer_name(bufnr)
  local name = vim.api.nvim_buf_get_name(bufnr)
  if name == "" then
    return nil
  end
  return name
end

local function byte_to_char_col(bufnr, row, byte_col)
  local text_ok, text = pcall(vim.api.nvim_buf_get_text, bufnr, row, 0, row, byte_col, {})
  local prefix = ""
  if text_ok and type(text) == "table" then
    prefix = table.concat(text, "")
  else
    local line = vim.api.nvim_buf_get_lines(bufnr, row, row + 1, false)[1] or ""
    prefix = string.sub(line, 1, byte_col)
  end

  return vim.fn.strchars(prefix)
end

local function buffer_position(bufnr, lnum, byte_col)
  local row = math.max(0, lnum - 1)
  return {
    row = row,
    col = byte_to_char_col(bufnr, row, math.max(0, byte_col)),
  }
end

local function window_cursor(winid)
  local ok, cursor = pcall(vim.api.nvim_win_get_cursor, winid)
  if not ok then
    return nil
  end

  local bufnr = vim.api.nvim_win_get_buf(winid)
  local row = math.max(0, cursor[1] - 1)
  return {
    row = row,
    col = byte_to_char_col(bufnr, row, math.max(0, cursor[2])),
  }
end

local function line_char_count(bufnr, row)
  local line = vim.api.nvim_buf_get_lines(bufnr, row, row + 1, false)[1] or ""
  return vim.fn.strchars(line)
end

local function compare_positions(left, right)
  if left.row ~= right.row then
    return left.row < right.row
  end
  return left.col <= right.col
end

local function window_selection(winid, bufnr)
  if vim.api.nvim_get_current_win() ~= winid then
    return nil
  end

  local mode = vim.fn.mode()
  if mode ~= "v" and mode ~= "V" and mode ~= "\022" then
    return nil
  end

  local anchor = vim.fn.getpos("v")
  local cursor = vim.fn.getpos(".")
  local start = buffer_position(bufnr, anchor[2], anchor[3] - 1)
  local finish = buffer_position(bufnr, cursor[2], cursor[3] - 1)
  local linewise = mode == "V"

  if not compare_positions(start, finish) then
    local tmp = start
    start = finish
    finish = tmp
  end

  if linewise then
    start.col = 0
    finish.col = line_char_count(bufnr, finish.row)
  end

  return {
    start = start,
    ["end"] = finish,
    linewise = linewise,
  }
end

local function notify_buffer(bufnr)
  if not vim.api.nvim_buf_is_valid(bufnr) then
    return
  end
  notify("jusi:layout", {
    type = "buffer",
    bufferId = bufnr,
    kind = buffer_kind(bufnr),
    name = buffer_name(bufnr),
  })
end

local function notify_window(winid)
  if not vim.api.nvim_win_is_valid(winid) then
    return
  end

  local bufnr = vim.api.nvim_win_get_buf(winid)
  local tabnr = vim.api.nvim_win_get_tabpage(winid)
  local position = vim.api.nvim_win_get_position(winid)
  local width = vim.api.nvim_win_get_width(winid)
  local height = vim.api.nvim_win_get_height(winid)
  notify("jusi:layout", {
    type = "window",
    windowId = winid,
    tabId = tabnr,
    bufferId = bufnr,
    cursor = window_cursor(winid),
    selection = buffer_kind(bufnr) == "web" and window_selection(winid, bufnr) or nil,
    row = position[1],
    col = position[2],
    width = width,
    height = height,
  })
end

local function notify_tab(tabnr)
  if not vim.api.nvim_tabpage_is_valid(tabnr) then
    return
  end

  local current_window = vim.api.nvim_tabpage_get_win(tabnr)
  notify("jusi:layout", {
    type = "tab",
    tabId = tabnr,
    currentWindowId = current_window,
  })
  notify("jusi:layout", {
    type = "tab-current-window",
    tabId = tabnr,
    windowId = current_window,
  })
end

local function notify_current_tab()
  notify("jusi:layout", {
    type = "current-tab",
    tabId = vim.api.nvim_get_current_tabpage(),
  })
end

function M.notify_full_snapshot()
  notify_current_tab()

  for _, tabnr in ipairs(vim.api.nvim_list_tabpages()) do
    notify_tab(tabnr)
  end

  for _, bufnr in ipairs(vim.api.nvim_list_bufs()) do
    notify_buffer(bufnr)
  end

  for _, winid in ipairs(vim.api.nvim_list_wins()) do
    notify_window(winid)
  end
end

local function schedule_full_snapshot()
  if snapshot_scheduled then
    return
  end
  snapshot_scheduled = true
  vim.schedule(function()
    snapshot_scheduled = false
    M.notify_full_snapshot()
  end)
end

function M.set_buffer_kind(kind, bufnr)
  bufnr = bufnr or vim.api.nvim_get_current_buf()
  if kind ~= "web" and kind ~= "text" then
    error("Invalid buffer kind: " .. tostring(kind))
  end

  vim.b[bufnr].jusi_buffer_kind = kind
  notify_buffer(bufnr)
end

function M.open_web_buffer(url)
  local bufnr = vim.api.nvim_get_current_buf()
  M.set_buffer_kind("web", bufnr)
  M.apply_web_buffer_maps(bufnr)
  notify("jusi:web-session", {
    bufferId = bufnr,
    url = url or "",
    title = nil,
  })
end

function M.notify_web_scroll(delta)
  local winid = vim.api.nvim_get_current_win()
  local bufnr = vim.api.nvim_win_get_buf(winid)
  notify("jusi:web-scroll", {
    windowId = winid,
    bufferId = bufnr,
    lines = delta,
  })
end

function M.apply_web_buffer_maps(bufnr)
  if vim.b[bufnr].jusi_web_buffer_maps == 1 then
    return
  end

  local function map_scroll(lhs, delta, termcode)
    vim.keymap.set({ "n", "x" }, lhs, function()
      local count = vim.v.count1
      M.notify_web_scroll(delta * count)
      return tostring(count) .. vim.api.nvim_replace_termcodes(termcode, true, false, true)
    end, {
      buffer = bufnr,
      expr = true,
      remap = false,
      silent = true,
    })
  end

  map_scroll("<C-e>", 1, "<C-e>")
  map_scroll("<C-y>", -1, "<C-y>")
  vim.b[bufnr].jusi_web_buffer_maps = 1
end

vim.api.nvim_create_user_command("JusiWebBuffer", function(opts)
  M.open_web_buffer(opts.args ~= "" and opts.args or "")
end, {
  nargs = "?",
})

vim.api.nvim_create_user_command("JusiTextBuffer", function()
  M.set_buffer_kind("text")
end, {})

local group = vim.api.nvim_create_augroup("jusi_neovim_runtime", { clear = true })

vim.api.nvim_create_autocmd({ "VimEnter", "TabEnter" }, {
  group = group,
  callback = function()
    schedule_full_snapshot()
  end,
})

vim.api.nvim_create_autocmd({ "BufEnter", "BufFilePost", "BufAdd" }, {
  group = group,
  callback = function(args)
    if buffer_kind(args.buf) == "web" then
      M.apply_web_buffer_maps(args.buf)
    end
    notify_buffer(args.buf)
    schedule_full_snapshot()
  end,
})

vim.api.nvim_create_autocmd({ "BufDelete" }, {
  group = group,
  callback = function(args)
    notify("jusi:layout", {
      type = "buffer-close",
      bufferId = args.buf,
    })
  end,
})

vim.api.nvim_create_autocmd({ "WinEnter", "WinNew" }, {
  group = group,
  callback = function()
    schedule_full_snapshot()
  end,
})

vim.api.nvim_create_autocmd({ "CursorMoved", "CursorMovedI" }, {
  group = group,
  callback = function()
    local winid = vim.api.nvim_get_current_win()
    local bufnr = vim.api.nvim_win_get_buf(winid)
    if buffer_kind(bufnr) == "web" then
      notify_window(winid)
    end
  end,
})

vim.api.nvim_create_autocmd({ "ModeChanged" }, {
  group = group,
  callback = function()
    local winid = vim.api.nvim_get_current_win()
    local bufnr = vim.api.nvim_win_get_buf(winid)
    if buffer_kind(bufnr) == "web" then
      notify_window(winid)
    end
  end,
})

vim.api.nvim_create_autocmd({ "WinLeave", "VimResized", "WinResized" }, {
  group = group,
  callback = function()
    schedule_full_snapshot()
  end,
})

vim.api.nvim_create_autocmd({ "WinClosed" }, {
  group = group,
  callback = function(args)
    local winid = tonumber(args.match)
    if not winid then
      return
    end
    notify("jusi:layout", {
      type = "window-close",
      windowId = winid,
    })
    schedule_full_snapshot()
  end,
})

vim.api.nvim_create_autocmd({ "TabClosed" }, {
  group = group,
  callback = function(args)
    local tabnr = tonumber(args.match)
    if not tabnr then
      return
    end
    notify("jusi:layout", {
      type = "tab-close",
      tabId = tabnr,
    })
    schedule_full_snapshot()
  end,
})

vim.schedule(function()
  M.notify_full_snapshot()
end)

_G.jusi_neovim_notify_full_snapshot = function()
  M.notify_full_snapshot()
end

return M
