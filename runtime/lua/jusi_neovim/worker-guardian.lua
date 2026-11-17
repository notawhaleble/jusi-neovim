-- Standalone `nvim --headless -u NONE -i NONE -n -l` process.
-- Owns the worker group; parent-pipe EOF survives abrupt parent death.
local uv = vim.uv
local parent = uv.new_pipe(false)
local stdout = uv.new_pipe(false)
local stderr = uv.new_pipe(false)
parent:open(0); stdout:open(1); stderr:open(2)
local input, output, errors, process, pid
local timer = uv.new_timer()
local closing, finished, initialized = false, false, false
local pending, output_bytes, stderr_bytes, input_bytes, queued_output, queued_input = "", 0, 0, 0, 0, 0
local function close(handle)
  if handle and not handle:is_closing() then handle:close() end
end
local function exit(code)
  if finished then return end
  finished = true
  close(timer); close(parent); close(input); close(output); close(errors)
  close(process)
  vim.schedule(function() os.exit(code) end)
end
local function kill_group()
  if pid then uv.kill(-pid, "sigkill") end
end
local function shutdown()
  if closing then return end
  closing = true
  if not process then exit(0); return end
  timer:start(200, 0, function() kill_group() end)
  -- This is a request to release resources, not permission to save user files.
  if input and not input:is_closing() then
    input:write('{"type":"shutdown","version":1}\n', function()
      if input and not input:is_closing() then input:shutdown(function() close(input) end) end
    end)
  end
end
local function start(config)
  input, output, errors = uv.new_pipe(false), uv.new_pipe(false), uv.new_pipe(false)
  process, pid = uv.spawn(config.executable, {
    args = config.argv, cwd = config.cwd, env = config.env,
    detached = true, stdio = { input, output, errors },
  }, function(code, signal)
    kill_group() -- remove descendants even if the leader exits voluntarily
    exit(closing and 0 or (code == 0 and 1 or code))
  end)
  if not process then pid = nil; exit(1); return end
  input:write('{"type":"hello","version":1,"capabilities":["surface.web","text.extract","source.navigate","source.navigate.cursor","source.navigate.selection","source.navigate.viewport","surface.actions","source.snapshot"]}\n', function(err)
    if err then shutdown() end
  end)
  output:read_start(function(err, data)
    if finished or closing then return end
    if err or not data then shutdown(); return end
    output_bytes = output_bytes + #data
    queued_output = queued_output + #data
    if output_bytes > 67108864 or queued_output > 1048576 then shutdown(); return end
    stdout:write(data, function(write_error)
      queued_output = queued_output - #data
      if write_error then shutdown() end
    end)
  end)
  errors:read_start(function(err, data)
    if finished or closing then return end
    if err or not data then return end
    -- Bound queued diagnostic writes as well as the parent's retained tail.
    data = data:sub(-8192)
    if stderr_bytes + #data <= 8192 then
      stderr_bytes = stderr_bytes + #data
      stderr:write(data, function() stderr_bytes = stderr_bytes - #data end)
    end
  end)
end
parent:read_start(function(err, data)
  if finished then return end
  if err or not data then shutdown(); return end
  if closing then return end
  if initialized then
    input_bytes = input_bytes + #data
    queued_input = queued_input + #data
    if input_bytes > 67108864 or queued_input > 65536 then shutdown(); return end
    input:write(data, function(write_error)
      queued_input = queued_input - #data
      if write_error then shutdown() end
    end)
    return
  end
  pending = pending .. data
  if #pending > 65536 then exit(1); return end
  local newline = pending:find("\n", 1, true)
  if not newline then return end
  if newline ~= #pending then exit(1); return end
  local ok, config = pcall(vim.json.decode, pending:sub(1, newline - 1))
  if not ok or type(config) ~= "table" then exit(1); return end
  initialized = true; pending = ""
  start(config)
end)
-- A parent that never sends launch options must not leave an idle guardian.
timer:start(5000, 0, function() if not initialized then exit(1) end end)
while not finished do vim.wait(60000, function() return finished end, 10) end
