-- Internal host protocol. No document or provider-supplied partition/guest handles.
local M = {}
local epoch, high_water = nil, 0
local children = {}
local function remove(entry)
  if not entry then return end
  local buf = entry.bufferId
  if vim.api.nvim_buf_is_valid(buf) and vim.b[buf].jusi_native_child == entry.token
    and vim.b[buf].jusi_incarnation == entry.incarnation then
    require("jusi_neovim").close(buf)
    if entry.windowId and vim.api.nvim_win_is_valid(entry.windowId) and vim.api.nvim_win_get_buf(entry.windowId) == buf then
      pcall(vim.api.nvim_win_close, entry.windowId, true)
    end
    if vim.api.nvim_buf_is_valid(buf) then vim.api.nvim_buf_delete(buf, { force = true }) end
  end
end
function M.connect(value)
  assert(type(value) == "string" and #value == 36, "Invalid host epoch")
  if epoch == value then return true end
  for _, entry in pairs(children) do remove(entry) end
  children, epoch, high_water = {}, value, 0
  return true
end
function M.cancel(request)
  if request.epoch ~= epoch then return false end
  assert(type(request.sequence) == "number" and request.sequence > 0 and request.sequence % 1 == 0)
  high_water = math.max(high_water, request.sequence)
  local entry = children[request.sequence]
  children[request.sequence] = nil
  remove(entry)
  return true
end
-- Focus/mode changes use the same reservation identity as lifecycle operations.
function M.set_mode(request)
  if request.epoch ~= epoch then return false end
  local entry = children[request.sequence]
  if not entry or entry.token ~= request.token or entry.incarnation ~= request.incarnation
    or entry.bufferId ~= request.bufferId or not vim.api.nvim_buf_is_valid(entry.bufferId)
    or vim.b[entry.bufferId].jusi_incarnation ~= entry.incarnation
    or vim.b[entry.bufferId].jusi_native_child ~= entry.token
    or not vim.api.nvim_win_is_valid(entry.windowId)
    or vim.api.nvim_win_get_buf(entry.windowId) ~= entry.bufferId
    or vim.api.nvim_win_get_tabpage(entry.windowId) ~= vim.api.nvim_get_current_tabpage()
    or (request.mode ~= "rich" and request.mode ~= "text") then return false end
  if vim.api.nvim_get_current_win() ~= entry.windowId then vim.api.nvim_set_current_win(entry.windowId) end
  return require("jusi_neovim").set_mode(entry.bufferId, entry.incarnation, entry.windowId, request.mode)
end
function M.allocate(request)
  if request.epoch ~= epoch or type(request.sequence) ~= "number"
    or request.sequence % 1 ~= 0 or request.sequence <= high_water then return false end
  -- Monotonic requests/cancellations reject late allocation without unbounded tombstones.
  high_water = request.sequence
  assert(type(request.token) == "string" and #request.token == 36, "Invalid reservation")
  local source = request.source
  if type(source) ~= "table" or not vim.api.nvim_buf_is_valid(source.bufferId)
    or vim.b[source.bufferId].jusi_incarnation ~= source.incarnation
    or vim.b[source.bufferId].jusi_buffer_kind ~= "web" then return false end
  assert(type(request.url) == "string" and #request.url <= 32768
    and (request.url == "about:blank" or request.url:match("^https?://"))
    and not request.url:find("[%c%s]"), "Invalid child URL")
  -- Never open in an unrelated tab after the user has changed context.
  local source_windows = {}
  for _, win in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
    if vim.api.nvim_win_get_buf(win) == source.bufferId then table.insert(source_windows, win) end
  end
  local origin = vim.api.nvim_get_current_win()
  if vim.api.nvim_win_get_buf(origin) ~= source.bufferId then
    if #source_windows ~= 1 then return false end
    origin = source_windows[1]
  end
  local opts = { providerId = "web", nativeChild = request.token,
    profile = vim.b[source.bufferId].jusi_browser_profile,
    privateBrowsing = vim.b[source.bufferId].jusi_browser_private,
    textLayer = vim.b[source.bufferId].jusi_text_layer }
  local buf = vim.api.nvim_create_buf(true, true)
  local entry = { bufferId = buf, token = request.token }
  children[request.sequence] = entry
  local ok, err = pcall(function()
    -- This is a reservation: no normal webview may attach to this buffer.
    _G.jusi_neovim_open_surface(buf, request.url, opts)
    entry.incarnation = vim.b[buf].jusi_incarnation
    require("jusi_neovim").attach_native(buf, entry.incarnation, entry.token)
    -- Closing this window wipes only its presentation, not its source.
    vim.bo[buf].bufhidden = "wipe"
    vim.api.nvim_set_current_win(origin)
    vim.cmd("belowright new")
    entry.windowId = vim.api.nvim_get_current_win()
    local scratch = vim.api.nvim_get_current_buf()
    vim.api.nvim_win_set_buf(entry.windowId, buf)
    if vim.api.nvim_buf_is_valid(scratch) then vim.api.nvim_buf_delete(scratch, { force = true }) end
  end)
  if not ok then
    children[request.sequence] = nil
    -- Only this newly allocated scratch is ours, even if initialization failed.
    if vim.api.nvim_buf_is_valid(buf) then vim.api.nvim_buf_delete(buf, { force = true }) end
    error(err)
  end
  return vim.deepcopy(entry)
end
return M
