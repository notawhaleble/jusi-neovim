-- Trusted package API. Document scripts never receive this module or the RPC channel.
local M = { api_version = 1 }
local providers = {}
local active = {}

function M.register(spec)
  assert(type(spec) == "table" and spec.api_version == 1, "Unsupported Jusi provider API")
  assert(type(spec.id) == "string" and spec.id:match("^[%w_-]+$"), "Invalid provider id")
  assert(type(spec.open) == "function", "Provider must implement open(request, ready)")
  if spec.media_types ~= nil then
    assert(type(spec.media_types) == 'table' and vim.islist(spec.media_types), 'MIME types must be a list')
    for _, media in ipairs(spec.media_types) do
      assert(type(media) == 'string' and media:match('^[A-Za-z0-9.+-]+/[A-Za-z0-9.+-]+$'), 'Invalid provider MIME type')
    end
  end
  assert(not providers[spec.id], "Provider already registered: " .. spec.id)
  providers[spec.id] = spec
end

function M.close(bufnr)
  bufnr = bufnr or vim.api.nvim_get_current_buf()
  local entry = active[bufnr]
  M.clear_navigation(bufnr)
  active[bufnr] = nil -- invalidate callbacks before disposal
  if entry and type(entry.dispose) == "function" then
    local ok, err = pcall(entry.dispose)
    if not ok then vim.notify(tostring(err), vim.log.levels.ERROR) end
  end
end

function M.close_all()
  for _, bufnr in ipairs(vim.tbl_keys(active)) do M.close(bufnr) end
  require("jusi_neovim.worker").close_all()
end

