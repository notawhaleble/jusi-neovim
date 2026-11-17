vim.opt.runtimepath:prepend(vim.fn.getcwd() .. '/runtime')
local browser = require('jusi_neovim.browser')
local suffix = ' %{v:lua.jusi_neovim_browser_statusline(1)}'
local function local_status() return vim.api.nvim_get_option_value('statusline', {win=0,scope='local'}) end
local function web()
  vim.b.jusi_provider_id = 'web'
  browser.attach()
end
local function plain()
  vim.api.nvim_set_current_buf(vim.api.nvim_create_buf(true, true))
  browser.attach()
end
vim.api.nvim_set_option_value('statusline', 'GLOBAL %f', {scope='global'})
vim.wo.statusline = ''
web()
assert(local_status() == 'GLOBAL %f' .. suffix)
local original = vim.api.nvim_get_current_buf()
for _ = 1, 3 do
  vim.cmd('tabe')
  local empty = vim.api.nvim_get_current_buf()
  vim.cmd('buffer ' .. original)
  assert(local_status() == 'GLOBAL %f' .. suffix, 'tabe -> existing buffer duplicated status: ' .. local_status())
  vim.cmd('buffer ' .. empty)
  assert(local_status() == '', 'plain buffer retained browser decoration')
  vim.cmd('buffer ' .. original)
  assert(local_status() == 'GLOBAL %f' .. suffix, 'revisit duplicated status')
  vim.cmd('tabclose')
end
vim.cmd('split')
assert(local_status() == 'GLOBAL %f' .. suffix, 'split inherited a duplicate section')
plain()
assert(local_status() == '', 'split must retain global inheritance')
vim.cmd('close')
vim.cmd('tab split')
assert(local_status() == 'GLOBAL %f' .. suffix, 'tab inherited a duplicate section')
plain()
assert(local_status() == '')
vim.cmd('tabclose')
-- A user replacement while attached must survive leaving the browser.
vim.wo.statusline = 'CUSTOM %f'
browser.attach()
suffix = ' %{v:lua.jusi_neovim_browser_statusline(2)}'
assert(local_status() == 'CUSTOM %f' .. suffix)
vim.cmd('split')
assert(local_status() == 'CUSTOM %f' .. suffix)
plain()
assert(local_status() == '', vim.inspect(local_status()))
vim.cmd('close')
plain()
assert(local_status() == '', vim.inspect(local_status()))
for _ = 1, 3 do web(); browser.attach(); plain(); assert(local_status() == '', vim.inspect(local_status())) end
-- Copied formats distinguish an explicit local value from global inheritance,
-- even when both render the same base text.
vim.wo.statusline = 'GLOBAL %f'
web()
local explicit = local_status()
local explicit_buf = vim.api.nvim_get_current_buf()
vim.cmd('tabe')
vim.cmd('buffer ' .. explicit_buf)
assert(local_status() == explicit)
vim.b.jusi_provider_id = nil
browser.attach()
assert(local_status() == 'GLOBAL %f', 'explicit local base was lost')
vim.cmd('tabclose')
web()
vim.wo.statusline = ''
vim.b.jusi_provider_id = nil
browser.attach()
assert(local_status() == '', 'explicit user clearing was overwritten')
vim.wo.statusline = 'CUSTOM %f'
web()
vim.b.jusi_provider_id = nil
browser.attach()
assert(local_status() == 'CUSTOM %f', 'custom base was lost')
vim.wo.statusline = ''
web()
vim.api.nvim_set_option_value('statusline', 'CHANGED %f', {scope='global'})
browser.attach()
assert(local_status():find('CHANGED %f', 1, true) == 1)
vim.b.jusi_provider_id = nil
browser.attach()
assert(local_status() == '')
-- Pause feedback must change before any guest mutation or host status notification.
vim.b.jusi_provider_id = 'web'
vim.b.jusi_buffer_kind = 'web'
vim.b.jusi_text_source = 'dom'
vim.b.jusi_text_layer = 'auto'
vim.b.jusi_browser_status = 'ready'
vim.b.jusi_auto_refresh = true
vim.b.jusi_incarnation = 73
vim.g.jusi_browser_rpc_channel = 17
local saved_notify, saved_cmd = vim.rpcnotify, vim.cmd
local notifications, redraws = {}, 0
vim.rpcnotify = function(channel, method, payload)
  assert(channel == 17 and method == 'jusi:browser-command')
  notifications[#notifications+1] = payload
end
vim.cmd = function(command)
  assert(command == 'redrawstatus')
  redraws = redraws + 1
end
browser.command('toggle-pause')
assert(redraws == 1)
assert(browser.statusline():find('Text paused', 1, true))
assert(not browser.statusline():find('Text ready', 1, true))
assert(notifications[1].action == 'pause' and notifications[1].incarnation == 73)
browser.status({bufferId=vim.api.nvim_get_current_buf(),incarnation=73}, 'ready')
assert(browser.statusline():find('Text paused', 1, true), 'late readiness hid pause state')
browser.command('toggle-pause')
assert(redraws == 2 and notifications[2].action == 'resume')
assert(not browser.statusline():find('Text paused', 1, true))
vim.b.jusi_browser_status = 'idle'
assert(browser.statusline():find('Text auto', 1, true))
vim.b.jusi_text_layer = 'off'
browser.command('pause')
assert(browser.statusline():find('Text off', 1, true))
vim.rpcnotify, vim.cmd = saved_notify, saved_cmd
print('browser statusline lifecycle and immediate pause feedback tests passed')
vim.cmd('qa!')
