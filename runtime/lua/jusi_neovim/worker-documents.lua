-- Bounded request state; no buffer writes and no worker-controlled Neovim calls.
local M = {}
local MAX = 9007199254740991
local function integer(value) return type(value) == "number" and value >= 0 and value <= MAX and value % 1 == 0 end
local function utf8(value)
  local i = 1
  while i <= #value do
    local first = value:byte(i)
    local size = first < 128 and 1 or first >= 194 and first <= 223 and 2
      or first >= 224 and first <= 239 and 3 or first >= 240 and first <= 244 and 4 or 0
    if size == 0 or i + size - 1 > #value then return false end
    for j = i + 1, i + size - 1 do
      local byte = value:byte(j)
      if byte < 128 or byte > 191 then return false end
    end
    local second = value:byte(i + 1)
    if (first == 224 and second < 160) or (first == 237 and second > 159)
      or (first == 240 and second < 144) or (first == 244 and second > 143) then return false end
    i = i + size
  end
  return true
end
local function text(value, limit)
  return type(value) == "string" and #value <= limit and not value:find("\0", 1, true) and utf8(value)
end
local function valid_ticket(ticket)
  return type(ticket) == "table" and integer(ticket.bufferId) and ticket.bufferId > 0
    and integer(ticket.incarnation) and ticket.incarnation > 0
    and integer(ticket.revision) and ticket.revision > 0
    and text(ticket.sessionId, 128) and #ticket.sessionId > 0
end
function M.validate(document)
  if type(document) ~= "table" or document.offsetEncoding ~= "utf-8"
    or type(document.lines) ~= "table" or not vim.islist(document.lines) or #document.lines > 10000 then
    return nil, "Invalid worker text document"
  end
  local lines, bytes = {}, 0
  for _, line in ipairs(document.lines) do
    if type(line) ~= "table" or not text(line.text, 524288) or line.text:find("[\r\n]") then
      return nil, "Invalid worker text line"
    end
    bytes = bytes + #line.text
    if bytes > 524288 then return nil, "Worker text limit exceeded" end
    local anchor = line.anchor
    if type(anchor) ~= "table" or not text(anchor.source, 1024) or #anchor.source == 0
      or not integer(anchor.startByte) or not integer(anchor.endByte) or anchor.endByte < anchor.startByte then
      return nil, "Invalid worker source anchor"
    end
    table.insert(lines, { text = line.text, anchor = {
      source = anchor.source, startByte = anchor.startByte, endByte = anchor.endByte,
    } })
  end
  return { offsetEncoding = "utf-8", lines = lines }
end

function M.new(send, timeout)
  local sequence, current, closed = 0, nil, false
  local api = {}
  local function complete(request, err, document)
    if request.queued or request.done then return end
    request.queued = true
    request.timer:stop(); request.timer:close()
    vim.schedule(function()
      if request.done then return end
      request.done = true
      if current == request then current = nil end
      if request.cancelled then request.callback(request.cancelled)
      else request.callback(err, document) end
    end)
  end
  local function cancel(request, reason)
    if request.done or request.cancelled then return end
    request.cancelled = reason or "Worker text request cancelled"
    if current == request then current = nil end
    if not closed then send({ type = "cancel", id = request.id, ticket = request.ticket }) end
    complete(request, request.cancelled)
  end
  function api.extract(ticket, callback)
    assert(not closed, "Worker text transport closed")
    assert(valid_ticket(ticket), "Invalid document ticket")
    assert(type(callback) == "function", "Text callback required")
    if current then cancel(current, "Worker text request superseded") end
    sequence = sequence + 1
    local request = { id = sequence, ticket = vim.deepcopy(ticket), callback = callback, timer = vim.uv.new_timer() }
    current = request
    request.timer:start(timeout, 0, function() cancel(request, "Worker text request timed out") end)
    send({ type = "extract", id = request.id, ticket = request.ticket })
    return function() cancel(request) end
  end
  function api.receive(frame)
    if type(frame) ~= "table" or frame.type ~= "text-result" or not integer(frame.id) or frame.id < 1 or frame.id > sequence then
      return false
    end
    local request = current
    if not request or frame.id ~= request.id then return true end -- obsolete reply
    if not vim.deep_equal(frame.ticket, request.ticket) then
      complete(request, "Worker document ticket mismatch")
      return true
    end
    if frame.error ~= nil then
      complete(request, text(frame.error, 4096) and frame.error or "Invalid worker text error")
    else
      local document, err = M.validate(frame.document)
      complete(request, err, document)
    end
    return true
  end
  function api.close()
    if closed then return end
    closed = true
    if current then cancel(current, "Worker text transport closed") end
  end
  return api
end
return M