function M.open(id, target, opts)
  opts = opts or {}
  local spec = assert(providers[id], "Unknown Jusi provider: " .. tostring(id))
  local policy = opts.text_layer or "auto"
  assert(policy == "auto" or policy == "off", "text_layer must be auto or off")
  local profile = opts.profile or "default"
  assert(type(profile) == "string" and #profile <= 64 and profile:match("^[%w_-]+$"), "Invalid profile")
  assert(opts.private == nil or type(opts.private) == "boolean", "private must be boolean")
  -- Always allocate: opening a presentation must not overwrite the user's edited buffer.
  local bufnr = vim.api.nvim_create_buf(true, true)
  vim.api.nvim_set_current_buf(bufnr)
  local entry = { provider = id, target = target, document_id = opts.document_id }
  active[bufnr] = entry
  local completed = false
  local function ready(err, surface)
    vim.schedule(function()
      if active[bufnr] ~= entry or not vim.api.nvim_buf_is_valid(bufnr) or completed then return end
      completed = true
      if err then
        M.close(bufnr)
        vim.notify(tostring(err), vim.log.levels.ERROR)
        if opts.on_ready then opts.on_ready(tostring(err), bufnr) end
        return
      end
      if type(surface) ~= "table" or surface.backend ~= "web" or type(surface.url) ~= "string" then
        M.close(bufnr)
        vim.notify("Provider returned an unsupported surface", vim.log.levels.ERROR)
        if opts.on_ready then opts.on_ready("Provider returned an unsupported surface", bufnr) end
        return
      end
      _G.jusi_neovim_open_surface(bufnr, surface.url, {
        providerId = id, textLayer = policy, profile = profile, privateBrowsing = opts.private == true,
        textSource = entry.worker and entry.worker.capabilities["text.extract"] and "worker" or "dom",
      })
      if opts.on_ready then opts.on_ready(nil, bufnr) end
    end)
  end
  local ok, dispose = pcall(spec.open, {
    buffer = bufnr, target = target or "", options = vim.deepcopy(opts),
  }, ready)
  if not ok then ready(dispose) else entry.dispose = dispose end
  return bufnr
end

function M.providers()
  local ids = vim.tbl_keys(providers)
  table.sort(ids)
  return ids
end

-- MIME declarations are provider-owned; no provider names are built into the host.
function M.provider_for(media_type, preferred)
  local ids = M.providers()
  for _, id in ipairs(ids) do
    if (not preferred or preferred == '' or preferred == id)
        and vim.tbl_contains(providers[id].media_types or {}, media_type) then return id end
  end
end
function M.find_document(document_id)
  for buf, entry in pairs(active) do
    if vim.api.nvim_buf_is_valid(buf) and (entry.document_id == document_id
        or entry.worker and entry.worker.document_id == document_id) then return buf end
  end
end
function M.snapshot(buf, callback)
  local entry = active[buf]
  if not entry or not entry.worker or entry.worker.state ~= 'ready'
      or not entry.worker.capabilities['source.snapshot'] then
    vim.schedule(function() callback('Provider does not support source.snapshot') end)
    return function() end
  end
  -- Capture now; a later page navigation must not substitute another revision.
  local ticket = vim.deepcopy(vim.b[buf].jusi_document)
  if type(ticket) ~= 'table' then
    vim.schedule(function() callback('Source document has no current ticket') end)
    return function() end
  end
  return entry.worker.snapshot(ticket, callback)
end

-- Internal retained-document registration; never invokes a provider or replays a URL.
function M.attach_native(bufnr, incarnation, token)
  assert(not active[bufnr] and vim.api.nvim_buf_is_valid(bufnr)
    and vim.b[bufnr].jusi_incarnation == incarnation
    and vim.b[bufnr].jusi_native_child == token, "Invalid native presentation")
  active[bufnr] = {}
end

-- Mode reports come only from the trusted host, with explicit buffer/window identity.
function M.set_mode(bufnr, incarnation, window, mode)
  if mode ~= "rich" and mode ~= "text" then return false end
  local entry = active[bufnr]
  if not entry or not vim.api.nvim_buf_is_valid(bufnr)
    or vim.b[bufnr].jusi_incarnation ~= incarnation then return false end
  if mode == "rich" then
    if not vim.api.nvim_win_is_valid(window) or vim.api.nvim_win_get_buf(window) ~= bufnr then return false end
    entry.rich_window = window
    M.clear_navigation(bufnr)
  elseif entry.rich_window == window then
    entry.rich_window = nil
    M.navigate()
  end
  return true
end

function M.leave_window(bufnr)
  local entry = active[bufnr]
  if entry then entry.rich_window = nil end
  M.clear_navigation(bufnr)
end

-- Anchors are source ranges. Optional cursor bytes refer only to the returned line text.
function M.clear_navigation(bufnr)
  local entry = active[bufnr]
  if not entry then return end
  if entry.navigation_timer then
    if not entry.navigation_timer:is_closing() then entry.navigation_timer:stop(); entry.navigation_timer:close() end
    entry.navigation_timer = nil
  end
  if entry.navigation and entry.worker then
    entry.worker.navigate(entry.navigation.ticket, entry.navigation.window, nil)
  end
  entry.navigation = nil
end
function M.clear_worker_document(bufnr)
  M.clear_navigation(bufnr)
  local entry = active[bufnr]
  if entry then entry.worker_document = nil; entry.worker_ticket = nil end
  if vim.api.nvim_buf_is_valid(bufnr) then vim.b[bufnr].jusi_worker_status = "idle"; vim.cmd("redrawstatus") end
end
-- Trusted provider mappings invoke opaque provider actions. They work without a
-- text document, so page navigation is available while text is loading or off.
function M.worker_action(action, count)
  assert(type(action) == "string" and #action <= 64 and action:match("^[%a][%w_.-]*$"), "Invalid worker action")
  count = count or 1
  assert(type(count) == "number" and count == math.floor(count) and count >= 1 and count <= 10000, "Invalid action count")
  local window, buf = vim.api.nvim_get_current_win(), vim.api.nvim_get_current_buf()
  local entry = active[buf]
  if not entry or entry.rich_window or not entry.worker then return false end
  return entry.worker.action(window, action, count)
end
function M.navigate()
  local buf = vim.api.nvim_get_current_buf()
  local entry = active[buf]
  if not entry or entry.rich_window or not entry.worker_document or not entry.worker or not entry.worker.capabilities["source.navigate"] then return end
  if entry.navigation_timer and not entry.navigation_timer:is_closing() then entry.navigation_timer:stop(); entry.navigation_timer:close() end
  local timer
  timer = vim.defer_fn(function()
    if entry.navigation_timer ~= timer then return end
    entry.navigation_timer = nil
    if active[buf] ~= entry or entry.rich_window or vim.api.nvim_get_current_buf() ~= buf or vim.b[buf].jusi_text_layer == "off"
      or not vim.deep_equal(vim.b[buf].jusi_document, entry.worker_ticket) then return end
    local window = vim.api.nvim_get_current_win()
    local cursor = vim.api.nvim_win_get_cursor(window)
    local row = cursor[1]
    local line = entry.worker_document.lines[row]
    if not line then M.clear_navigation(buf); return end
    local navigation = { ticket = entry.worker_ticket, window = window, anchor = line.anchor }
    if entry.worker.capabilities["source.navigate.cursor"] then
      navigation.cursorByte = math.min(cursor[2], #line.text)
    end
    if entry.worker.capabilities["source.navigate.selection"] then
      navigation.selection = require("jusi_neovim.worker-selection").capture(buf, entry.worker_document)
    end
    if entry.worker.capabilities["source.navigate.viewport"] then
      local view = vim.fn.winsaveview()
      navigation.viewport = { topRow = vim.fn.line("w0") - 1, bottomRow = vim.fn.line("w$"),
        skipColumns = view.skipcol or 0 }
    end
    if vim.deep_equal(entry.navigation, navigation) then return end
    entry.navigation = vim.deepcopy(navigation)
    entry.worker.navigate(navigation.ticket, window, navigation.anchor, navigation.cursorByte, navigation.selection, navigation.viewport)
  end, 20)
  entry.navigation_timer = timer
end
function M.accept_worker_document(ticket, document)
  local entry = active[ticket.bufferId]
  if not entry then return end
  M.clear_navigation(ticket.bufferId)
  entry.worker_ticket = vim.deepcopy(ticket)
  entry.worker_document = document
  vim.b[ticket.bufferId].jusi_worker_status = "ready"
  vim.cmd("redrawstatus")
  if vim.api.nvim_get_current_buf() == ticket.bufferId then M.navigate() end
end

-- Worker text is returned to trusted callers; publication still requires a host ticket.
function M.cancel_text(bufnr)
  local entry = active[bufnr]
  if entry and entry.cancel_text then entry.cancel_text(); entry.cancel_text = nil end
end
function M.extract(ticket, callback)
  assert(type(ticket) == "table" and type(callback) == "function", "Ticket and callback required")
  ticket = vim.deepcopy(ticket)
  local entry = active[ticket.bufferId]
  local function current()
    return entry and active[ticket.bufferId] == entry and vim.api.nvim_buf_is_valid(ticket.bufferId)
      and vim.b[ticket.bufferId].jusi_text_layer ~= "off"
      and vim.b[ticket.bufferId].jusi_incarnation == ticket.incarnation
      and vim.deep_equal(vim.b[ticket.bufferId].jusi_document, ticket)
  end
  if not current() or not entry.worker or entry.worker.state ~= "ready"
    or not entry.worker.capabilities["text.extract"] then
    vim.schedule(function() callback("Worker document is not current or text is disabled") end)
    return function() end
  end
  M.cancel_text(ticket.bufferId)
  vim.b[ticket.bufferId].jusi_worker_status = "building"
  vim.cmd("redrawstatus")
  local cancel = entry.worker.extract(ticket, function(err, document)
    if not current() then callback("Worker document changed")
    else
      if err then vim.b[ticket.bufferId].jusi_worker_status = "error"; vim.cmd("redrawstatus") end
      callback(err, document)
    end
  end)
  entry.cancel_text = cancel
  return cancel
end

-- Return asynchronously over the host's existing private Neovim RPC channel.
function M.extract_rpc(id, ticket, channel)
  assert(type(channel) == "number" and channel > 0, "Host RPC channel unavailable")
  M.extract(ticket, function(err, document)
    pcall(vim.rpcnotify, channel, "jusi:worker-text", { id = id, error = err, document = document })
  end)
  return true
end

-- Wrap a trusted launch-options function in the managed worker lifecycle.
function M.worker(launch)
  assert(type(launch) == "function", "Worker launch must be a function")
  return function(request, ready)
    local entry = active[request.buffer]
    local worker = require("jusi_neovim.worker").start(launch(request), ready, function(err)
      if active[request.buffer] ~= entry then return end
      M.close(request.buffer)
      vim.notify(err, vim.log.levels.ERROR)
    end)
    entry.worker = worker
    return worker.close
  end
end

return M
