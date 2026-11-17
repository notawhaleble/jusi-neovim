-- Installed workers export into host-issued private directories. Control frames
-- contain descriptors only; documents never receive this API or these paths.
local M = {}
function M.new(send, timeout)
  local pending, sequence, closed = {}, 0, false
  local api = {}
  local function dispose(request)
    vim.fn.delete(request.directory, 'rf')
  end
  local function finish(request, err, result)
    if pending[request.id] ~= request then return end
    pending[request.id] = nil
    request.timer:stop(); request.timer:close()
    vim.schedule(function()
      if closed or request.cancelled then err = err or 'Snapshot cancelled' end
      if err then dispose(request); request.callback(err)
      else
        result.release = function() dispose(request) end
        request.callback(nil, result)
      end
    end)
  end
  function api.snapshot(ticket, callback)
    assert(not closed and type(callback) == 'function', 'Snapshot transport closed')
    assert(vim.tbl_count(pending) < 8, 'Snapshot capacity reached')
    sequence = sequence + 1
    local directory = vim.fn.tempname()
    assert(vim.fn.mkdir(directory, '', 448) == 1, 'Cannot stage snapshot')
    local request = { id = sequence, ticket = vim.deepcopy(ticket), callback = callback,
      directory = directory, timer = vim.uv.new_timer() }
    pending[request.id] = request
    local function cancel()
      request.cancelled = true
      if pending[request.id] then
        send({ type = 'snapshot-cancel', id = request.id })
        finish(request, 'Snapshot cancelled')
      end
    end
    request.timer:start(timeout, 0, cancel)
    send({ type = 'snapshot', id = request.id, ticket = ticket, directory = directory })
    return cancel
  end
  function api.receive(frame)
    if type(frame) ~= 'table' or frame.type ~= 'snapshot-result' then return false end
    local request = pending[frame.id]
    if not request then return true end -- late cancelled reply
    if not vim.deep_equal(frame.ticket, request.ticket) then finish(request, 'Snapshot ticket mismatch'); return true end
    if frame.error then finish(request, tostring(frame.error):sub(1, 1000)); return true end
    local ok, result = pcall(function()
      assert(type(frame.metadata) == 'table' and #vim.json.encode(frame.metadata) <= 16384, 'Invalid snapshot metadata')
      assert(type(frame.files) == 'table' and vim.islist(frame.files) and #frame.files <= 8, 'Invalid snapshot files')
      local files, names, total = {}, {}, 0
      for _, file in ipairs(frame.files) do
        assert(type(file.name) == 'string' and file.name:match('^[A-Za-z0-9_-][A-Za-z0-9_.-]*$')
          and #file.name <= 128 and not names[file.name], 'Invalid snapshot filename')
        assert(type(file.media_type) == 'string' and file.media_type:match('^[%w.+-]+/[%w.+-]+$'), 'Invalid snapshot MIME')
        local path = request.directory .. '/' .. file.name
        local stat = vim.uv.fs_lstat(path)
        assert(stat and stat.type == 'file' and stat.size == file.size, 'Invalid snapshot file')
        total = total + stat.size; assert(total <= 32 * 1024 * 1024, 'Snapshot exceeds 32 MiB')
        names[file.name] = true
        table.insert(files, { name = file.name, path = path, size = stat.size, media_type = file.media_type })
      end
      return { metadata = frame.metadata, files = files }
    end)
    finish(request, not ok and tostring(result) or nil, ok and result or nil)
    return true
  end
  function api.close()
    closed = true
    for _, request in pairs(vim.tbl_extend('force', {}, pending)) do finish(request, 'Snapshot worker closed') end
  end
  return api
end
return M
