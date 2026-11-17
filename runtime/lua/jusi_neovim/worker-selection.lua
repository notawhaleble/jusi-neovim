local M = {}
-- Byte ranges refer to the published text, not to provider source offsets.
function M.capture(bufnr, document)
  local mode = vim.fn.mode()
  if mode ~= "v" and mode ~= "V" and mode ~= "\022" then return vim.NIL end
  local spans = require("jusi_neovim.selection").spans(bufnr, vim.fn.getpos("v"),
    vim.fn.getpos("."), mode, vim.o.selection == "exclusive")
  -- Keep navigation inside the 64 KiB worker input budget. Suppress an
  -- unrepresentable selection as a whole rather than paint a partial selection.
  if #spans > 512 then return {} end
  local ranges = {}
  for _, span in ipairs(spans) do
    local line = document.lines[span.row + 1]
    if not line then return {} end
    ranges[#ranges + 1] = { row = span.row,
      startByte = vim.fn.byteidxcomp(line.text, span.startCol),
      endByte = vim.fn.byteidxcomp(line.text, span.endCol) }
  end
  return ranges
end
return M
