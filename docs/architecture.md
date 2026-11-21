# Architecture

## Purpose

This project is an Electron frontend for Neovim. It presents Neovim as a
native-looking full-window editor UI while allowing selected Neovim buffers to
render rich content supplied by presentation providers. The current surface backend
is Chromium; the first separately packaged adapter is web browsing.

The renderer keeps Neovim's windowing model intact. Web content is not an
overlay outside the editor; it is a composed surface owned by a Neovim buffer
and placed according to Neovim layout state.

## Source Of Truth

Neovim owns editor state. The frontend consumes that state and composes it.

- `grid_line`, `grid_clear`, and related redraw events own text grid contents.
- `grid_resize`, `win_pos`, `win_float_pos`, and related redraw events own grid
  geometry and stacking.
- Runtime metadata owns tabs, windows, buffers, current tab, current window,
  and web-buffer declarations.
- The bridge resolves `windowId -> gridId` before state reaches the renderer.

The renderer must not infer grid ownership from approximate matches such as
same size, same position, buffer id, or iteration order. If ownership is not
known, the surface is not rendered.

Presentation snapshots are captured at Neovim `flush` boundaries. Working redraw
state and authoritative lifetime metadata may advance before publication; the
renderer receives only a completed frame. Metadata-only updates remain coalesced
when no redraw is pending. Initial-state IPC uses the same published snapshot and
native layout generation rather than rebuilding a frame from live getters.
Browser region navigation uses a separate scoped live interaction read so rapid
cursor operations do not depend on when the next presentation frame is flushed.
Provider identity invalidation remains immediate, including during incomplete
redraws. Tab closure reconciles published Tabpage handles with Neovim's live list;
a tab's ordinal number is never used as its identity. See ADR 0033.

## Core Identities

There are three distinct identities.

`Buffer identity`: a logical Neovim buffer. A web buffer is still represented
as a Neovim buffer.

`Session identity`: the live browser state attached to a web buffer, including
URL, history, DOM state, scroll position, form values, JavaScript context, and
mirror mapping.

`Window identity`: the visible Neovim window that currently owns the
interactive surface for a buffer.

One web buffer may have one live browser session. That session may be attached
to at most one visible Neovim window at a time. If the same buffer is present in
another tab, the session is preserved and reattached when that tab becomes
visible.

## Composition Model

The UI is a composed scene of Neovim-driven surfaces:

- text grids
- web surfaces
- floating windows
- popupmenu
- cmdline and messages
- cursor and selection projections

Each surface has explicit bounds, clipping, z-order, focus behavior, and
hit-testing behavior. Browser content participates in this scene like any other
surface, so Neovim UI layers can appear above it when their z-order requires it.

## Presentation Buffer Contract

A presentation buffer has a rich representation and an optional text representation.
The current bridge retains `web-*` compatibility names. Provider registration and
options live in `runtime/lua/jusi_neovim/init.lua`; the bundled web command lives in
`packages/jusi-web.nvim`. See [provider API](provider-api.md).

`Live surface`: the interactive browser instance. It owns page navigation,
scrolling, form focus, JavaScript execution, and DOM inspection.

`Mirror text buffer`: the Neovim buffer contents used for Vim-native movement,
Visual selection, yanks/operators, Ex commands, and macros over page text.

When enabled, the mirror is part of the presentation contract. `text_layer=off`
disables extraction. Rich loading never awaits the text job. DOM extraction yields
between slices; a host-owned indicator reports pending/building/ready/error and
offers retry. Main and Neovim also validate session UUID, incarnation and document revision
at commit; see [document revision ADR](decisions/0003-document-revisions.md). The current
DOM mapping remains specific to the web backend.

## Mirror Mapping

The mirror map links Neovim buffer positions to page structure.

For each mirrored span, keep:

- mirrored text
- source DOM node identity
- DOM text offset range
- page-space rectangles for rendered fragments
- block or inline hints where useful

A linear text index can be derived from this structure, but it should not be
the only source of mapping truth.

## Interaction Model

Normal-mode editing remains Neovim-first.

When the mirror buffer is active, Neovim owns cursor movement and text
operations. The frontend projects cursor and selection state onto the live web
surface when possible.

When the live browser surface is active, the page owns DOM focus and form
editing. Reserved editor commands are routed back to Neovim through an explicit
input policy.

