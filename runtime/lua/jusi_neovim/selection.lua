-- Resolve editor semantics here; consumers only convert coordinate units.
local M = {}
function M.spans(bufnr, anchor, cursor, mode, exclusive)
  -- Bound work before asking Neovim to enumerate lines on every cursor update.
  if math.abs(anchor[2] - cursor[2]) >= 10000 then return {} end
  local ok, regions = pcall(vim.fn.getregionpos, anchor, cursor,
    { type = mode, exclusive = exclusive, eol = true })
  if not ok then return {} end
  local spans = {}
  for _, region in ipairs(regions) do
    local first, last = region[1], region[2]
    -- DOM ranges cannot express part of a terminal cell (tabs/wide characters).
    -- Suppress the projection rather than falsely highlighting whole characters.
    local row = first[2] - 1
    local line = vim.api.nvim_buf_get_lines(bufnr, row, row + 1, false)[1] or ""
    if (first[4] ~= 0 and first[3] <= #line) or (last[4] ~= 0 and last[3] <= #line) then return {} end
    local start_col = vim.fn.strchars(line:sub(1, math.max(0, first[3] - 1)))
    local end_col = vim.fn.strchars(line:sub(1, math.max(0, last[3])))
    if end_col > start_col then
      spans[#spans + 1] = { row = row, startCol = start_col, endCol = end_col }
    end
  end
  return spans
end
return M
