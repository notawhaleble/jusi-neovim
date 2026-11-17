# Source navigation conformance viewer

This directory is extractable into its own Neovim package/repository. It uses only
public `require('jusi_neovim')` APIs and Node built-ins. It displays two fixed paragraphs;
it is not a Markdown, PDF or EPUB implementation.

Install it on runtimepath using a native package directory or a package manager's
local-directory option, then configure with an explicit Node executable:

```lua
require('source_viewer').setup({ node = '/absolute/path/to/node' })
```

Open with `:JusiOpen source-viewer` (`:JusiOpen! source-viewer` disables text).
Use `j`/`k` to highlight source paragraphs, `i` for rich input, Ctrl-\ then Ctrl-N
for text navigation, and Ctrl-Q to close. Returning to text restores the current line highlight without a cursor movement.
Character selection is not implemented.

The worker serves an ephemeral loopback URL with an unguessable path. The sandboxed
page polls worker-owned state; it receives no host IPC. UTF-8 byte anchors remain
source IDs/ranges, independent of DOM spans. Navigation checks document tickets and
monotonic sequence numbers. Shutdown closes the HTTP server; the host supervises
process cleanup. Polling and fixed source text are test simplifications.

Development and instrumented package smoke tests copy this directory outside the
host tree before loading it. Production packages do not bundle the fixture or Node.
