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
  notify("jusi:web-session", {
    bufferId = bufnr,
    url = url or "",
    title = nil,
  })
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

vim.api.nvim_create_autocmd({ "WinLeave", "VimResized", "WinResized", "WinScrolled" }, {
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
