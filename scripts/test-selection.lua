vim.opt.runtimepath:prepend(vim.fn.getcwd() .. '/runtime')
local selection = require('jusi_neovim.selection')
local lines = { 'A😀é文 אב', 'abcdef', 'x', '', '123456' }
vim.api.nvim_buf_set_lines(0, 0, -1, false, lines)
local function check(a, b, mode, exclusive)
  local spans = selection.spans(0, a, b, mode, exclusive)
  local actual = {}
  for _, span in ipairs(spans) do
    local line = lines[span.row + 1]
    actual[#actual + 1] = vim.fn.strcharpart(line, span.startCol, span.endCol - span.startCol)
  end
  local expected = vim.tbl_filter(function(s) return s:find('%S') ~= nil end,
    vim.fn.getregion(a, b, {type = mode, exclusive = exclusive}))
  assert(vim.deep_equal(actual, expected), vim.inspect({actual, expected, spans}))
end
for _, exclusive in ipairs({false, true}) do
  for _, pair in ipairs({{{0,1,2,0},{0,1,9,0}}, {{0,1,9,0},{0,1,2,0}},
    {{0,1,6,0},{0,1,6,0}}, {{0,1,2,0},{0,2,4,0}}, {{0,2,2,0},{0,5,3,0}}}) do
    for _, mode in ipairs({'v', 'V', '\022'}) do check(pair[1],pair[2],mode,exclusive) end
  end
end
assert(#selection.spans(0,{0,1,1,0},{0,10001,1,0},'v',false) == 0)
vim.api.nvim_buf_set_lines(0,0,-1,false,{'abcdef','\tabc'})
vim.o.virtualedit = 'all'
assert(#selection.spans(0,{0,1,2,0},{0,2,1,2},'\022',false) == 0,
  'partial terminal cells must not become whole-character highlights')
print('Authoritative Neovim exclusive/reverse/block/short-line selection tests passed')
vim.cmd('qa!')
