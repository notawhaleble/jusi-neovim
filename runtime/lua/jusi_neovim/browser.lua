local M = {}
-- Only trusted host calls reach this API; URL text never becomes an Ex command.
function M.location(identity, url)
  local buf = identity.bufferId
  if not vim.api.nvim_buf_is_valid(buf) or vim.b[buf].jusi_incarnation ~= identity.incarnation
    or vim.b[buf].jusi_provider_id ~= "web" or vim.b[buf].jusi_buffer_kind ~= "web"
    or type(url) ~= "string" or url == "" or #url > 32768 or url:find("[%c]") then return false end
  vim.b[buf].jusi_browser_url = url
  -- Neovim treats scheme-only URLs (about:blank) as relative filenames.
  local base = url:match("^[%w+.-]+://") and url or ("jusi-web://" .. url)
  local current = vim.api.nvim_buf_get_name(buf)
  if vim.b[buf].jusi_browser_named_url == url and vim.b[buf].jusi_browser_name == current then return true end
  local occupied, existing = {}, {}
  for _, other in ipairs(vim.api.nvim_list_bufs()) do
    existing[other] = true
    if other ~= buf then occupied[vim.api.nvim_buf_get_name(other)] = true end
  end
  local name, ordinal = base, 2
  while occupied[name] do name = base .. " [" .. ordinal .. "]"; ordinal = ordinal + 1 end
  local ok, err = pcall(vim.api.nvim_buf_set_name, buf, name)
  -- Neovim creates an unloaded alternate buffer for the old name. Remove only
  -- that newly allocated, empty artifact; never a preexisting/user-loaded buffer.
  if ok and current ~= "" and current ~= name then
    for _, other in ipairs(vim.api.nvim_list_bufs()) do
      if not existing[other] and vim.api.nvim_buf_get_name(other) == current
        and not vim.api.nvim_buf_is_loaded(other) and not vim.bo[other].buflisted and not vim.bo[other].modified then
        pcall(vim.api.nvim_buf_delete, other, {})
      end
    end
  end
  if not ok then vim.b[buf].jusi_browser_name_error = tostring(err); return false end
  vim.b[buf].jusi_browser_named_url = url
  vim.b[buf].jusi_browser_name = name
  vim.b[buf].jusi_browser_name_error = nil
  return true
end
function M.command(action)
  local buf, win = vim.api.nvim_get_current_buf(), vim.api.nvim_get_current_win()
  assert(vim.b[buf].jusi_buffer_kind == "web" and vim.b[buf].jusi_provider_id == "web", "Current buffer is not a browser")
  local channel = tonumber(vim.g.jusi_browser_rpc_channel)
  assert(channel and channel > 0, "Jusi host is not connected")
  if action == "toggle-pause" then action = vim.b[buf].jusi_auto_refresh == false and "resume" or "pause" end
  if action == "pause" then vim.b[buf].jusi_auto_refresh = false end
  if action == "resume" then vim.b[buf].jusi_auto_refresh = true end
  if action == "pause" or action == "resume" then vim.cmd("redrawstatus") end
  vim.rpcnotify(channel, "jusi:browser-command", { bufferId = buf, windowId = win,
    incarnation = vim.b[buf].jusi_incarnation, action = action })
end
function M.status(identity, status)
  local buf = identity.bufferId
  if not vim.api.nvim_buf_is_valid(buf) or vim.b[buf].jusi_incarnation ~= identity.incarnation then return false end
  if vim.b[buf].jusi_browser_status ~= status then
    vim.b[buf].jusi_browser_status = status
    vim.cmd("redrawstatus")
  end
  return true
end
function M.statusline()
  local win = tonumber(vim.g.statusline_winid) or vim.api.nvim_get_current_win()
  if not vim.api.nvim_win_is_valid(win) then return "" end
  local buf = vim.api.nvim_win_get_buf(win)
  if vim.b[buf].jusi_text_source == "worker" then
    local labels = { idle="Text pending", building="Building text…", ready="Text ready", error="Text failed" }
    return "[" .. (vim.b[buf].jusi_text_layer == "off" and "Text off" or labels[vim.b[buf].jusi_worker_status] or "Text pending") .. "]"
  end
  if vim.b[buf].jusi_provider_id ~= "web" then return "" end
  local label = vim.b[buf].jusi_browser_private and "Private" or ("Profile: " .. (vim.b[buf].jusi_browser_profile or "default"))
  if vim.b[buf].jusi_text_layer == "off" then label = label .. " | Text off"
  elseif vim.b[buf].jusi_auto_refresh == false then label = label .. " | Text paused"
  elseif vim.b[buf].jusi_browser_status == "ready" then label = label .. " | Text ready"
  else label = label .. " | Text auto" end
  return "[" .. label .. "]"
end
_G.jusi_neovim_browser_statusline = M.statusline
-- Installed formats carry a runtime-owned ID so copied/cached window options
-- retain their exact original local/global inheritance policy.
local formats, format_keys = {}, {}
local function original(format)
  local id = format:match(" %%{v:lua%.jusi_neovim_browser_statusline%((%d+)%)%}$")
  local record = id and formats[tonumber(id)]
  if record and record.installed == format then return record.prior end
  return format
end
function M.attach()
  local win, buf = vim.api.nvim_get_current_win(), vim.api.nvim_get_current_buf()
  local current = vim.api.nvim_get_option_value("statusline", {win=win,scope="local"})
  local prior = original(current)
  if vim.b[buf].jusi_provider_id == "web" or vim.b[buf].jusi_text_source == "worker" then
    local base = prior ~= "" and prior or vim.api.nvim_get_option_value("statusline", {scope="global"})
    if base == "" then base = "%f %h%m%r%=%l,%c %P" end
    local key = vim.fn.json_encode({prior, base})
    local id = format_keys[key]
    if not id then
      id = #formats + 1
      formats[id] = {prior=prior, installed=base .. " %{v:lua.jusi_neovim_browser_statusline(" .. id .. ")}"}
      format_keys[key] = id
    end
    local installed = formats[id].installed
    if current ~= installed then vim.wo[win].statusline = installed end
  else
    if current ~= prior then vim.wo[win].statusline = prior end
  end
end
local group = vim.api.nvim_create_augroup("JusiBrowserStatus", {clear=true})
vim.api.nvim_create_autocmd({"BufWinEnter","WinEnter"}, {group=group,callback=M.attach})
return M
