-- Extractable package fixture. Runtime dependency: an explicitly configured Node.
local M = {}
local root = debug.getinfo(1, "S").source:sub(2):gsub("lua/source_viewer/init.lua$", "")
function M.setup(options)
  require("jusi_neovim").register({ id = "source-viewer", api_version = 1,
    open = require("jusi_neovim").worker(function()
      return { executable = options.node, argv = { root .. "viewer.mjs" },
        cwd = root, env = {}, required_capabilities = { "surface.web", "text.extract", "source.navigate" } }
    end),
  })
end
return M
