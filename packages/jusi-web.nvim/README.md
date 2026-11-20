# jusi-web.nvim

Web presentation provider for the Jusi Neovim host API v1. This directory is ready
to become a dedicated Neovim plugin repository; it is currently bundled locally.

```lua
require("jusi_web").setup({profile = "default", text_layer = "auto"})
```

`:JusiWebBuffer https://example.com` opens a new presentation buffer.
`:JusiWebBuffer! https://example.com` disables text extraction.

Requires the Jusi host runtime. Install with a normal Neovim package manager.
`i`: rich interaction; `Ctrl-\ Ctrl-N`: Neovim navigation; `Ctrl-Q`: close.
In Neovim navigation mode, `Ctrl-J` activates the control under the cursor and
`Tab`/`Shift-Tab` cycle scrollable text regions. Refresh preserves the nearest
matching text line and column; image loads and paint-only animations are filtered.

The package starts itself through `plugin/jusi_web.lua`. For native packages, put
this directory under `site/pack/jusi/start/` and configure `vim.g.jusi_web` in init.lua.
For lazy.nvim, use a local checkout (no upstream repository is published yet):

```lua
{ dir = "/path/to/jusi-web.nvim", main = "jusi_web", opts = {
  profile = "work", text_layer = "auto",
} }
```

Keep the host runtime on runtimepath when using a manager that resets it.
Explicit `setup(opts)` updates defaults for subsequent opens; repeated `setup()`
without arguments is a no-op. Invalid options fail without replacing valid defaults.


Select the profile for subsequent opens with `:JusiWebProfile work`. Without an
argument the command reports the selected default and the current buffer's profile.
Existing buffers keep their accounts. Selection lasts for this Neovim process;
set `profile` in setup/init.lua to choose the default on later launches.

`:JusiWebPrivate[!] URL` opens an isolated in-memory browser session for that buffer.
Each private open starts fresh, including when a persistent profile is selected.
Navigation and parking keep that buffer's session. Private sessions are not shared
between buffers and do not survive app restart; data may remain in process memory
until exit. This is storage isolation, not anonymity or protection from OS logs,
downloads, screen capture, or text copied into Neovim registers.

The host shows `Profile · name`, `Private · this buffer`, or `Local · isolated`.
Named profiles preserve persistent cookies and site storage in Jusi's own app data.
Sites control cookie expiry and may require login again. Session-only cookies,
third-party OAuth, and browser-bound credentials are not promised to survive restart.
No Chrome profile or credentials are imported.

Profile management commands require an explicit persistent profile name:

- `:JusiWebPermissions work` lists this app session's camera/microphone grants.
- `:JusiWebRevoke work` confirms and forgets all those grants.
- `:JusiWebClear work` confirms clearing browser data, HTTP authentication cache
  and session grants for that profile. This signs you out and cannot be undone.

Close every browser buffer in that profile, including parked tabs, before clearing
or revoking. Open pages are refused rather than forcibly closed. During an operation,
new pages for that profile are blocked; close any rejected new buffer and reopen it
after completion. Other profiles and private/local sessions are separate.
These commands do not remove downloaded files, Neovim buffers/registers, OS device
permissions or certificates. Errors can leave a partial clear; retry after resolving
the reported failure. Cancellation preserves data and grants.
The list contains current grants, not a persistent permission history. Private
sessions are reset by closing their buffer and opening a new private buffer.

Use `:JusiWebAllowPopup`, then repeat the page action within 15 seconds. Use `:JusiWebAllowPopup!` to allow repeated
foreground opens while this page has browser focus. Reloading or navigating to
a new document clears the grant. The page can initiate these opens from scripts. One
scripted popup opens in a horizontal Neovim split, retaining its exact Session and
opener. Closing or navigating its source closes it. Unarmed or unsupported-scheme
opens are blocked. Nested popups require their own explicit command. No extra app
frame is opened. Popup documents support the same text/navigation controls.

Ordinary clicks and Ctrl-J open links in the current document. Cmd/Ctrl-click and
Ctrl-N in text mode open foreground Neovim link tabs. Ctrl-O/Ctrl-I navigate rich-mode
history; Ctrl-L copies the current URL to the `*` register in either mode.

`:JusiWebPause` freezes automatic reparsing; `:JusiWebResume` catches up and enables
it again. `:JusiWebRefresh` rebuilds manually even while paused. Pausing retains old
text but revokes stale DOM mappings; navigation still builds an initial mirror.
Profile and current text readiness appear in Vim's statusline. Normal launches hide
the bottom controls; `JUSI_DEBUG_UI=1` retains them for debugging.

Right-click an HTTP(S) link and choose **Open link in new Neovim tab**. The new
foreground tab inherits the source page's profile and text-layer policy, even if
JusiWebProfile has since selected a different profile. Ctrl-Q closes the new
presentation and returns to the previous tab. The original page stays open.

For a private page, the menu explicitly says **fresh session**: the new private
buffer starts without the source's cookies/login. Use the native popup flow for
site actions requiring the existing private session and opener. This link-menu
operation is a fresh GET without an opener or forwarded referrer. It does not
submit forms or apply to local files. The native context menu is available on
ordinary pages; Ctrl-N and modified-click routing work through both adapters.

### Clipboard

In rich mode (press `i`), use **Cmd-C / Cmd-X / Cmd-V** on macOS or
**Ctrl-C / Ctrl-X / Ctrl-V** on Linux to copy, cut, and paste in the page.
Add **Shift** to paste as plain text. Select page text to copy it, or focus an
editable field to paste. In text mode, use Neovim's normal clipboard registers.

### Browser DevTools

Run `:JusiWebDevTools` in the browser buffer to toggle its detached Chromium
DevTools window. In rich mode, F12 does the same (some keyboards require Fn-F12).
This inspects the current document in either browser adapter. Close the tools
window normally, or repeat the command; closing the browser document also closes
its tools. DevTools can inspect and modify the page and its browser storage.

In browser text mode, press `'` to label visible text, then type a label to jump to that exact position. Each scrollable region gets priority, followed by headings and table cells, then other text blocks. Existing lowercase marks keep their usual jumps. Escape cancels.

Press **Ctrl-P** in a browser buffer (text or rich mode) to pause/resume automatic text building. `:JusiWebTogglePause` provides the same toggle; explicit `:JusiWebPause` and `:JusiWebResume` remain available.

Ctrl-P pause/resume updates the statusline immediately: `Text paused` remains
visible even if a late extraction-ready notification arrives. In a host started
with `JUSI_BROWSER_TRACE`, `:JusiWebDebugMark` flushes an incident marker and reports
the local trace directory. With tracing disabled it reports that no trace is active.