The browser surface is necessary for inputs, buttons, drag/drop, canvas
widgets, custom controls, and any interaction that cannot be represented as
plain mirrored text.

## Bridge Layers

`runtime/plugin/jusi_neovim.lua` emits tab, window, buffer, current-window, and
web-buffer metadata through `rpcnotify()`.

`src/bridge/notification-router.ts` routes raw Neovim notifications into
metadata, grid geometry, screen contents, and overlay state.

`src/bridge/redraw-translator.ts` normalizes multigrid redraw events into grid
bounds.

`src/bridge/layout-controller.ts` combines runtime metadata with redraw
geometry and web-session state. It resolves visible web attachments and window
grid ownership.

`src/bridge/screen-state.ts` stores grid text contents from redraw events.

`src/bridge/rpc-session.ts` defines the embedded Neovim session boundary used
by the Electron main process.

`src/renderer/app.ts` renders only resolved surfaces. It does not invent
window-to-grid relationships.

`docs/neovim-ui-coverage.md` tracks which Neovim UI events and editor actions
are currently consumed, intentionally ignored, or still unsupported.

## Launch Flags

Interactive Electron launches load the user's normal Neovim configuration by
default, so installed provider packages and options are available. Set
`JUSI_NVIM_CLEAN=1` for reproducible debugging with `--clean`.

Debug UI is disabled by default. Set `JUSI_DEBUG_UI=1` to show renderer
diagnostics and the full state dump.

## Browser Boundary

Named Jusi browser profiles persist cookies/storage across buffers. Local documents
use isolated in-memory sessions with canonical opened-directory grants and no
network access. Remote guests cannot access the local-file protocol. Main enforces
guest sandbox/isolation, allowed navigation, permission policy and shell IPC sender
identity. The shell has a restrictive script CSP. Browser safety parity is not
established; see [browser boundary ADR](decisions/0002-browser-boundary.md).

## Embedded Neovim transport

`EmbeddedNvimRpcClient` launches Neovim and owns its shutdown. `MsgpackRpc` frames
requests and notifications using `@msgpack/msgpack`, decodes extension handles to
numeric IDs, and tracks timeout/error/EOF cleanup. Incoming asynchronous handlers
can issue nested requests; responses unwind in reverse request order. See
[ADR 0004](decisions/0004-neovim-rpc.md) for limits and compatibility.


Provider startup belongs to each Neovim package. The web package's
`plugin/jusi_web.lua` registers its provider and commands; the host runtime runs
without that package installed. Package-manager `setup(opts)` configures subsequent
opens without changing active sessions. The bundled launch path still includes
the web package for compatibility.

## Backend code boundaries

Shared presentation session, attachment and text-line contracts live in
`src/presentation/contracts.ts`. Compatibility web sessions carry a normalized
surface descriptor; the bridge and shell validate it against the built-in backend
registry. The web backend owns DOM scripts, partition naming and local preview
rendering under `src/backends/web`. Main still owns the security policy and the
shell coordinates Neovim input and revision-aware text publication. Backend
registration is compiled host code; installed plugins supply data through the
versioned provider API. See [ADR 0005](decisions/0005-backend-boundaries.md).

The shell uses RendererSurface for attachment, resize, focus/mode, document
operations and disposal. WebRendererSurface owns guest events and script execution.
Hidden tabs retain their guest; closed sessions dispose it. Pending results are
rejected when the document changes or the surface is disposed. Main revision
tickets govern text publication. The internal interface retains linear offsets
and a compatibility Electron document handle.

Managed worker providers use the Neovim runtime's `jusi_neovim.worker` adapter. Explicit
launch options and a bounded versioned JSON readiness exchange precede presentation
attachment. Buffer disposal closes the owner pipe; an independent guardian requests shutdown
and terminates the worker group after a 200 ms grace period. Pipe EOF also covers
abrupt Neovim death. See
[ADR 0006](decisions/0006-worker-lifecycle.md) for limits and crash-cleanup gaps.

