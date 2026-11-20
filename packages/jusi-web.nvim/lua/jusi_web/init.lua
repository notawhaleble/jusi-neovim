local M = {}
local configured = false
local settings
function M.profile_result(result)
  M.last_profile_result = result
  vim.notify(result.message, result.ok and vim.log.levels.INFO or vim.log.levels.ERROR)
end
-- Validate the initiating view at the Neovim mutation boundary.
function M.open_link_tab(request)
  local source = request.bufferId
  if vim.api.nvim_get_current_win() ~= request.windowId or vim.api.nvim_get_current_tabpage() ~= request.tabId
    or vim.api.nvim_get_current_buf() ~= source or vim.b[source].jusi_incarnation ~= request.incarnation
    or vim.b[source].jusi_buffer_kind ~= "web" then return false end
  assert(type(request.url) == "string" and #request.url <= 32768
    and request.url:match("^https?://") and not request.url:find("[%c%s]"), "Invalid web link")
  local opts = { profile = vim.b[source].jusi_browser_profile,
    private = vim.b[source].jusi_browser_private, text_layer = vim.b[source].jusi_text_layer }
  local previous = vim.api.nvim_get_current_tabpage()
  vim.cmd("tabnew")
  local tab = vim.api.nvim_get_current_tabpage()
  local scratch = vim.api.nvim_get_current_buf()
  local ok, result = pcall(require("jusi_neovim").open, "web", request.url, opts)
  if not ok then
    if vim.api.nvim_tabpage_is_valid(tab) then vim.cmd("tabclose!") end
    if vim.api.nvim_tabpage_is_valid(previous) then vim.api.nvim_set_current_tabpage(previous) end
    error(result)
  end
  if vim.api.nvim_buf_is_valid(scratch) then vim.api.nvim_buf_delete(scratch, { force = true }) end
  return result
end
function M.setup(opts)
  if configured and opts == nil then return end
  local next_settings = vim.tbl_extend("force", { profile = "default", text_layer = "auto" }, opts or vim.g.jusi_web or {})
  assert(next_settings.text_layer == "auto" or next_settings.text_layer == "off", "text_layer must be auto or off")
  assert(type(next_settings.profile) == "string" and #next_settings.profile <= 64
    and next_settings.profile:match("^[%w_-]+$"), "Invalid profile")
  if not configured then
    require("jusi_neovim").register({
      api_version = 1,
      id = "web",
      open = function(request, ready)
        ready(nil, { backend = "web", url = request.target ~= "" and request.target or "about:blank" })
      end,
    })
    vim.api.nvim_create_user_command("JusiWebBuffer", function(command)
      require("jusi_neovim").open("web", command.args, {
        text_layer = command.bang and "off" or settings.text_layer,
        profile = settings.profile,
      })
    end, { nargs = "?", bang = true })
    vim.api.nvim_create_user_command("JusiWebPrivate", function(command)
      require("jusi_neovim").open("web", command.args, {
        text_layer = command.bang and "off" or settings.text_layer,
        profile = settings.profile, private = true,
      })
    end, { nargs = "?", bang = true })
    vim.api.nvim_create_user_command("JusiWebProfile", function(command)
      if command.args ~= "" then
        assert(#command.args <= 64 and command.args:match("^[%w_-]+$"), "Invalid profile")
        settings.profile = command.args
      end
      local current = vim.b.jusi_browser_profile
      local label = vim.b.jusi_browser_private and "private" or current
      vim.notify("New browser buffers: " .. settings.profile ..
        (label and ("; current buffer: " .. label) or ""))
    end, { nargs = "?" })
    for name, action in pairs({ JusiWebPermissions = "permissions", JusiWebRevoke = "revoke", JusiWebClear = "clear" }) do
      vim.api.nvim_create_user_command(name, function(command)
        assert(#command.args <= 64 and command.args:match("^[%w_-]+$"), "Explicit profile name required")
        local channel = tonumber(vim.g.jusi_browser_rpc_channel)
        assert(channel and channel > 0, "Jusi host is not connected")
        M.last_profile_result = nil
        vim.rpcnotify(channel, "jusi:browser-profile", { profile = command.args, action = action })
      end, { nargs = 1 })
    end
    for name, action in pairs({JusiWebDebugMark="debug-mark", JusiWebTogglePause="toggle-pause", JusiWebDevTools="devtools", JusiWebPause="pause", JusiWebResume="resume", JusiWebRefresh="refresh"}) do
      vim.api.nvim_create_user_command(name, function() require("jusi_neovim.browser").command(action) end, {})
    end
    vim.api.nvim_create_user_command("JusiWebAllowPopup", function(command)
      require("jusi_neovim.browser").command(command.bang and "allow-page-popups" or "allow-popup")
    end, { bang = true })
    configured = true
  end
  settings = vim.deepcopy(next_settings)
end
return M
