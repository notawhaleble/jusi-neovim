-- Independent conformance provider; no imports from the application's source tree.
local M = {}
function M.setup(config)
  require("jusi_neovim").register({
    api_version = 1, id = "argv-fixture",
    open = require("jusi_neovim").worker(function(request)
      local argv = vim.list_slice(config.command, 2)
      vim.list_extend(argv, request.options.args or {})
      table.insert(argv, request.target)
      return {
        executable = config.command[1], argv = argv, cwd = vim.fn.getcwd(),
        env = { JUSI_FIXTURE_OUTPUT = vim.env.JUSI_FIXTURE_OUTPUT },
        required_capabilities = { "surface.web" }, ready_timeout_ms = 3000,
      }
    end),
  })
end
return M