Workers can negotiate text.extract and return validated UTF-8 lines with opaque
source byte ranges. The Lua adapter checks current document tickets and cancels
requests on invalidation/close. Its low-level API returns data; the automatic host path selects worker or DOM
extraction per session. Worker replies use the private Neovim channel and existing
revision-checked commit queue. Ready follows acceptance; worker source anchors stay
separate from DOM spans. Optional source.navigate sends the current Neovim line's
source range with its ticket and explicit window identity to the worker. The worker
owns projection; no DOM offsets are fabricated. The trusted shell reports rich/text
mode with explicit session/window identity. Opt-in `source.navigate.cursor` also
sends the UTF-8 byte column in the returned text line, without changing its source
anchor; providers resolve word/character locations themselves (ADR 0046). Optional
`source.navigate.selection` sends Neovim-resolved per-line UTF-8 visual ranges in
the published text, including reverse/exclusive/block semantics (ADR 0047). Lua
also supports opt-in text viewport reports and trusted provider surface actions
(ADR 0048); providers own action meanings and rich scrolling geometry. Lua
suppresses projection during rich focus and restores it on return, including after
asynchronous text publication. See
[ADR 0007](decisions/0007-worker-text-requests.md).

The optional `packages/jusi-markdown.nvim` test provider owns its Markdown parser,
Node worker and dependencies. It serves an immutable file snapshot through a
random loopback URL and extracts text in a separate worker thread. Token ranges
map UTF-8 source bytes to rendered blocks; no format-specific code enters the host.
See [ADR 0008](decisions/0008-markdown-test-viewer.md).

DOM-backed browser text watches relevant mutations, resize/resource/font changes.
A bounded counter poll triggers revision invalidation and debounced rebuild; host
projection decorations are ignored. Worker-backed providers retain their own source
lifecycle. See [ADR 0009](decisions/0009-browser-document-changes.md) for timing and
coverage limits. Form controls and editable content are excluded from DOM extraction.

Browser profile defaults are selected in Neovim with JusiWebProfile; existing
presentations retain their profile. JusiWebPrivate uses a fresh in-memory partition
per presentation UUID. Local surfaces retain their isolated local partition.
The shell displays the resolved storage scope beside the presentation. See
[ADR 0010](decisions/0010-browser-profiles.md) for ownership and lifetime details.

Named profile management uses trusted Lua notifications to main with explicit profile
names. Main refuses mutation while that session has live pages, reserves it during
native confirmation/clearing, and rejects concurrent attachment. Session media grants
are inspectable and revocable; pending prompts carry a revocation epoch and navigation
guard. See [ADR 0011](decisions/0011-profile-management.md).

Network web presentations expose a host-owned one-use popup permit through
`:JusiWebAllowPopup`. Main retains the actual sandboxed child in the source Session,
preserving opener/message semantics, and binds it to a horizontal Neovim split.
Its lifetime is bounded by the source guest. Production does not create auxiliary
BrowserWindows. See [ADR 0031](decisions/0031-browser-navigation-and-reading-state.md),
which supersedes the auxiliary-window and floating-window presentation decisions.

Browser links have a native context-menu action to open a foreground Neovim tab.
Main authorizes a bounded one-use URL request, the shell resolves explicit guest/
buffer/session identity, and Lua creates the tab and presentation. The new buffer
inherits source profile and text policy. Private link tabs explicitly start a fresh
private session; named-profile tabs share the profile. The action is a GET without
opener/referrer forwarding. Source navigation invalidates pending menu requests.
See [ADR 0013](decisions/0013-browser-link-tabs.md).

The native-child integration uses NativeChildOwner and the trusted
jusi_neovim.native-child Lua protocol to bind retained Chromium documents to exact Neovim
buffer/session/incarnation identities. Reserved buffers carry an opaque nativeChild
marker and are excluded from DOM attachments. Cancellation is epoch/sequence guarded;
cleanup preserves replacement incarnations. The production coordinator mounts after ownership
confirmation. See
[ADR 0015](decisions/0015-native-child-ownership.md).

Native-child allocation creates an ordinary horizontal split. It requires a visible source in the current tab and uses
bufhidden=wipe to propagate split closure to document ownership. Both the adoption harness and production coordinator exercise this allocation. See
[ADR 0031](decisions/0031-browser-navigation-and-reading-state.md).

