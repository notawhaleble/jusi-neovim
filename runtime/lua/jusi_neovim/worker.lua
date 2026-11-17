-- Trusted installed providers launch workers; worker output is untrusted data.
local M = {}
local uv = vim.uv
local live = {}
local LIMIT = 65536
local supported = { ["surface.web"] = true, ["text.extract"] = true,
  ["source.navigate"] = true, ["source.navigate.cursor"] = true, ["source.navigate.selection"] = true,
  ["source.navigate.viewport"] = true, ["surface.actions"] = true, ["source.snapshot"] = true }
local function close(handle)
  if handle and not handle:is_closing() then handle:close() end
end
local function string_value(value)
  return type(value) == "string" and not value:find("\0", 1, true)
end

-- Negotiated text requests carry data only; documents never receive Neovim RPC.
function M.start(config, ready, failed)
  assert(uv.os_uname().sysname ~= "Windows_NT", "Worker process groups require POSIX")
  assert(type(config) == "table" and string_value(config.executable) and config.executable:sub(1, 1) == "/", "Absolute executable required")
  assert(type(config.argv or {}) == "table" and vim.islist(config.argv or {}), "argv must be a list")
  for _, arg in ipairs(config.argv or {}) do assert(string_value(arg), "Invalid argv entry") end
  assert(string_value(config.cwd) and config.cwd:sub(1, 1) == "/", "Absolute cwd required")
  assert(type(config.env) == "table", "Explicit environment required")
  local env = {}
  for key, value in pairs(config.env) do
    assert(string_value(key) and key:match("^[%a_][%w_]*$") and string_value(value), "Invalid environment")
    table.insert(env, key .. "=" .. value)
  end
  local timeout = config.ready_timeout_ms or 5000
  assert(type(timeout) == "number" and timeout >= 1 and timeout <= 60000, "Invalid readiness timeout")
  local text_timeout = config.text_timeout_ms or 10000
  assert(type(text_timeout) == "number" and text_timeout >= 1 and text_timeout <= 60000, "Invalid text timeout")
  local required = config.required_capabilities or { "surface.web" }
  assert(type(required) == "table" and vim.islist(required), "Capabilities must be a list")
  for _, capability in ipairs(required) do assert(supported[capability], "Unsupported required capability") end
  local launch = vim.json.encode({ executable = config.executable, argv = config.argv or {}, cwd = config.cwd, env = env }) .. "\n"
  assert(#launch <= LIMIT, "Worker launch options too large")
  local guardian = debug.getinfo(1, "S").source:sub(2):gsub("worker.lua$", "worker-guardian.lua")
  local input, output, errors = uv.new_pipe(false), uv.new_pipe(false), uv.new_pipe(false)
  local timer = uv.new_timer()
  local worker = { state = "starting", stderr = "", pid = nil }
  local process, pending, bytes = nil, "", 0
  local documents, snapshots
  local function stop()
    if worker.state == "closed" then return end
    worker.state = "closed"
    if documents then documents.close() end
    if snapshots then snapshots.close() end
    -- EOF asks the independent guardian for bounded graceful group cleanup.
    close(timer); close(input); close(output); close(errors)
  end
  worker.close = stop
  local function fail(message)
    if worker.state == "closed" then return end
    local was_ready = worker.state == "ready"
    local diagnostic = message .. (#worker.stderr > 0 and (": " .. worker.stderr) or "")
    stop()
    vim.schedule(function()
      if was_ready then if failed then failed(diagnostic) end else ready(diagnostic) end
    end)
  end
  local function send(frame)
    if worker.state == "closed" then return end
    local data = vim.json.encode(frame) .. "\n"
    input:write(data, function(err) if err then fail("Worker input failed") end end)
  end
  documents = require("jusi_neovim.worker-documents").new(send, text_timeout)
  function worker.extract(ticket, callback)
    assert(worker.state == "ready" and worker.capabilities["text.extract"], "Worker cannot extract text")
    return documents.extract(ticket, callback)
  end
  snapshots = require("jusi_neovim.worker-snapshots").new(send, text_timeout)
  function worker.snapshot(ticket, callback)
    assert(worker.state == "ready" and worker.capabilities["source.snapshot"], "Worker cannot snapshot source")
    return snapshots.snapshot(ticket, callback)
  end
  local navigation_sequence = 0
  function worker.navigate(ticket, window_id, anchor, cursor_byte, selection, viewport)
    if worker.state ~= "ready" or not worker.capabilities["source.navigate"] then return false end
    navigation_sequence = navigation_sequence + 1
    local frame = { type = "navigate", sequence = navigation_sequence, ticket = ticket,
      windowId = window_id, anchor = anchor or vim.NIL }
    if anchor and worker.capabilities["source.navigate.cursor"] then frame.cursorByte = cursor_byte end
    if anchor and worker.capabilities["source.navigate.selection"] then frame.selection = selection or vim.NIL end
    if anchor and worker.capabilities["source.navigate.viewport"] then frame.viewport = viewport end
    send(frame)
    return true
  end
  local action_sequence = 0
  function worker.action(window_id, action, count)
    if worker.state ~= "ready" or not worker.capabilities["surface.actions"] then return false end
    action_sequence = action_sequence + 1
    send({ type = "action", sequence = action_sequence, windowId = window_id, action = action, count = count })
    return true
  end
  process, worker.pid = uv.spawn(vim.v.progpath, {
    args = { "--headless", "-u", "NONE", "-i", "NONE", "-n", "-l", guardian },
    cwd = config.cwd, stdio = { input, output, errors },
  }, function(code, signal)
    if worker.state ~= "closed" then fail("Worker exited (" .. code .. ", signal " .. signal .. ")") end
    close(process)
    live[worker] = nil
  end)
  if not process then
    worker.pid = nil
    fail("Worker could not start")
    return worker
  end
  live[worker] = true
  input:write(launch, function(err) if err then fail("Worker input failed") end end)
  errors:read_start(function(err, data)
    if worker.state == "closed" then return end
    if err then fail("Worker stderr failed"); return end
    if data then worker.stderr = (worker.stderr .. data):sub(-8192) end
  end)
  output:read_start(function(err, data)
    if worker.state == "closed" then return end
    if err then fail("Worker output failed"); return end
    if not data then fail("Worker closed output"); return end
    bytes = bytes + #data
    if bytes > 67108864 then fail("Worker output limit exceeded"); return end
    pending = pending .. data
    if #pending > (worker.state == "starting" and LIMIT or 1048576) then fail("Worker frame limit exceeded"); return end
    while pending:find("\n", 1, true) do
      local index = pending:find("\n", 1, true)
      local line = pending:sub(1, index - 1)
      pending = pending:sub(index + 1)
      local ok, frame = pcall(vim.json.decode, line)
      if worker.state == "ready" then
        if not ok or not (snapshots.receive(frame) or (worker.capabilities["text.extract"] and documents.receive(frame))) then fail("Unexpected worker frame"); return end
      else
        if not ok or type(frame) ~= "table" or frame.type ~= "ready" or frame.version ~= 1
          or type(frame.capabilities) ~= "table" or not vim.islist(frame.capabilities) then
          fail("Invalid worker handshake"); return
        end
        local capabilities = {}
        for _, capability in ipairs(frame.capabilities) do
          if not supported[capability] or capabilities[capability] then fail("Unsupported worker capability"); return end
          capabilities[capability] = true
        end
        for _, capability in ipairs(required) do
          if not capabilities[capability] then fail("Missing worker capability"); return end
        end
        if capabilities["source.navigate"] and not capabilities["text.extract"] then fail("Navigation requires text extraction"); return end
        if capabilities["source.navigate.cursor"] and not capabilities["source.navigate"] then fail("Cursor navigation requires source navigation"); return end
        if capabilities["source.navigate.selection"] and not capabilities["source.navigate.cursor"] then fail("Selection navigation requires cursor navigation"); return end
        if capabilities["source.navigate.viewport"] and not capabilities["source.navigate.cursor"] then fail("Viewport navigation requires cursor navigation"); return end
        local surface = frame.surface
        if not capabilities["surface.web"] or type(surface) ~= "table" or surface.backend ~= "web"
          or not string_value(surface.url) or #surface.url > 16384
          or not (surface.url == "about:blank" or surface.url:match("^https?://")) then
          fail("Invalid worker surface"); return
        end
        worker.document_id = frame.document_id
        worker.capabilities = capabilities
        worker.state = "ready"
        close(timer)
        vim.schedule(function()
          if worker.state == "ready" then ready(nil, { backend = "web", url = surface.url }) end
        end)
      end
    end
  end)
  timer:start(timeout, 0, function() fail("Worker readiness timed out") end)
  return worker
end

function M.close_all()
  for worker in pairs(live) do worker.close() end
  -- VimLeavePre must let guardian callbacks finish before Neovim's event loop stops.
  vim.wait(1000, function() return next(live) == nil end, 10)
end
return M
