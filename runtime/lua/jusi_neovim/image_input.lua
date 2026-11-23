-- Compatibility for consumers of the original PNG-only registration API.
local attachments = require('jusi_neovim.attachments')
local M = { paste = attachments.paste }
function M.register(buf, capture)
  return attachments.register(buf, function(row)
    local accept = capture(row)
    return function(files)
      for _, file in ipairs(files) do assert(file.media_type == 'image/png', 'This buffer accepts PNG images') end
      accept(files)
    end
  end)
end
return M
