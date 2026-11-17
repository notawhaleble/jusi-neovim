# Provider API v1 (foundation)

The host exposes `require("jusi_neovim")` on runtimepath. The plain `jusi` namespace
belongs to the separate notebook plugin; the host supplies no alias under that name.
Providers written against the earlier test host must change `require("jusi")` and
`require("jusi.*")` to `require("jusi_neovim")` and `require("jusi_neovim.*")`.
A provider repository needs a
Lua module; its package manager calls `setup(opts)` after the host runtime is
available. No registry service or new installer is needed. See Neovim's
[package documentation](https://neovim.io/doc/user/pack.html).

```lua
-- lua/my_viewer/init.lua in an independent plugin repository
local M = {}
function M.setup(config)
  require("jusi_neovim").register({
    api_version = 1,
    id = "my-viewer",
    open = function(request, ready)
      -- request = {buffer, target, options}. Installed Lua is trusted code.
      -- A provider can invoke its renderer using an argv list, without a shell:
      -- vim.system({config.command, "--theme", config.theme, request.target}, ...)
      -- For a long-lived server, return a function that terminates it.
      ready(nil, {backend = "web", url = request.target})
      return function() -- release provider resources exactly once
      end
    end,
  })
end
return M
```

`ready(error, surface)` may be asynchronous; the host ignores duplicate completion
or a completion after close. Errors leave an ordinary scratch buffer and report
through Neovim. Only `backend="web"` is implemented. The host always creates a new
scratch buffer, preserving the previous buffer and its edits. Provider disposal
runs on `JusiClose`, buffer deletion, `JusiTextBuffer` and orderly Neovim exit.
Providers with custom process launchers must terminate their own processes. The
managed worker adapter below supplies startup and disposal, including cleanup
after loss of the Neovim owner pipe. The API is experimental until the conformance gates pass.

```lua
require("jusi_neovim").open("my-viewer", "https://example.com", {
  text_layer = "off", -- default: auto
  profile = "work",   -- default: default; letters, digits, underscore, hyphen
  command = {"viewer", "--some-provider-option"}, -- passed unchanged to provider
})
```

`JusiOpen[!] provider target` joins the target words and selects auto/off extraction.
Provider-specific structured options belong in the Lua API or provider commands.
A provider must use argv arrays for process invocation, never interpolate document
paths into a shell string. Starting a server does not confer browser privileges:
its HTML is still a sandboxed untrusted document.

## Bundled web package

`packages/jusi-web.nvim` has an independent Neovim repository layout and is bundled
on runtimepath by the app. It may be extracted to its own Git repository; no remote
repository has been published. Configure before runtime startup:

```lua
vim.g.jusi_web = { profile = "work", text_layer = "auto" }
```

For an extracted checkout with lazy.nvim, use a local `dir` spec or your actual
repository URL and `require("jusi_web").setup(opts)`. Do not invent an upstream URL.
The package owns `plugin/jusi_web.lua`; the host runtime does not import it.
`setup()` without arguments initializes once from `vim.g.jusi_web` or defaults.
Explicit `setup(opts)` validates and replaces command defaults, including after
package startup (as lazy.nvim does). Existing presentation sessions are unchanged.

Native installation: copy/extract the web package into
`stdpath("data")/site/pack/jusi/start/jusi-web.nvim` and set `vim.g.jusi_web` in
init.lua. For lazy.nvim, use `{ dir = "/path/to/jusi-web.nvim", main = "jusi_web",
opts = { profile = "work" } }`. The host runtime must also remain on runtimepath:
lazy.nvim resets it by default, so include the host runtime as an eager `dir` spec
or in `performance.rtp.paths`. Use actual local paths; neither package is published.

`npm run test:packages` checks copied independent repositories through native
packpath and pinned lazy.nvim, using disposable XDG directories and real user init.
It downloads the pinned package manager into `.local/test-tools` on first use.
`npm run check` includes the offline native subset. See
[package conformance evidence](implementation/M2-EVIDENCE.md).

Common keys: `i` enters rich interaction from text navigation;
`Ctrl-\\` then `Ctrl-N` returns to Neovim navigation; `Ctrl-Q` closes the presentation
in either mode. `:JusiClose` is the command equivalent. The Neovim text layer remains
read-only and supports motions, selection and yanking. When text is off or pending,
returning to Neovim still permits window and command navigation.

The readiness indicator stays visible and can be clicked to rebuild/retry.
Mapping for browser DOM is the compatibility implementation; generic PDF/EPUB
anchors, live mutation invalidation and richer launch handshakes are pending.

## Managed worker startup (experimental POSIX API)

Register `open = require("jusi_neovim").worker(function(request) return launch end)`.
The returned launch table contains `executable` (absolute path), `argv` (literal
string list), `cwd` (absolute), `env` (replacement string map, no implicit inherited
variables), optional `ready_timeout_ms` (default 5000, max 60000), and
`required_capabilities` (default `{ "surface.web" }`). Resolve package commands
with `vim.fn.exepath` before returning them. Supply only the environment required
by that executable. A missing executable fails this provider without stopping Neovim.

The runtime writes this JSON line to stdin:

```json
{"type":"hello","version":1,"capabilities":["surface.web","text.extract","source.navigate","source.navigate.cursor"]}
```

The worker reads hello, then writes exactly one JSON line to stdout:

```json
{"type":"ready","version":1,"capabilities":["surface.web"],"surface":{"backend":"web","url":"about:blank"}}
```

Use stderr for diagnostics. Keep the worker running and stdout open until its
presentation closes. HTTP(S) URLs are also supported; local-file URLs are rejected.
The handshake buffer is capped at 64 KiB; only the last 8 KiB of received stderr
is retained. Duplicate frames, unsupported versions/capabilities, output EOF and
process exit fail the worker. Optional text extraction is described below.

Closing the provider or losing Neovim's pipe tells a separate guardian to write
`{"type":"shutdown","version":1}` and close worker stdin. Release resources and
exit within 200 ms; the guardian then kills remaining group members. This is not
a save transaction. Workers must not daemonize or escape their process group.
The guardian uses the same Neovim binary with user configuration disabled.
Killing the guardian itself is not covered. Diagnostics may be dropped when the
bounded stderr queue is full. See [ADR 0006](decisions/0006-worker-lifecycle.md).

## Optional worker text requests (transport foundation)

Negotiate `text.extract` in ready.capabilities. Installed Lua can call
`local cancel = require("jusi_neovim").extract(ticket, function(err, document) ... end)`
with the current host-issued document ticket. The callback returns validated data; this low-level call does not itself commit
text or update renderer status. Do not fabricate tickets.
`text_layer="off"` disables this adapter. `text_timeout_ms` in launch options defaults
to 10000 (range 1–60000). New requests cancel previous requests for that worker.

Worker input:

```json
{"type":"extract","id":1,"ticket":{"bufferId":2,"incarnation":1,"sessionId":"example","revision":3}}
```

Worker output (echo the exact ticket):

```json
{"type":"text-result","id":1,"ticket":{"bufferId":2,"incarnation":1,"sessionId":"example","revision":3},"document":{"offsetEncoding":"utf-8","lines":[{"text":"Hello","anchor":{"source":"chapter-1","startByte":0,"endByte":5}}]}}
```

Return `error` (string, at most 4096 bytes) instead of `document` for extraction
failure. Handle `{type:"cancel",id,ticket}` by stopping that request if possible;
late replies are discarded. Source names are opaque; byte ranges are half-open.
No DOM projection or file access is inferred from an anchor.

Documents allow 10000 lines / 512 KiB text. The ready-state receive buffer and
queued guardian output are capped at 1 MiB, lifetime stdout at 64 MiB, and lifetime
request traffic at 64 MiB. Exceeding transport caps fails the worker; malformed text
documents fail only that request. Reopen after lifetime-budget exhaustion.
Managed providers negotiating text.extract now use automatic worker extraction,
visible status/retry and revision-checked publication. Others retain DOM extraction.
Workers may additionally negotiate `source.navigate` for line navigation (below). The
guest URL must match its declared normalized URL; navigating elsewhere makes the
text layer fail safely. See
[ADR 0007](decisions/0007-worker-text-requests.md) for integration limits.


### Optional source navigation

Negotiate `source.navigate` together with `text.extract`. The runtime sends:

```json
{"type":"navigate","sequence":1,"ticket":{"bufferId":2,"incarnation":1,"sessionId":"example","revision":3},"windowId":1000,"anchor":{"source":"chapter-1","startByte":0,"endByte":5}}
```

The anchor is the whole source range of the current Neovim line. Column movement
never invents finer source offsets. `anchor:null` clears projection. Check the full ticket
against the source document and reject older sequence numbers. Sequence is monotonic
for the worker lifetime. No acknowledgement is expected. Coalesce expensive viewer
work; do not block stdin. Without the capability text remains usable in Neovim.

See `scripts/fixtures/source-viewer` for an extractable package and ADR 0007 for
focus/selection limitations. Source IDs are data, never executable code or implicit
filesystem authority. The guest must not receive the host Neovim IPC channel.

#### Optional cursor position

Additionally negotiate `source.navigate.cursor` (requires `source.navigate` and
`text.extract`) to receive `cursorByte` on non-null navigation frames:

```json
{"type":"navigate","sequence":2,"ticket":{"bufferId":2,"incarnation":1,"sessionId":"example","revision":3},"windowId":1000,"anchor":{"source":"chapter-1","startByte":0,"endByte":5},"cursorByte":3}
```

This is the zero-based UTF-8 byte column in the extracted **line.text**, bounded by
its byte length, not an offset in the provider source or a screen column. Resolve
it through your own word/character mapping. The host does not add it to startByte.
Same-line cursor motions now trigger navigation; identical positions are still
deduplicated. Clear frames omit cursorByte. Providers without this capability keep
the original line-only behavior. See [ADR 0046](decisions/0046-worker-cursor-navigation.md).

#### Optional visual selection

`source.navigate.selection` requires `source.navigate.cursor`. Non-null navigate
frames additionally include `selection: null` outside Visual mode or an array
such as `[{"row":1,"startByte":0,"endByte":12}]` in Visual mode. Each range uses a
zero-based row in the published document and end-exclusive UTF-8 bytes in that
line's returned text. Resolve the ranges through the same private mapping used
for cursor navigation; do not add these bytes to source anchors.

Neovim resolves reverse, exclusive, linewise and block semantics. An empty array
means a visual selection has no representable ranges, including partial terminal
cells or more than 512 selected rows; suppress its projection rather than restore
the cursor highlight. Mode/selection-option changes trigger delivery even without
cursor motion. Clear frames omit the field. See
[ADR 0047](decisions/0047-worker-selection-navigation.md).

#### Optional text viewport and surface actions

`source.navigate.viewport` requires cursor navigation. Non-null navigation frames
include `viewport: {topRow, bottomRow, skipColumns}`: zero-based returned-text rows
(top inclusive, bottom exclusive) and Neovim's wrapped display skipcol. Viewport
changes trigger delivery even with a stationary cursor; clear frames omit it.
Providers own how their rich surface follows that authoritative view.

Trusted provider mappings may call `require('jusi_neovim').worker_action(name, count)`
for the current buffer. Negotiate `surface.actions` to receive an action frame
with `type`, a separate monotonic `sequence`, `windowId`, `action` and `count`.
Names are identifiers of up to 64 characters; count defaults to 1 and is bounded
to 1–10,000. Delivery requires a ready worker in text mode, including when the
text layer is off or pending. Unsupported/inactive/rich owners return false.
Action meanings belong to the provider. Actions never authorize fabricated text
revisions: change documents through real surface navigation. See
[ADR 0048](decisions/0048-worker-actions-and-viewport.md).

Browser opens accept `private = true` alongside `profile` in Lua options.
This selects a fresh in-memory session per presentation; local files remain locally
isolated. The profile name continues to identify persistent opens only.

### Presentation mode and worker text status

The web surface mode projection sets `data-jusi-mode="text"` or `"rich"` on the
document root. Providers may use it to show reading controls only in rich mode.
This is display state, not a document-to-host API or an authorization signal.
Worker text buffers use the existing window status-line attachment for pending,
building, ready, failed and disabled text. The normal reading surface suppresses
non-error worker status overlays; error/limit overlays keep their retry action.
Debug UI retains the overlays.


## Document artifacts and source snapshots

A provider may declare `media_types = { "application/pdf" }` in its registration.
`provider_for(media_type, preferred)` returns a compatible installed provider;
there is no built-in mapping from notebook plugin names to providers.
`open(id, path, {document_id=identity, on_ready=function(error, buffer) ... end})`
accepts a frontend-local staged path and reports asynchronous readiness.
`find_document(identity)` finds an active presentation by the caller-supplied
identity or the worker's immutable `document_id` from its ready frame.

`host.snapshot(buffer, callback)` requires negotiated `source.snapshot` and
captures the current host ticket immediately. It returns a cancellation function.
Callbacks receive `(error, {metadata, files, release})`; each file descriptor has
`name`, `media_type`, `size`, and a host-local `path`. Call `release()` after
consuming the files. Paths are never remote transport references.

The managed worker receives `{type:"snapshot", id, ticket, directory}`. The
host creates that private directory. The worker returns `{type:"snapshot-result",
id, ticket, metadata, files}` or an `error`; descriptors contain filename hints,
MIME types and byte sizes, never paths. Workers must write only into the issued
directory, preserve the captured source revision through navigation, and honor
`{type:"snapshot-cancel",id}`. Each accepted request is independent of foreground
text extraction. Metadata is at most 16 KiB; at most eight files and 32 MiB total
are accepted. Symlinks, duplicate/traversing names, incorrect sizes and tickets
are rejected. At most eight requests are pending per worker; timeout uses the
configured text timeout. Cancellation/close prevents late publication and removes
staging. Large image bytes never enter worker JSON frames.