The internal native placement resolver validates bound session/window/grid ownership
and derives inward-rounded DIP rectangles from Neovim ordinary window grids and supplied cell
metrics. It leaves statusline space clear (and one debug toolbar row when enabled) and parks views on unresolved geometry,
overlap or transient trusted UI. Placement generations reject late results. The
adoption fixture consumes this resolver with explicit test metrics; the production coordinator uses measured shell metrics. See [ADR 0017](decisions/0017-native-child-placement.md).

The production shell reports measured stage/cell geometry after rendering a main-owned
layout generation. Main validates sender, epoch, sequence and content bounds, using its
own shell zoom for DIP conversion. State/resize/loading/crash invalidates measurements;
transient command/completion/history UI reports the viewport blocked. Ordinary
one-line messages lie below the viewport and do not block it. See
[ADR 0018](decisions/0018-shell-native-viewport.md).

NativePopupCoordinator subscribes to viewport expiry,
binds the retained child to its split and places a WebContentsView in the main
window. The shell retains trusted acknowledgement controls (visible only in debug mode); a matching token and
layout-generation acknowledgement permits showing the child. Invalid geometry or
overlap parks it. This path supports rich content and Ctrl-Q/Close;
optional text is handled by the bound native controller. See
[ADR 0019](decisions/0019-gated-rich-popups.md).

On macOS the application menu includes Electron's standard Edit roles. Native child
inputs use the focused AppKit responder for select-all and undo/redo.
Both browser adapters dispatch platform copy/cut/paste shortcuts through the shared
browser command handler to the receiving WebContents, before shell accelerator
blocking. Shift-paste uses Chromium's pasteAndMatchStyle. No additional clipboard
bridge or asynchronous Clipboard API permission is exposed to documents.
See [ADR 0049](decisions/0049-browser-clipboard.md).

Native popup mode changes use NativeChildOwner reservation identities
and the shared Lua mode state. Ctrl-\ then Ctrl-N selects the bound Neovim split
and focuses the shell; `i` returns to its visible native document. Ctrl-Q closes
the child. The rich view remains visible while editor focus is active. See
[ADR 0020](decisions/0020-native-popup-modes.md); text publication is described below; mode routing alone does not project the cursor.

BrowserDocumentController owns browser text jobs, mutation polling, operation deadlines,
generation cancellation, validation and cursor/selection mapping for both ordinary
webviews and retained native children. WebRendererSurface supplies the DOM transport;
nativeBrowserDocument supplies the native transport and revision publication adapter.
The renderer configures publication for ordinary pages and delegates browser text work.
Worker-backed providers keep their separate worker text lifecycle.

Native children inherit the source text policy. Revision-checked publication fills
their Neovim buffer; the trusted toolbar reports progress independently of rich display.
NativePopupCoordinator passes authoritative window cursor/selection state to the shared
controller in text mode and clears projection in rich mode. Native ownership, placement,
focus and trusted controls remain platform responsibilities. Fixed script execution is
internal; documents receive no execution endpoint or Neovim IPC.
See [ADR 0022](decisions/0022-shared-browser-document.md).

Browser interaction dispatch lives in the web backend's interaction module. Both
transports use its link/scroll sequencing, cursor/index conversion, hit-result
validation and retry operation. Main includes the authoritative cursor and mirror
revision with navigation commands, so delayed renderer state cannot activate a
link at an older cursor. Main flushes pending state before commands, and interaction
reads the newest received state independently of the scheduled render frame.
Pointer coordinates come from the transport; hit results
are checked against current identity/revision before a ticket-checked Neovim cursor
commit. Native compositor parking does not revoke current-tab document commands.
The native trusted text status button dispatches the same rebuild operation using
a current control token. See [ADR 0023](decisions/0023-shared-browser-interaction.md).

Bridge text columns count Unicode code points (including composing marks); DOM and
mirror offsets count UTF-16 units. Shared text-mapping functions translate both ways.
Inclusive character projection keeps surrogate pairs and following combining marks
together. Cursor writes use Neovim byteidxcomp to invert the bridge's column counting.
DOM guest clicks arrive from host-observed WebContents events through the trusted
shell preload, rather than relying on mouse bubbling into the webview element.
Both transports use shared hit testing and revision-checked cursor commits.
See [ADR 0024](decisions/0024-browser-text-coordinates.md).

