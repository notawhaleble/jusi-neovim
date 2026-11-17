local M = {}
local root = debug.getinfo(1, "S").source:sub(2):gsub("lua/jusi_markdown/init.lua$", "")
local config, registered
function M.setup(opts)
  if registered and opts == nil then return end
  opts = opts or vim.g.jusi_markdown or {}
  local node = opts.node or vim.fn.exepath("node")
  assert(type(node) == "string", "node must be an executable path")
  config = { node = node, text_layer = opts.text_layer or "auto" }
  assert(config.text_layer == "auto" or config.text_layer == "off", "Invalid text_layer")
  if registered then return end
  require("jusi_neovim").register({ id = "markdown", api_version = 1,
    open = require("jusi_neovim").worker(function(request)
      assert(request.target ~= "", "Markdown file path required")
      return { executable = config.node, argv = { root .. "viewer.mjs", vim.fn.fnamemodify(request.target, ":p") },
        cwd = root, env = {}, required_capabilities = { "surface.web", "text.extract", "source.navigate" } }
    end),
  })
  vim.api.nvim_create_user_command("JusiMarkdown", function(args)
    require("jusi_neovim").open("markdown", args.args, { text_layer = args.bang and "off" or config.text_layer })
  end, { nargs = 1, complete = "file", bang = true })
  registered = true
end
return M
