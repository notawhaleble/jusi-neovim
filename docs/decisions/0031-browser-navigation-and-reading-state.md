# ADR 0031: Browser navigation and reading state

Status: implemented; verification recorded in STATUS.

Ordinary link clicks and Ctrl-J use the current Chromium document, normalizing
anchor targets to `_self`. Explicit Ctrl-J activation supplies Electron's userGesture
flag: otherwise Chromium may skip its history entries. Native input and text-mode
Ctrl-L copy the current WebContents URL to Neovim's `*` register.

Cmd/Ctrl/Shift-click and middle-click are routed by trusted native mouse input to
the existing HTTP(S) foreground Neovim link-tab path. Modifier state comes from
actual native modifier-key transitions, cleared on both adapter focus boundaries, because Electron's mouse callback omits modifier fields on
macOS. Both mouse phases are suppressed, preventing a second ordinary navigation.
Ctrl-N resolves the mapped link and uses the same Lua tab allocator. Source identity
and revision/context are checked across async work. These tabs perform a fresh GET;
private tabs retain the existing fresh-private-session contract (ADR 0013).
Chromium background-tab adoption hung in the desktop experiment and is not used.

Scripted popup windows still require a one-use, 15-second source permit, now exposed
as `JusiWebAllowPopup`. The actual child retains its exact Session/opener and opens
in a horizontal split. Source navigation/closure closes owned popups. Nested popup
sources have the same policy. Native placement uses ordinary window/grid identity,
statusline boundaries and existing generation acknowledgements; debug mode alone
reserves a toolbar row. This supersedes ADRs 0012/0016/0019's auxiliary-window,
floating-window and opt-in routing. No production auxiliary BrowserWindow fallback
is installed. Devtools remain separate.

Browser profile and ready status append to the local Neovim statusline and restore
the previous format when leaving browser buffers. `Text ready` is present only for
a current ready mirror. Bottom badges and popup controls remain debug-only.
`JusiWebPause` freezes automatic reparsing/publication, preserving the last text;
mutations still revoke stale guest maps/jobs. `JusiWebResume` rebuilds and enables
automatic refresh. `JusiWebRefresh` works while paused, and new navigation builds an
initial mirror. These commands operate on the current browser identity.

Visual extraction excludes ancestor display/content-visibility suppression,
zero-area positioned legacy CSS clips and fully inset clips. This removes clipped
screen-reader labels such as Wikipedia's letter-per-line “Jump up to” from the
visual text/cursor map without changing the page's accessibility tree. Style cache
signatures include clipping so visibility changes still invalidate extraction.
General shadow/frame extraction and arbitrary CSS clipping remain outside this slice.

Browser command identity also binds when text extraction is off. Rich-mode entry
flushes the pending authoritative layout before focusing the guest, preventing an
older split/window frame from clearing the newly entered mode.

ADR 0043 also clears modifier tracking at host app-focus boundaries and cancels
pending link lookup dispatch across those boundaries. This addresses the Cmd-Tab
missing-key-up sequence shared by both adapters.

`JusiWebTogglePause` and browser-local Ctrl-P share the same Neovim-owned
`jusi_auto_refresh` state. In text mode a buffer mapping invokes the command;
in rich mode the shared main-process browser installation validates the exact
source buffer/incarnation before asking Neovim to choose pause or resume. Key
repeat is suppressed in rich mode. Neither transport maintains a second toggle
state or changes the document's rich/text mode.

Pause/resume redraws the Neovim statusline synchronously with the buffer flag
change, before host notification. `Text paused` takes precedence over readiness;
late guest readiness and manual refresh cannot hide the paused state. Disabled
text takes precedence over both. Resume exposes the current ready/automatic state.