Selections emitted by the runtime include per-line half-open code-point spans resolved
by Neovim getregionpos. The shared browser mapper converts these to UTF-16 ranges;
one projection paints all ranges for either adapter. Explicit empty spans suppress
projection, including partial terminal cells and selections over the 10,000-line
bound. Legacy endpoints retain inclusive fallback behavior. See
[ADR 0025](decisions/0025-authoritative-selection-spans.md).

Browser mode keys share a per-document chord state machine. Focus loss, full navigation,
composition and destruction discard pending chords. DOM webview blur reaches main
through a shell-only reset call because element focus differs from WebContents focus;
native views use direct blur. Adapters retain validated mode/close dispatch. See
[ADR 0026](decisions/0026-shared-browser-mode-keys.md).

Reload/history/document zoom share command interpretation and WebContents dispatch
across DOM and native adapters. History uses navigationHistory; zoom is clamped to
0.3–3 and notifies each adapter to refresh its shared text projections. Unsupported
or destroyed targets do not consume commands. See
[ADR 0027](decisions/0027-shared-browser-commands.md).


Browser text extraction reports an explicit `limited` state when its work budgets
are exhausted. Both adapters show “Text limit reached · retry”; capped work publishes
neither partial text nor partial mappings. Rich input remains available and normal
retry/mutation rebuilding can recover. Limits and cooperative yield boundaries are
specified in [ADR 0028](decisions/0028-browser-extraction-limits.md).

Browser reading controls and refresh anchoring follow ADR 0030. Shared DOM
activation covers text-bearing controls and links. Region keys run serially and
resolve Neovim's authoritative cursor at execution time. Neovim restores per-window
text anchors after revision-checked publication. The observer filters resource and
paint-only churn, and batches relevant content revisions (400 ms quiet / 1500 ms
maximum), while immediately revoking stale guest maps and extraction jobs.

Browser reading state is shared across adapters: `JusiWebPause` suppresses automatic
publication/rebuilds while preserving published text, but relevant mutations still
revoke guest mappings. Ctrl-P in text/rich mode and `JusiWebTogglePause` resolve
the toggle from Neovim buffer state. Resume catches up; explicit refresh and initial navigation
can build while paused. Browser readiness and profile render in each window's Vim
statusline; normal page-level badges are hidden. Visual extraction excludes
zero-area CSS clips and fully inset accessibility labels, including their descendants.
Preformatted code maps whitespace and explicit newlines to DOM text offsets.
The GitHub file viewer uses a presentation-only container for both source and
line numbers. The extractor includes visible source cells from that container
and applies normal visibility and editable-control filtering to their contents.
Ctrl-J activation explicitly carries a user gesture so browser history does not skip
its navigation. Ordinary link targets are normalized to the current document;
modified native mouse input and Ctrl-N use the existing Neovim foreground link-tab
path. Immediately before opening a tab, Lua checks the source incarnation and the
current Neovim tab, window, and buffer. A rejected open leaves focus alone.
Both adapters register fullscreen, input tracking, and modified clicks through
BrowserDocumentEvents. The opener installs child adoption separately. Modified mouse opens
use current trusted Chromium press/release flags collected in an isolated world
(ADR 0050). Main pulls a single matching result after native input; pages receive
no host bridge. Keyboard history does not decide click routing, and non-link
controls retain ordinary browser handling.

### Editor grid mouse input

The shell sends grid-relative press, drag, release and wheel events through the
sender-checked mouse IPC (ADR 0034). Current window/grid/tab identities are
validated in the session. Pointer capture retains a gesture's original grid;
cancellation and blur release it. Root-grid tabline gestures may complete across
the tab switch they initiate. Neovim owns mouse mappings, multi-click selection,
separator resizing and native/custom tabline callbacks. Mouse-disabled floats,
browser surfaces and modal host overlays do not leak new editor gestures.
High-resolution wheel deltas are accumulated into bounded discrete steps.

### External command and message UI

External command lines retain their Neovim nesting levels and highlighted content
(ADR 0035). UTF-8 byte positions are converted before measuring the rendered caret
and completion anchor. Blocks, messages, history and status text retain chunk
attributes. Dialog answers go to Neovim without local pager interception. Live and
history message lists retain bounded newest output with visible truncation markers;
message display revisions govern dismissal independently of editor redraws.
Prompt group IDs are retained separately and asynchronously resolved to effective
RGB attributes by the bridge (ADR 0038). Unresolved prompts use default styling;
late replies cannot style a different prompt or expose an incomplete redraw.

Native focus restoration survives placement changes until Electron reports actual
child focus. Calling focus alone does not acknowledge delivery; changed active
window or binding identity and text-mode entry revoke the pending request.

Grid text preserves each Neovim cell's complete text and wide-character continuation
(ADR 0036). Compact runs carry explicit column counts; combining and Unicode cells
remain separate, while ordinary ASCII of one highlight may coalesce. Rendered run
widths use these columns and the measured cell width, keeping later text aligned
independently of fallback glyph metrics or JavaScript string length.

Browser cursor projection clears its completed-position cache when dispatching a
new position. Returning to a previous position while another projection is pending
therefore sends the latest position; a late reply cannot replace its cache entry.

Grid and external UI chunks share highlight conversion for solid, wavy, double,
dotted and dashed underlines plus strikethrough, including special color. Cursor
style disablement uses the host block default. Busy state is published at frame
boundaries and suppresses both cursors; an external command line suppresses the
editor cursor beneath it (ADR 0037).

Reported scalar UI options are retained in immutable completed screen snapshots.
Incompatible negotiated capabilities are exposed in unsupportedUiOptions and logged
on transition; normal Neovim negotiation is preserved (ADR 0039). Font,
spacing and pointer policies continue to be host-controlled; retained option
values are not applied as CSS or input behavior automatically.

Browser buffers expose the current committed URL in `b:jusi_browser_url` and use
it as their Neovim name. Duplicate names receive a numeric suffix without sharing
buffer or browser-session identity. Main-process navigation observation is shared
by both browser adapters; only the web provider is renamed. The requested surface
URI is separate from current-location metadata, so renaming does not reload a page.
See ADR 0042 for collision policy, scheme-only labels and rename-artifact cleanup.

Transient browser input expires on host-window blur and focus as well as guest
blur. This clears diagnostic modifier history, pending native presses and mode/
window-command prefixes without changing Neovim mode or browser ownership. Link
collections started before the boundary cannot open a tab afterward. Both adapters
use the shared main-process registration and dispose it with the guest (ADR 0043).

F11 and Ctrl-Command-F exit active document fullscreen before toggling the host
window on a later explicit press; pending exits and key auto-repeat cannot also
toggle the host. All three input surfaces use the shared coordinator (ADR 0044).

Document fullscreen is a temporary presentation tied to the exact active browser
buffer/session/incarnation and Neovim tab/window/grid. A shared main-process policy
permits focused requests, retains Chromium's user-activation/frame-policy checks,
and denies automatic fullscreen. DOM guests use Chromium's top layer; native
views temporarily use host content bounds while other native views remain parked.
HTML fullscreen window resizing is disabled on the shell and both browser adapters.
Permission approval captures the host state. Only an accepted document entry
acquires responsibility for restoring it. Closing a guest with an unused grant
leaves the host available for the next request.
The authorized shared coordinator explicitly enters native window fullscreen;
sibling webviews cannot implicitly window the host when a document exits.
Exit restores ordinary placement and the preceding host fullscreen state. Owner
changes, navigation, text mode, destruction and process loss revoke fullscreen;
late exit completions cannot alter a newer presentation (ADR 0044).

Browser DevTools use the shared browser-command dispatcher. The Neovim command
resolves the current buffer/window/incarnation to its existing WebContents; F12
uses that same dispatcher in both adapters. Tools open detached, preserving the
Neovim-owned document layout, and inspect only the chosen guest. No remote debug
listener or additional guest IPC is enabled.

Opt-in browser diagnostics (`JUSI_BROWSER_TRACE`, ADR 0049) record main-process
input routing/fullscreen decisions and explicit Neovim layout identities in a
bounded local JSONL ring. URL hashes are run-local, ordinary typed characters
are excluded, and no document-facing API is added. `JusiWebDebugMark` flushes an
incident marker. Pause status is rendered directly from Neovim's buffer flag and
redrawn at command processing, independently of asynchronous extraction readiness.

Native browser placement is retained across text, cursor and mirror-status paint.
Main revokes it on authoritative composition/ownership changes or explicit shell
geometry/lifecycle invalidation; current invalid or blocked viewport reports park
views, while identical valid measurements preserve focus (ADR 0051).
