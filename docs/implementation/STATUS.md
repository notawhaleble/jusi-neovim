# Linux x86-64 media-permissions test release, 2026-11-20

Uploaded the portable tar.gz, SHA-256 file and dated installation notes to the
existing v0.1.0-test prerelease. Built the working tree at 8a16469 with local
media changes. Node 24 harness, dist:linux:portable:x64, archive verification,
release upload, remote digest/size verification and notes update exited 0.
The executable matches the cached Electron 44.5.0 Linux x64 binary. All 96
checked application files match the working tree, including the Neovim media
command and production Electron handler. The user subsequently confirmed the
released build supports microphone and camera access in their Linux test.
Logs and per-file hashes are under .local/review/linux-test-20261120/.
Archive SHA-256 is 101a7575cd6dc813d7a7a7dcdb3f6b4e5208500e04e2d5fee6306d325f142080.

# Site media permissions

A disposable HTTPS fixture querying microphone and camera permissions saw
denied with an empty profile. The host now exposes JusiWebAllowMedia in the
current browser buffer. Both adapters verified decline, approval, both
permissions reported as granted after reload, and denial at another origin.
These automated checks exercise permission state.

Node 24 logs in .local/review/. Focused source and packaged media cases exited
0 on both adapters (meeting-query.log, meeting-package.log). npm run check and
npm run smoke:electron exited 0. npm run smoke:package exited 1 in the native
browser workflow waiting five seconds for the tab count to increase by one
(meeting-final.log). That workflow does not invoke the media command. Next
package checkpoint should investigate native link-tab delivery. No new manual
device or dialog review was performed. Entry and handoff harness and diff check passed.

# Local alpha manual review accepted

The user completed the suggested manual workflows in a development instance and accepts the manual review as done. Candidate-based IME has no separate test result. The Linux microphone/camera settings report is open under R6. The host currently prompts for top-level HTTPS media requests and lists session grants by profile. The affected Linux device path has not been reproduced. Next alpha step is the final automated checkpoint. Documentation checks: Node 24 `npm run harness` and `git diff --check`.

# Browser text marks and macOS focus, 2026-11-20

Browser text mode offers visible letter targets on apostrophe. Both transports
passed exact table-cell jumps, user mark preservation and Escape cancellation.
The packaged native child retained focus through interrupted delivery and five
text refreshes after removing redundant calls to show an already visible view.
The synthetic rich-entry workflow now activates the host before sending input.

Node 24 checks under `.local/review/`: `npm run check`, focused hints on both
transports and `npm run smoke:electron` exited 0 (mark-final.log). The package
matrix passed default, native, interrupted focus, alpha everyday and default
workflow stages, then exited 1 because the workflow assertion searched the DOM
adapter's attached views for a native child. After switching the assertion to
the guest text map and checking committed Neovim text, the repackaged
`node scripts/smoke-package.mjs --workflow-only` exited 0 for both transports
(mark-workflows.log). macOS ABC Option-E then E produced é in the packaged
input; mark-composition.log records the trusted event sequence. Candidate IME,
remaining manual layout checks and A1 performance review are still open.

# A3/A5 checkpoint — macOS arm64, 2026-11-19

Gates open. Used an unsigned instrumented 0.1.0 package, Electron 44.5.0,
Node 24 and a disposable profile. The installed app was untouched.
With the ABC input source, actual macOS Option-E then E replaced the selected
field contents with é. Command-A/C, Right and Command-V produced éé. The
composition checkpoint captured a trusted start but no end on the field; the
assertion failed (a3-composition-2.log). Candidate-based input, additional
manual layout/zoom, text cap, commands and the native-adapter queue remain open.
The input sources enabled during the review were ABC and Russian layouts.

The first attempt failed saving an empty system clipboard; the fixture now
handles a zero-type item. Synthetic copy after the preceding tab switch also
ran without OS focus. The fixture activates the app and focuses the embedded
document before sending the trusted click. These are harness changes.

Checks below use .local/review/ logs. Entry/handoff harness and diff check
passed. npm run check exited 0 (a5-check.log). Source smoke first failed copy
permission, then timed out on focus (a5-source.log, a5-source-final.log);
focused clipboard smoke and the final full npm run smoke:electron exited 0
(a5-copy-focused.log, a5-source-active.log). npm run smoke:package initially
timed out on that same click. After fixture activation the default packaged
smoke passed; the full matrix exited 1 waiting for native focus after rich
entry (native-popup-cases.mjs, a5-package-active.log). A focused native run
recovered interrupted focus delivery then lost focus with the view still
visible during refresh (a5-native-focus.log, exit 1).

Ran the remaining package workflows individually. The alpha everyday test
passed (a5-alpha-workflow.log, exit 0). Both browser workflow adapters timed
out at browser-workflow-cases.mjs waiting for guest focus after sending i
following pause, refresh and resume (a5-{browser,native}-workflow.log, exit 1).
Next: distinguish OS window activation from guest focus loss at that shared
transition; capture the native composition event sequence before accepting A3.
A1 performance disposition is still deferred.

# Session handoff — A4 local setup accepted on macOS arm64

The installed app loaded a disposable init.lua marker in normal mode and skipped
it with JUSI_NVIM_CLEAN=1. A loopback server set a persistent cookie on the first
launch, received it after a full restart and received none from a private buffer.
Both Neovim :qa! exits returned 0. The user also confirmed normal profile and
private browsing in the installed build.

A disposable copy of the installed app with JUSI_NVIM pointing to a nonexistent
file showed the native “Jusi Neovim could not start” alert with the failing path
and ENOENT. Observed via macOS accessibility, dismissed OK, verified exit 1
(expected). Logs under .local/review/: a4-final-test.log and a4-error.log.
Entry/handoff npm run harness and git diff --check passed. Documentation and
installed-app verification only; full build and desktop/package suites deferred
to A5. See [macOS quickstart](../MACOS-QUICKSTART.md). Next: combined A3/A5
input/layout review, including real OS IME, followed by final suites.

# Session handoff — 2026-11-19 (repeated macOS launch delay)

The installed app matches the rebuilt first-frame host. Three Launch Services
starts, each after a full quit and using the normal profile, took 5.43, 4.41
and 4.41 seconds. An instrumented copy spent 3.89–3.91 seconds reading shell
localStorage for editor zoom. The already-running development Electron held
the installed app’s Local Storage/leveldb/LOCK. Prior disposable-profile
measurements missed this contention.

The npm run electron launcher now passes a persistent checkout-local Chromium
data directory. The existing installed build and its data need no migration.
Quit the previously started development session normally to release its old
lock. Future dev launches keep separate browser logins and editor zoom.

Node 24, macOS arm64. Entry/handoff harness, npm run check, focused real
launcher/package regression and git diff --check exited 0. With the updated
development process running, three full launches of the installed executable
through Launch Services using the same disposable package profile took 1.03 s
initially, 4.39 s with its database lock deliberately held, and 0.47 s after
release. Verified the development process held its checkout-local lock. Logs:
.local/review/startup-profile-{boot,check,regression}.log. The user's running
development session was left open. Earlier first-use pre-main latency is
separate. No production package or guest behavior changed in this slice.
Full desktop/package matrix and manual review not run. Next A4 work remains
clean mode, startup-failure feedback, persistence and quickstart.

# Session handoff — 2026-11-19 (macOS first visible editor frame)

The host used to show its native window before it began loading the shell,
then waited for Neovim UI attachment and host IPC setup. It now preloads the
local shell/module graph during setup and reveals the window after rendering
initial state, installing input handlers and allowing a frame to paint. Startup
exceptions surface in a native error dialog. The packaged app in /Applications
was left in place. Replacement DMG/ZIP: `release/a4-startup-arm64-8jWGAv/`.

On this macOS arm64 machine, launch to renderer diagnostics for the installed
app took 1.749 s then 0.485 s; development took 0.442 s then 0.395 s. The
new production app took 3.664 s then 0.461 s. Runs used the user's normal
Neovim init, a temporary Electron data directory, an explicit Neovim binary,
and a minimal PATH and root cwd for the package. These are direct executable
launches; Finder timings and a consistent speedup are unverified. In the new
first run 3.44 s elapsed before Neovim's startup log began, and its own start
took 0.131 s. A separate instrumented ZIP extraction reached the first
main-module statement at 1.778 s and window show at 2.219 s. The source of
the pre-main delay is still unresolved.

Node 24, exit 0: npm run harness, npm run check, JUSI_TEST_REVIEW=startup npm
run smoke:electron, unsigned npm run dist:mac, hdiutil verify, unzip -tqq,
two production launches and clean exits, and git diff --check. The focused
JUSI_TEST_STARTUP_ONLY Electron case passed in source and an instrumented
macOS package. It asserted hidden on creation, theme/grids on show and Insert
mode on the first key. Logs: .local/review/startup-{before-times,after-times,
phase-probe,first-frame,package-first-frame,check,electron,dist,archive}.log.
Full instrumented package matrix, Linux and manual visual review deferred.
Next A4 work: clean-mode and startup-failure feedback, profile persistence and
the quickstart.

# Session handoff — 2026-11-19 (A4 local macOS package)

Built the working tree with Node 24 and npm run dist:mac for Apple Silicon,
using a fresh output directory and disabling signing identity discovery. Build
exit 0. The production DMG, ZIP and unpacked app are in
`release/a4-macos-arm64-ldoHfQ/`. Version 0.1.0, unsigned local alpha.

hdiutil verify and unzip -tqq exited 0. Launched directly from the read-only
DMG twice using a disposable Neovim init and Electron data directory. Both
launches reported the renderer ready and the configured Neovim command
available; both :qa! exits returned 0. Initial verification wrapper exited 1
at cleanup because StoreKit held the mounted binary open. The read-only test
image was subsequently ejected successfully. Logs: .local/review/a4-mac-{build,
artifacts,launch-1,launch-2}.log. Entry harness and handoff diff check passed.

Package build only. Clean-mode startup, missing-Neovim feedback, browser profile
data persistence and the alpha quickstart remain in A4. Broader desktop and
instrumented package suites were not rerun for this production build.

# Session handoff — 2026-11-19 (repeat popup approval)

Use `:JusiWebAllowPopup!` once in the initiating browser buffer to allow
repeated foreground opens, including scripted opens, while it has focus.
Reload or cross-document navigation clears approval. The existing plain
command allows one open within 15 seconds. ADR 0053 records why Electron's
synchronous handler cannot attribute the request to a particular physical click.

Root and retained-child openers share the grant and one-active-child policy.
The nested integration case also found Electron WebContents in a Neovim RPC
allocation payload. Native opener identity now supplies only buffer ID,
session ID and incarnation to document events, URL publication and allocation.

Node 24, macOS arm64. Logs under .local/review/.
- Entry/handoff npm run harness, npm run check and git diff --check exited 0
  (popup-daily-harness.log, popup-daily-handoff.log, popup-daily-check.log).
- Build and popup-policy unit passed. Initial nested fixture failed allocating
  a native grandchild (popup-daily-focused.log). Source and unsigned packaged
  focused runs then exited 0 (popup-daily-nested.log, popup-daily-package.log,
  popup-daily-package-focused.log). Both openers created two successive children
  per grant, retained the source Session and rejected a concurrent child.
  Reload revoked the native opener's grant.
- JUSI_TEST_REVIEW=popup-validation npm run smoke:electron exited 1
  (popup-daily-electron.log). The trace shows host and webview both unfocused
  at the copy-button mouse event; clipboard write returned NotAllowedError.
  Focused source JUSI_TEST_EDITING_ONLY=1 passed (popup-daily-copy-focused.log).
- Combined manual review attempted at queue 3/3. Packaged web buffer displayed
  the focused-page grant and review controls. CUA returned noWindowsAvailable
  on the first click. After loss of focus the review run denied the open
  (popup-daily-review-final.log, exit 1). The first review fixture had returned
  a non-cloneable JS function; corrected before this run. Interactive editing,
  copy and repeated opens on both adapters remain queued. Linux, real OAuth
  and the full package matrix were not run.
- Next: local alpha setup/restart (A4), outstanding combined input/layout and
  final acceptance (A3/A5), including the interrupted manual review.

# Session handoff — 2026-11-19 (site copy buttons)

GitHub’s Code menu copied the displayed HTTPS clone URL for neovim/neovim.
Scripted Electron input clicked the real control in the default adapter and
verified the exact URL pasted into a separate Neovim scratch buffer. Secure,
focused top-level pages with transient user activation can now request a
sanitized clipboard write. Permission is evaluated per request.

Node 24, macOS arm64. Logs in .local/review/:

- The fixture reproduced NotAllowedError before the change (copy-button-before.log).
  Both source adapters then passed the click/paste, read denial and expired
  activation cases (copy-button-{dom,native}-final.log, exit 0). An earlier native
  fixture startup timed out waiting for its child to become visible.
- The real GitHub result is in copy-button-github-control.log. A teardown IPC
  warning followed the successful paste assertion.
- npm run check exited 0 (copy-button-check.log). The full npm run smoke:electron
  with JUSI_TEST_REVIEW=copy-validation exited 1 after passing clipboard cases.
  The default Unicode mirror caret was absent at column 1 (copy-button-electron.log).
  The interaction-only retry stopped earlier waiting for the populated split in
  keyboardRedrawCases (copy-button-caret-focused.log, exit 1). The full desktop
  suite remains unresolved.
- Unsigned macOS package build and default adapter clipboard smoke passed.
  Native setup initially timed out waiting for the child control after host blur
  (copy-button-package.log, batch exit 1). The same packaged native clipboard
  workflow passed in isolation (copy-button-package-native-focused.log, exit 0).
  Linux and the full package matrix were not exercised. Manual review deferred,
  UI queue 2/3. Entry and handoff harness and git diff --check passed.
- Next daily-use milestone is reducing repeated popup approvals.

# Session handoff — 2026-11-18 (focused browser editing)

Both browser adapters route platform select-all, undo and redo to the receiving
WebContents through the shared editing dispatcher. The end-to-end case returns
to Neovim and back to rich focus, then uses real key events to select all,
paste replacement text, undo and redo in an input, textarea and contenteditable.
Copy, cut, Unicode multiline paste and paste-as-plain-text remain covered.

Primary agent, Node 24, macOS arm64. Logs under .local/review/.
- Entry harness, build and browser-command unit checks exited 0
  (editing-harness.log, editing-build.log). Unit cases cover missing,
  destroyed and throwing actions, platform modifiers and composition bypass.
- JUSI_TEST_EDITING_ONLY=1 source desktop tests exited 0 on both adapters
  (editing-dom.log, editing-native.log). npm run check and
  JUSI_TEST_REVIEW=editing npm run smoke:electron exited 0 (editing-check.log,
  editing-electron.log).
- Local unsigned package build and the same focused packaged desktop tests
  on both adapters exited 0 (editing-package.log). Nonfatal listener warnings
  and a source DOM Widget teardown message. Full browser package matrix and
  live Linux editing were outside this slice. Manual review deferred (editor
  interaction queue 1/3 since the last combined review).
- Next: site-initiated copy buttons, including GitHub's clone URL. Popup
  retry policy follows that milestone. No new page permission in this slice.

# Session handoff — 2026-11-18 (daily browser scope)

The user reports fullscreen works smoothly. Remove real-site fullscreen replay
from the active daily-use queue. The next browser cases are focused field
editing, GitHub-style copy buttons, and fewer repeat popup approvals. PLAN
records existing behavior, acceptance examples and a proposed gesture-based
popup rule. The popup design and clipboard permission work are pending.

Roadmap-only change. Inspected shared command dispatch, session permission
handling, popup permits, README and both-adapter clipboard fixtures. Entry and
handoff npm run harness and git diff --check passed. Build, desktop, package
and manual suites omitted. Next milestone: verify and complete focused editing
shortcuts across both adapters, starting with select-all and paste replacement.

# Session handoff — 2026-11-18 (keyboard redraw and wrapped commands)

Ctrl-D and Ctrl-U scroll five rows in the active right split. Desktop assertions
compare every painted row and the sibling split before and after each key, then
check the block cursor's glyph, pixel position and one/two-cell width on e plus
a combining acute accent and on 文. These workflows passed with the existing
grid renderer.

Long commands previously scrolled horizontally in one row. The command layer
now grows upward with its wrapped content. The caret and completion anchor use
the glyph's rendered rectangle and Neovim's byte position. A command taller
than the viewport scrolls with Home/End. Block output and completion fit above
the visible command. The regression executes a long Unicode echo and checks
that all rendered message rows fit and join to the original text.

Primary agent, Node 24, Neovim 0.11.4, macOS arm64. Logs under .local/review/.

- Entry harness, focused build/display smoke and final focused editor smoke
  exited 0 (keyboard-harness.log, keyboard-focused.log, keyboard-editor.log).
- npm run check and JUSI_TEST_REVIEW=keyboard npm run smoke:electron exited 0
  (keyboard-check.log, keyboard-electron.log). The broad run also passed the
  previously intermittent browser link fixture. Nonfatal WebContents listener
  and guest teardown warnings, plus expected worker failure fixtures.
- Local unpacked package build and JUSI_TEST_NVIM_ONLY=1 packaged editor
  acceptance exited 0 (keyboard-package.log). Inspected nvim-keyboard-command.png
  for upward wrapping and the visible tail caret.
- Combined packaged CUA at the existing nvim-conformance checkpoint: an echo
  yielded to Insert; a wrapped command survived Home/End and execution;
  Ctrl-D/Ctrl-U moved the scratch split from row 1 to 4 and back. A bordered
  float remained visible after resizing its split and disappeared on close.
  The packaged workflow resumed and exited 0 (keyboard-manual.log). This
  completes the editor UI review queue. Separate historical browser review
  items retain their own status.

The bounded editor workflows are verified on the existing macOS alpha baseline.
No other Neovim version or Linux target was exercised. Next compatibility work
requires a named additional alpha target. Browser release gates remain separate.

# Session handoff — 2026-11-18 (split-relative floats and completion)

The installed Neovim 0.11.4 sends eight-field win_float_pos. A real right-hand
split at column 40 reported a bordered 10-by-5 grid with its southeast corner
at (6,10) relative to that split. The old router used (6,10) as the absolute
top left. The translator now resolves the allocated grid's corner and its
anchor chain. Absolute-coordinate events retain their explicit placement.
Nested anchor movement, hide/show, invalidation and grid-number reuse have
unit coverage. Insert completion reads the visible grid bounds. External
command/message/menu layers paint above editor and provider layers.

The narrowed editor pass is in NEOVIM-CONFORMANCE-PLAN.md. Split-divider
dragging is the default desktop mouse regression. Existing extended cases
remain available with JUSI_TEST_EXTENDED_MOUSE=1.

Primary agent, macOS arm64, Node 24. Logs in .local/review/.

- Entry harness, npm run check (including build and live smoke), compositor and
  translator cases exited 0 (float-harness.log, float-check.log).
- JUSI_TEST_DISPLAY_ONLY=1 desktop and local unpacked test package build and
  display smoke exited 0 (float-completion-keyword.log, float-package.log).
  The test uses a bordered southeast float, resizes its right split to 32
  columns, exercises keyword completion above that float and checks teardown.
  Screenshot inspection confirmed the visible selected item and float border
  (nvim-float-completion.png). Extended tuples are fixture-tested only.
- JUSI_TEST_REVIEW=placement JUSI_TEST_NVIM_ONLY=1 desktop exited 0
  (float-ack.log). All editor assertions also passed in the broader run.
  JUSI_TEST_REVIEW=placement npm run smoke:electron exited 1 later in the
  existing browser link-cursor fixture. Its ready mirror had the cursor at
  {3,8} on the Unicode line instead of the link (float-acceptance.log).
  This failure previously occurred in the ownership slice. Attribution open.
- Initial build rejected an optional tuple spread (float-focused.log).
  An expression-register fixture stayed in Insert with no completion event
  (float-completion-diagnostic.log); switched to real keyword completion.
- Earlier full runs missed the split-width assertion (float-electron.log,
  float-electron-final.log). Pointer traces included a lost capture or a move
  at unrelated coordinates. The instrumented editor run passed (float-drag.log).
  A batched drag timed out (float-drag-final.log), and another had all pointer
  events delivered but failed the width check (float-suite-ready.log).
  nvim_input_mouse queues events and can lose intermediate positions. The
  retained regression waits for Neovim to observe the divider press before
  dragging and observes the width change before release. The initial editor
  fixture now waits for a rendered grid following a startup echo timeout
  (float-drag-isolated.log).
- Linux, other Neovim versions and full browser package lanes were outside
  this milestone. Manual review deferred; existing broader queue remains due.

Next: keyboard-driven split scrolling and redraw, cursor alignment and long
command/message wrapping on the same baseline.

# Session handoff — 2026-11-18 (Neovim message lifecycle)

A delayed Fugitive push uses echon before Neovim requests acknowledgement.
Multiline output previously opened a local hit-enter pager on its own. Ordinary
keys could dismiss that pager or reach Neovim while the command was waiting.
ADR 0032 now follows the Neovim prompt and clear events. Ordinary keys reach
the editor. Separate entries occupy separate block rows. A new nonempty
showmode/showcmd retires ordinary live output and preserves active prompts and
history. The startup demo respects the user's showmode setting.

Primary agent, Node 24, macOS arm64, Neovim 0.11.4. Logs under .local/review/.

- Entry harness and final npm run check exited 0 (messages-harness.log,
  messages-final-check.log). The raw embedded trace in messages-probe.log
  shows showmode after an echo without msg_clear, and busy_stop followed by
  return_prompt after delayed shell output.
- Installed Fugitive in Electron, temporary working and bare repositories,
  blocked pre-receive hook and 120 progress lines: exit 0
  (messages-git-desktop.log). Left during the stall preserved output, Enter
  after completion dismissed it, and Git pull showed its own up-to-date
  result. This exercised local Git transport.
- Focused source editor workflow exited 0 (messages-final-focused.log).
  JUSI_TEST_REVIEW=messages npm run smoke:electron with the extended watchdog
  exited 0 (messages-suite.log). Nonfatal WebContents listener warnings.
  Unpacked test package build and JUSI_TEST_NVIM_ONLY=1 packaged Electron
  smoke exited 0 (messages-package.log). Browser package lanes omitted.
- Initial desktop fixture timed out waiting for Insert after synthetic I
  (messages-electron.log). Using nvim_input for the mode transition passed.
  A shell fixture that injected Left during the stall passed the retained
  output assertion but timed out waiting for a persistent return prompt
  (messages-final-electron.log). Forwarded input can acknowledge the prompt.
  The shell scroll fixture now leaves that input to the local Fugitive case.
  Initial standalone Fugitive driver timed out before window creation while
  Electron startup awaited module evaluation (messages-git.log).
- Inspected nvim-message-tail.png for separate rows and the visible tail.
  Manual interaction review deferred. Existing broader manual queue remains due.

Next: resume the remaining editor display and platform conformance cases.
Network Git latency, personal configuration and other Neovim versions remain
outside this verification. Requirement statuses stay unchanged.

# Session handoff — 2026-11-18 (browser ownership and test scope)

A fullscreen grant carries the source and prior host state until HTML entry.
Only the entered presentation can restore the host. BrowserDocumentEvents owns
shared document input and fullscreen registration for both adapters. The popup
coordinator installs the opener separately and retains native child lifetime
and placement. Foreground link opens carry the initiating window/tab to Lua,
which checks them with the buffer/incarnation before creating a tab. Modified
click and text commands transfer focus only after a successful open. Context
menus capture the target when opened.

Removed the obsolete 64-reference forward/backward caret traversal (128 stops
per adapter). Retained one clipped accessibility label and actual pause/resume,
navigation and link-tab coverage. Headless Neovim covers repeated statusline
buffer revisits. Desktop retains one split/tab lifecycle case. Focused DOM
browser workflows now bypass the unrelated editor integration prefix, which
still runs in default smoke.

Primary agent, macOS arm64, Node 24. Logs under .local/review/ownership-*.
- Entry harness, build/fullscreen unit/provider Lua and npm run check exited 0
  (entry.log, focused.log, check.log). New tests cover teardown between grant
  and entry, unchanged host state, and the same source buffer in another
  Neovim split/tab.
- Local unpacked package builds exited 0 (package-build.log, package-rebuild.log).
  Packaged fullscreen workflows passed on both adapters (fullscreen-dom.log,
  fullscreen-native.log). Modified-click foreground tabs passed on both
  (modifiers-dom.log, native-clicks-untraced.log). The traced native modifier
  run failed waiting for focus with a marker message present and host blur.
- npm run smoke:electron exited 1. The mouse case missed line 2/column 4, then
  missed tab 1 on retry. Both traces show outside pointer events interleaved
  with scripted input (electron.log, electron-retry.log). With tracing off and
  the extended watchdog the mouse case passed, but the shared interaction
  fixture's cursor settled on the Unicode line instead of the link
  (electron-extended.log, exit 1).
- Default packaged smoke passed the native menu to Neovim round trip and shared
  browser interaction checks before the overall watchdog expired waiting for
  worker-off disabled status (package.log, exit 1). Extended package run exited
  1 on Unicode cursor geometry (package-extended.log).
- Aggregate browser workflows also remain unverified. Before removing the editor
  prefix, the DOM lane timed out waiting for visible pause feedback despite
  a recorded pause command (workflow-dom.log). The isolated lane passed pause
  checks, then timed out on guest focus in source, or opening a modified link
  with a focus reset during the click in packaging (dom-isolated.log,
  isolated-dom.log). Native aggregate passed pause checks and navigated, then
  timed out waiting for ready after Ctrl-J (native-untraced.log). Exit 1 each.
  Keep these assertions; their failures have not been attributed to one cause.

Next: isolate the remaining cursor/readiness failures on an idle desktop.
No manual/real-site replay or Linux run. Existing manual queue remains due.
Requirements retain their current status. No commit or publication.

# Session handoff — 2026-11-05 (ordinary fullscreen exits with sibling views)

User reports every normal video exit also windows Neovim. Latest normal-session
trace `.local/review/browser-traces/2026-11-03T05-40-42-709Z-65887-47c5e133`
shows seq 632–634 document leave/restoration with wasFullscreen=true and
hostFullscreen=true, then seq 637–638 OS fullscreen exit, with no host-toggle.
Keeping a second DOM webview alive reproduces the failure in the desktop fixture.
Electron 44.5 propagates HTML fullscreen exit to sibling webviews; an uninvolved
sibling's native-fullscreen snapshot is false and can window their shared host.
The earlier shortcut-only explanation was incomplete and did not establish the
physical key chord used by the user.

Host, attached DOM guests and native children now disable automatic HTML fullscreen
window resizing. The shared authorized coordinator explicitly enters OS fullscreen
and retains its prior-state exit policy. No delayed forced re-entry, key workaround,
or Neovim layout mutation is introduced. Use normal YouTube F, Escape, double-click
or the button. Restart is required. ADR 0044 describes the Electron constraint.

Verification: primary agent, Node 24, macOS arm64 / Electron 44.5.0. Logs under
`.local/review/`:
- Entry harness exit 0: fullscreen-all-harness.log; inventory fullscreen-all-entry.log.
- Initial fixture failed at tabclose selecting the newly added sibling instead of
  the original tab (fullscreen-all-before.log, exit 1); explicit saved-tab restore
  corrected the test. Corrected fixture against old production failed as expected:
  "document exit changed pre-existing host fullscreen", actual false vs true,
  fullscreen-all-before-targeted.log (exit 1).
- Build + fullscreen unit exit 0: fullscreen-all-focused.log. An attempted
  getLastWebPreferences assertion returned undefined for the new preference; removed
  that invalid observation and used actual OS events/state as acceptance evidence.
- Both source adapter fullscreen workflows exit 0: fullscreen-all-dom.log and
  fullscreen-all-native.log. Four ordinary exit methods with a sibling view assert
  preserved fullscreen and zero OS leave events, plus existing windowed restoration,
  shortcuts, controls, navigation, tab ownership, text-mode and close cleanup.
- npm run check exit 0: fullscreen-all-check.log.
- npm run smoke:electron exit 0: fullscreen-all-electron.log.
- Fresh packaged build using installed Electron distribution exit 0:
  fullscreen-all-package-build.log. Both packaged fullscreen workflows and default
  packaged sandbox/adoption smoke exit 0: fullscreen-all-package-dom.log,
  fullscreen-all-package-native.log, fullscreen-all-package-default.log.

Final harness, git diff --check and targeted whitespace review: exit 0
(fullscreen-all-docs.log).

Existing nonfatal guestInstanceId warnings remain. Full package matrix, Linux and
model-driven CUA not run; real YouTube replay after restart remains pending. Prior
manual-review queue remains due. Requirements stay partial; no security-parity or
real-site acceptance claim. Unrelated dirty edits preserved, no commit/publication.
Next: user normal-session YouTube replay; mark a trace if another failure occurs.

# Session handoff — 2026-11-02 (fullscreen shortcut priority)

User capture `.local/review/browser-traces/2026-11-01T23-27-10-387Z-41789-34c4c06f`
identifies the marked failure. The recorded main/input/fullscreen build hashes
matched the compiled checkout at entry. Sequence 275 captured wasFullscreen=true;
277 entered document fullscreen. Meta and Control went down at 283/284, then 285
called fullscreen.host-toggle at 23:46:06.700 UTC (02:46:06 local). The host was
already windowed by document-leave 290; marker 304 recorded that state. This recorded the host-toggle dispatch bypassing document exit, not a stale
permission snapshot. It did not establish the physical key chord: the user later
clarified ordinary YouTube F/double-click. The shortcut fix below was insufficient
for ordinary exits; see the November 5 handoff. The later 23:55 exit had correctly captured wasFullscreen=false after
that first host exit and is not independent evidence of a restoration defect.

F11 and Ctrl-Command-F now first ask the per-host shared fullscreen coordinator
to exit active document fullscreen. Pending exit owns subsequent presses during
that transition; auto-repeat never performs another toggle. Once settled, a
later explicit press toggles the host normally. Shell, DOM guest and native child
use the same dispatch. Existing exact owner/permission and restoration behavior
is retained. ADR 0044 documents the decision; a distinct trace event records
window-shortcut-document-exit. Restart is required to load the change.

Verification (primary agent, Node 24/macOS arm64; logs under .local/review/):
- Entry npm run harness: exit 0, fullscreen-incident-harness.log. Dirty-tree
  inventory fullscreen-incident-entry.log; unrelated edits preserved.
- Added unit regression on old compiled code: exit 1,
  fullscreen-shortcut-before.log, exact assertion "window shortcut must not exit
  pre-existing host fullscreen" (actual false, expected true).
- Build + focused unit: exit 0, fullscreen-shortcut-focused.log. Unit coverage
  includes pending exit, auto-repeat after exit, and later explicit host toggle.
- Both source fullscreen workflows: exit 0, fullscreen-shortcut-dom.log and
  fullscreen-shortcut-native.log. Existing controls/Escape/tab/navigation/close
  cases plus real F11/Ctrl-Command-F preserving pre-existing host fullscreen.
- npm run check: exit 0, fullscreen-shortcut-check.log (build/unit/runtime/live).
- npm run smoke:electron: exit 0, fullscreen-shortcut-electron.log.
- Fresh package build using installed Electron distribution: exit 0,
  fullscreen-shortcut-package-build.log. Both affected packaged workflows: exit 0,
  fullscreen-shortcut-package-dom.log and fullscreen-shortcut-package-native.log.
  Full package matrix not repeated for this scoped shortcut change.
- Final harness, git diff --check and targeted whitespace scan: exit 0,
  fullscreen-shortcut-docs.log. Requirements evidence updated without promotion.

Existing nonfatal guestInstanceId/listener warnings remain. No model-driven CUA
replay, Linux acceptance, user config changes, commits or publication. Prior
manual-review queue remains due. Meaningful automated coverage now includes the
captured shortcut path, but user real-site replay after restart is still pending.
If another exit method reproduces it, retain/mark that trace separately.

# Session handoff — 2026-11-02 (provider source snapshots)

Added MIME discovery, immutable document identity lookup, optional asynchronous
open readiness and negotiated source.snapshot to the generic Lua provider API
(ADR 0052). Installed PDF/DjVu workers export captured page text/PNG into
host-issued private staging. Tickets, file names/types/sizes, ownership,
cancellation, timeout and late replies are checked. Document scripts gain no
IPC or filesystem access. No Electron/TypeScript API or renderer change was
needed for this feature. Jusi core owns remote artifact transfer, selection
correlation and client-owned overlays; jusi-read has no Lua companion.

Verification in the primary agent, Node 24/macOS arm64:
- npm run harness and git diff --check: exit 0 at entry/final review;
  .local/review/source-snapshots-final.log. Requirements remain partial.
- npm run check: exit 0; .local/review/source-snapshots-check.log. Includes
  worker snapshot lifecycle tests, provider/native-package checks and live tests.
- npm run smoke:electron: exit 1; .local/review/source-snapshots-electron.log.
  The failed assertion is scripts/nvim-display-cases.mjs:47: after setting
  guicursor=a:ver20 it waits for a visible vertical cursor narrower than five
  pixels. Cursor/Electron code was not changed by this feature; no cause or fix
  is established and the broad smoke is not claimed passing. No blind rerun.
- Sibling PDF: npm test (18 tests), test:host and test:electron exit 0.
  Logs /tmp/jusi-pdf-tests.log, /tmp/jusi-pdf-host.log, /tmp/jusi-pdf-electron.log.
- Sibling DjVu: npm test (36 tests), test:host and test:electron exit 0.
  Logs /tmp/jusi-djvu-tests.log, /tmp/jusi-djvu-host.log, /tmp/jusi-djvu-electron.log.
- Sibling Markdown: npm test (10 tests) and test:host exit 0.
  Logs /tmp/jusi-markdown-tests.log and /tmp/jusi-markdown-host.log.
- Core: 334 Python tests passed, one opt-in skip; frontend/e2e suites passed.
  jusi-read: all 18 tests passed, including headless HTTP/PTY integration;
  reader transfer, captured-page identity, overlays, followups, questions,
  interruption, rejected steering recovery and resume are covered. The Codex
  app-server is a test stub. Both Python wheels/sdists build; built-wheel imports,
  catalog validation and idempotent harness bootstrap pass.
- Fresh unpacked macOS package build with installed Electron: exit 0;
  .local/review/source-snapshots-package-build.log. Default packaged Electron
  smoke: exit 0; .local/review/source-snapshots-package.log. The source cursor
  failure did not recur in this package lane, but its cause remains unproven.
  The full package matrix was not repeated.
- No new model-driven manual review, Linux deployment, two-machine transfer or
  authenticated assistant session. The existing manual-review queue remains due;
  no new renderer interaction was introduced here. Existing
  PDF Electron teardown listener/guest warnings were nonfatal, not fixed.

Next: investigate the isolated broad cursor smoke failure at its own scope and
complete the prior manual-review queue. Use coordinated sibling checkouts for
assisted reading; core 1.0.7 is prepared but unpublished. No commits/publishing.
Unrelated working-tree edits preserved.

# Session handoff — 2026-11-01 (native browser placement stability)

Fixed the reported editor Play/game flicker (ADR 0051). Before the change, the
real site issued 42 native hide requests during a four-second observation with
zero navigation events. Text status/publication invalidated native placement on
every state update. After the change the same site reported zero hide requests
and Ctrl-Q closed the retained child. The earlier focus-mode-write hypothesis
was not established; no mode-routing workaround was added.

Native placement now survives text/cursor/selection paint and unchanged valid
viewport reports. Explicit Neovim composition, exact ownership, overlay state,
geometry and lifecycle changes still invalidate; stale reports remain rejected.
The popup permit and default horizontal split are unchanged. Recovery keys:
Ctrl-Q closes the focused rich browser; Ctrl-backslash then Ctrl-N returns to
Neovim, where :bd! removes the browser buffer. Restart the app to load this fix.

Verification in the primary agent, Node 24/macOS arm64. Logs below are under
.local/review/. Unrelated edits preserved (play-popup-entry-status.log).
- Entry npm run harness: exit 0, play-popup-harness.log.
- npm run build: exit 0, play-popup-build.log and play-popup-focused-build.log.
- Real-site focused test before: exit 1, play-popup-before.log, assertion
  "Idle rich popup repeatedly hides"; navigation count 0, hide count 42.
  Trace: play-popup-traces/. Ctrl-Q worked even in this failing run.
- Real-site focused test after: exit 0, play-popup-after.log; navigation 0,
  hide requests 0. play-popup-events.json records that observation. Existing
  teardown EPIPE/listener warnings were nonfatal; not claimed fixed.
- node src/test/native-viewport.test.mjs: exit 0, play-popup-unit.log;
  unchanged paint/report preservation and structural/identity/overlay invalidation.
- JUSI_TEST_NATIVE_POPUPS=1 JUSI_TEST_POPUP_STABILITY=1 desktop lane:
  completed successfully, play-popup-stability.log. Continuous text mutation
  preserves visibility/focus, then editor escape, re-entry and Ctrl-Q work.
  The tool session handle expired across user continuation; no exit code recovered.
- npm run check: exit 0, play-popup-check.log (build/unit/runtime/live included).
- npm run smoke:electron: exit 0, play-popup-electron.log (default DOM source).
- Native focus-only and full native integration: exit 0,
  play-popup-focus.log and play-popup-native.log. Includes delayed acknowledgement,
  interrupted focus delivery, five refreshes, shared interaction and close.
- Packaged build using installed Electron distribution: exit 0,
  play-popup-package-build.log. Packaged stability and focus lanes: exit 0,
  play-popup-package-stability.log and play-popup-package-focus.log.
  Full package matrix not repeated; no Linux verification.
- Targeted CUA attempted: selected the existing user app, not the disposable
  test instance; no user-session input sent. The remote review run failed before
  child creation waiting for the editor URL (play-popup-manual.log, exit 1).
  A later curl fetched HTTP 200 but does not establish UI readiness. No blind
  replay; manual real-site acceptance and the prior combined review remain due.
- Final harness, whitespace and diff review recorded in play-popup-final.log.

Reusable opt-in real-site lane: JUSI_TEST_NATIVE_POPUPS=1 plus
JUSI_TEST_POPUP_SITE=<editor URL> node scripts/run-smoke-electron.mjs. It expects
this site's Play/autostart contract; optional JUSI_TEST_REVIEW=popup-stability
leaves the child open for up to two minutes for manual review. It uses a disposable
profile and never changes the user's profile. No new browser privileges.

Next: user restart/replay of Play; targeted real-site manual review when navigation
is reliable, plus prior Ctrl-O/fullscreen review queue. Requirements remain partial;
this scoped fix does not establish browser security parity. No commits/publishing.

# Session handoff — 2026-10-31 (Ctrl-O stale modifier routing)

User confirmed releasing Ctrl after Ctrl-O before the trace-15582 incident, and
that non-link video/replies controls stop responding before the next link opens
in a new tab. The trace's retained Control explains both symptoms. We do not yet
know why the native release was absent; routing no longer depends on it.

ADR 0050 implements current trusted Chromium press/release modifiers in a shared
isolated-world collector. Main requires native press/release, matching coordinates,
button/time, a one-use result and current session/incarnation/epoch before the
existing Lua tab action. Ordinary links/non-link controls are not suppressed.
Control/Meta/Shift/middle links remain supported, including macOS Control-left
contextmenu behavior and long-held deliberate clicks. Downloads/other protocols
remain with Chromium. Page scripts cannot access the collector or forge trusted
events; there is no guest Node, shell or Neovim bridge. URL size/queue/waits are
bounded, blur cancels pending collection, and logging includes actual mouse flags
and the collector hash. Historical key state is diagnostic only for link routing.

Verification, primary agent, Node 24/macOS arm64 (all logs .local/review/):
- npm run check: exit 0, ctrl-o-verified-check.log (build/unit/live/runtime).
- npm run smoke:electron: exit 0, ctrl-o-final-electron.log.
- Focused shared modifier workflow, both source adapters: exit 0,
  ctrl-o-final-dom.log and ctrl-o-final-native.log. Exercises real Ctrl-O history,
  then explicitly retains the observed missing-release state independent of
  synthetic OS key behavior; verifies ordinary controls/current-window links and
  four intentional modified/middle tab opens plus page-world isolation.
- Package build (installed Electron distribution, same unpacked smoke config):
  exit 0, ctrl-o-final-package-build.log. Both focused packaged adapters: exit 0,
  ctrl-o-final-package-dom.log and ctrl-o-final-package-native.log.
- Packaged default smoke: exit 0, ctrl-o-package-default.log, before the final
  bounded-URL/long-held-click adjustment. Final source default and both packaged
  affected workflows passed after that adjustment; default package not repeated.
- Shared focus/fullscreen-boundary and pending-action cancellation lanes: exit 0,
  ctrl-o-blur-dom.log and ctrl-o-blur-native.log. These verify existing host
  shortcuts/reset policy, not the unresolved real YouTube fullscreen report.
- Unit collector tests cover forged events, unsupported/download/non-link targets,
  arrival ordering, one-use/time/coordinate guards, long presses and blur cleanup.
- Final harness/diff/targeted whitespace checks: exit 0 (ctrl-o-final-docs.log).

Diagnosed intermediate failures, retained rather than counted as passes:
- ctrl-o-before.log: unrelated editor mouse assertion before the new lane; added
  the lane to the existing focused-dispatch exclusion, without copying a harness.
- ctrl-o-before-focused.log: injected history lacked a user gesture, so Chromium
  skipped it. Corrected fixture gesture. ctrl-o-before-gesture.log then reached
  an invalid Control/non-link click expectation on macOS (native contextmenu).
  This is not a failing-before regression for the reported bug; the physical user
  trace and confirmation establish it, and the final test injects retained state.
- ctrl-o-dom.log / ctrl-o-dom-current.log: macOS Control-left yields contextmenu,
  not ordinary click. Isolated handling now uses the actual press/release and
  suppresses only an intercepted link's follow-on events. The non-link assertion
  uses Shift, preserving native Control-menu behavior.
- ctrl-o-native.log / ctrl-o-native-focus.log: focus lost between cases. Focus
  setup now waits for native visibility and explicitly focuses the test guest;
  native runs pass. No production focus workaround introduced.
- ctrl-o-final-check.log: new fake-clock test mixed wall time with simulated time;
  corrected the fixture clock. Final verified check passes.

Manual real-site replay remains pending; user must restart to load the change.
No CUA review claimed; prior combined review remains due. No Linux acceptance,
security-parity claim, commits, publishing or user configuration changes. Existing
nonfatal teardown/listener warnings remain. Fullscreen exit issue is still open:
the supplied run did not contain video fullscreen entry/exit. Next: user replay
of Ctrl-O/clicks with tracing, and a marked fullscreen failure if it recurs.
Requirements remain partial. Unrelated changes preserved (ctrl-o-entry-status.log).

# Incident analysis — 2026-10-31 (user trace 15582)

Inspected `.local/review/browser-traces/2026-10-31T12-04-30-778Z-15582-009f5d97/`:
264 records, no trace.dropped. All four recorded build hashes match current
compiled main/input/fullscreen and Lua browser runtime. No production change.

Confirmed new-tab path (UTC; local time UTC+3):
- Sequence 62, 12:06:00.554: guest 2 records Control keyDown, held=[Control].
- Sequences 64–67: same-document navigation; no keyUp or input reset intervenes.
- Sequences 69–85: three left clicks take modified-link lookup, find no link,
  and have their releases suppressed. This can also explain apparently dead clicks.
- Sequences 89–94, 12:06:08.082–.102: another left click uses retained Control,
  dispatches modified-mouse open_link_tab, returns buffer 8, and creates tab 3.
  No mouse modifier snapshot is present. This was host routing, not window.open.
- Sequence 125, 12:06:15.810: user marker in buffer 8/tab 3.

The trace proves the dispatch mechanism, not physical modifier state. Asked user
whether Ctrl was released and which preceding shortcut was used. No keyUp events
are recorded anywhere in this capture; several later Meta presses are followed
by focus resets. Do not infer that a timeout or navigation reset is a sufficient
fix: legitimate held modifiers must still work, and in-page navigation may retain
focus. Next: reproduce the confirmed preceding action and establish a current
modifier source or the lost-release boundary across both adapters.

Host enters fullscreen at 12:04:34 and remains fullscreen at the marker. No HTML
fullscreen enter/leave/request or host leave is captured, so this run supplies no
fullscreen-failure evidence. That issue remains open.

Verification: npm run harness exit 0 (.local/review/incident-harness.log), build
hash comparison and trace analysis complete; git diff --check exit 0. Docs-only
analysis: no build, desktop, package or CUA replay; no requirements promoted.
Entry dirty-tree inventory: .local/review/incident-entry-status.log.

# Session handoff — 2026-10-31 (pause feedback and browser incident traces)

User reports recurring host-fullscreen exit and intermittent YouTube links opening
new tabs after the prior fixes, plus delayed/no Ctrl-P status feedback. The real
fullscreen/link issues remain open. Attempts to inspect the existing instance
were blocked by Computer Use's persistent "application session explicitly stopped"
response, including after a client restart. User then authorized work without CUA.
No live session was restarted or reconfigured by this implementation.

Pause/resume now redraws Neovim's statusline as soon as its buffer flag changes.
Text paused overrides readiness, including late ready notifications/manual refresh;
Text off remains explicit and resume exposes Text ready/Text auto. Shared rich/text
Ctrl-P remains browser-only; no provider mappings were changed.

Added ADR 0049's opt-in JUSI_BROWSER_TRACE: three 2 MiB rotating JSONL files per
run, bounded queue, async writes, overflow/write-failure reporting, build hashes,
explicit layout and document identities, modifier/mouse routing, all existing
link-tab dispatch paths, popup disposition, and fullscreen permission/restoration
state. No raw URLs, ordinary key text/code, page text, screenshots, credentials,
new guest IPC or debugging port. URL hashes correlate within one run only.
JusiWebDebugMark flushes a marker and reports the directory. Launch and retention
instructions are in docs/browser/DEBUGGING.md. A marker can rotate out; copy the
run directory promptly. Prior run directories are not automatically deleted.

Verification (primary agent; Node 24; macOS arm64):
- Entry npm run harness: exit 0. Unrelated dirty/untracked work preserved; entry
  inventory: .local/review/diagnostics-entry-status.log.
- Focused build, trace unit tests, headless browser-status and fullscreen unit:
  exit 0, diagnostics-focused.log. Covers queue overflow, file rotation/mode,
  URL hash isolation, disabled tracing, write failure, immediate redraw and late
  readiness while paused. The intentional write-failure fixture prints a warning.
- Both-adapter source workflows with tracing: exit 0,
  diagnostics-workflow-dom-verified.log and diagnostics-workflow-native.log.
  Actual Ctrl-P in text/rich modes verifies rendered pause status before page
  mutation; commands, marker persistence, link dispatch, layout and raw-URL
  exclusion pass. Trace artifacts: .local/review/diagnostics-traces/.
- Inspected browser-paused-dom.png and browser-paused-native.png: statuslines
  show Text paused with existing layout and source/child status separation.
- npm run check: exit 0, diagnostics-check.log (includes build/live/runtime).
- npm run smoke:electron: exit 0, diagnostics-electron.log, tracing disabled.
- Initial desktop status assertions failed because the new test searched the
  document grid rather than the primary status grid, then matched ASCII spaces
  against highlighted nonbreaking-space rendering. Exact assertions/renderer
  code were inspected; fixed only the test selector/normalization. Logs:
  diagnostics-workflow-dom.log and diagnostics-workflow-dom-final.log, exit 1.
  No production redraw workaround or blind rerun was introduced.
- Final production npm run check: exit 0, diagnostics-final-check.log. Tightened
  trace identity fields after detecting an internal token/document object in an
  early test trace; only explicit buffer/session/incarnation fields now serialize.
  Earlier trace artifacts are not clean privacy evidence.
- Package build with installed Electron distribution: exit 0. Initial package
  default, native, native focus, alpha and DOM workflow lanes passed; native full
  workflow failed at readiness (diagnostics-package.log). Rebuild/check with the
  explicit trace fields passed, but readiness repeated (diagnostics-package-final.log).
  Source inspection and state dumps identified the long marker message overlay
  parking native views. The test now acknowledges that message with shell Escape;
  docs explain the same interaction. Production message behavior is unchanged.
- Final package build: exit 0, diagnostics-package-ack-build.log. Native workflow
  now passes readiness but fails reference caret 57 (expected y=323.875 versus
  actual y=304), diagnostics-package-native-ack.log, exit 1. Host blur also occurs
  in the trace; causality is not established. No blind retry or caret workaround.
- Packaged DOM fullscreen workflow: exit 0, diagnostics-package-fullscreen-dom.log.
  Packaged native fullscreen lane: exit 1 before fullscreen, waiting for initial
  source webview at native-popup-cases.mjs:24; diagnostics-package-fullscreen-native.log.
  Trace has layout but no document attach. This startup failure is unresolved;
  native packaged fullscreen acceptance is not passed.
- Final packaged trace audit: exit 0, diagnostics-trace-audit.log. Actual DOM
  fullscreen lifecycle and markers recorded; no raw URLs, tokens or document
  objects in diagnostics-package-ack-traces/. Native full-workflow end assertions
  were not reached. Package acceptance is incomplete.
- Final npm run harness and git diff --check: exit 0, diagnostics-final-harness.log
  and diagnostics-final-diff.log. Targeted new/modified-file whitespace scan: exit 0.

All named logs/artifacts above are under .local/review unless stated otherwise.
Existing guestInstanceId teardown, platform task-policy and listener-count
warnings remain nonfatal; tracing adds one lifecycle observer per guest.

Manual CUA is not passed. Combined review was already due after the preceding
milestone (historical queue 2/3 plus the Ctrl-P milestone); that queue remains due,
with this status feedback added. Saved-artifact inspection and automated desktop
checks do not replace real-site/fullscreen/manual acceptance. No Linux acceptance,
commits, remote publication, user configuration changes or delegated agents.
Next: user launches a normal debug run, reproduces either issue and marks it;
inspect the captured native input/owner/restoration timeline before another fix.
Requirements statuses are not promoted.

Prior-turn reconciliation: the 2026-10-30 Ctrl-P/fullscreen work completed source
check/Electron verification and six package lanes before its final provider guard.
A native fullscreen final-entry timeout was not explained by a later passing
instrumented replay. The old fullscreen capture algorithm fails the added unit
regression (.local/review/browser-fixes-before.log), but that scoped fix did not
resolve the recurring real-site report. Those facts supersede any implication
that the original reports were fully fixed. The interrupted handoff is now recorded.

# Session handoff — 2026-10-30 (reported Fugitive message replay investigation)

User reports large Fugitive push output recurring with later messages and lost
line breaks. This remains open; ADR 0032's earlier scoped regression is not proof
that this reported workflow is fixed. No production code changed this session.

The installed Fugitive streams through echon (RunEcho/RunWait), unlike the existing
desktop regression's :! shell output. An isolated temporary repository push to a
local bare repository, with 120 remote hook output lines, produced explicit
newlines and msg_clear after the real return prompt on Neovim 0.11.4. Two later
echo messages contained only their new text. This probe automatically acknowledged
the real prompt and checked protocol output, not the full Fugitive renderer flow.
No network push or changes to the working repository/user configuration occurred.
The current app was launched after its compiled JS was built; stale build timing
alone does not explain the report. A read-only CUA observation found no active
large message; it is not manual acceptance of the reported workflow.

Verification (primary agent, Node 24, macOS arm64):
- npm run harness: exit 0, .local/review/messages-harness.log.
- node .local/review/fugitive-message-probe.mjs: exit 0,
  .local/review/fugitive-message-probe.log. Fixture uses the locally installed
  Fugitive and temporary Git repositories; not a portable acceptance test.
- JUSI_TEST_NVIM_ONLY=1 node scripts/run-smoke-electron.mjs: exit 0,
  .local/review/messages-desktop.log. Existing streaming/dismissal/repeat-output,
  pointer, external UI and display assertions pass with current compiled code.
- Initial exploratory echon RPC probe blocked on a real return prompt and was
  terminated; the subsequent probe explicitly acknowledged prompts. Not a host
  failure or a passing check.
- No implementation change: build/full check/default Electron/package suites not
  run. Manual workflow acceptance deferred; UI review queue unchanged.

Next: obtain affected :version and whether/how the original output was dismissed,
then capture the actual failing event/display sequence. Inspect append across a
local dismissal if the affected version sends the newer append field; 0.11.4
does not emit it. Do not infer the report's cause from that unconfirmed path.
Requirements statuses/evidence remain unchanged.

# Session handoff — 2026-10-28 (DjVu reading chrome and small-print geometry)

The external reader now hides its navigation header, geometry status and caption
in text mode, and restores controls in rich mode. The host's existing web mode
projection sets data-jusi-mode on the document root; it is presentation state,
not an authority or a new guest API. Worker buffers reuse the window status-line
attachment for text pending/building/ready/failed/off. Publication marks ready;
invalidation clears it and stale publication cannot restore it. Normal worker
status overlays are hidden; error/limit retry controls and debug UI remain.
Browser status labels and custom/local/global status-line restoration are retained.

Provider OCR now preserves native scan detail, bounded at 4200 x 6000 without
upscaling small scans. The former 2400 x 3300 raster corrupted page 5 small print
in road_to_reality_rus.djvu. All three words in “Силы, движущие миром” now have
high-confidence exact word boxes, with unchanged embedded text and byte anchors.
No fuzzy text replacement or invented geometry was introduced. Unmatched coarse
regions still suppress highlighting. Larger OCR rasters can increase extraction
cost; results remain cached per page and existing process/time limits remain.

Verification (primary agent, Node 24, macOS arm64):
- npm run harness: exit 0, .local/review/reader-harness.log.
- npm run check: exit 0, reader-check.log (including build/live/runtime suites).
- npm run smoke:electron: exit 0, reader-electron.log.
- External provider: 31 npm tests and test:host pass, reader-unit.log and
  reader-host.log; added badge lifecycle/stale-publication assertions pass in
  reader-host-final.log. Paths are under ../jusi-djvu/.local/review/.
- Provider test:electron: exit 0, ../jusi-djvu/.local/review/reader-electron.log.
  Covers header text/rich transitions, hidden ready overlay, native status-line
  readiness, prior selection/page/scroll regressions, real page 5 and final page
  913. Real page 5 probe verifies all three word boxes and byte-identical embedded
  text: page5-verified.json. Inspected djvu-word-real.png: aligned word highlight,
  no reading header/status overlay, Text ready in the Neovim status line.
- Changed-file whitespace check passes, including untracked files.
- Package build and all six existing package lanes: exit 0, reader-package.log.
  Used the installed Electron distribution in the existing generated builder
  config. Default/native, delayed focus, alpha and both browser workflows passed.
  Packaged runtime/resources match current source: reader-packaged-runtime.json.
  Existing guest teardown / listener diagnostics were nonfatal.
- Final docs harness: exit 0, reader-final-harness.log.

Manual CUA deferred: automated real-input Electron assertions and saved screenshot
inspection cover these provider flows. Shared browser visuals did not change, so
its existing review queue remains 2/3. Requirements statuses were not promoted.
No agents, commits, remote publication or user configuration changes.

# Session handoff — 2026-10-28 (worker page actions and boundary following)

The preceding navigation milestone added ADR 0048's generic surface.actions and
source.navigate.viewport contracts. Trusted provider mappings dispatch bounded
opaque actions without requiring a text ticket. Viewport capture follows Neovim's
actual top/bottom rows and wrap skip columns, with window identity and existing
navigation ticket/dedup checks. Guardian negotiation checks dependencies.
DjVu owns Ctrl-N/Ctrl-P counts, page bounds and in-flight form acknowledgements.
Its image follows at the image edge or when Neovim scrolls first; it does not
recenter every word. Split changes reset provider follow history.

Checks from that milestone: host harness, focused navigation/transport, npm run
check, smoke:electron and all six package lanes exited 0 (navigation-*.log under
.local/review). Packaging reused the installed Electron distribution via the
existing generated builder config, avoiding the earlier download failure without
changing TLS policy. Provider 31 tests, host and Electron passed; final affected
reruns are navigation-unit-final.log and navigation-electron-complete.log under
../jusi-djvu/.local/review. Initial Electron fixture failures were corrected:
reverse scrolling required further forward movement, new guests needed explicit
WebContents identity, and the text-boundary-first scenario needed controlled test
scrolloff/zoom. No production scrolloff setting changed. Inspected djvu-follow.png.
Manual CUA deferred; browser queue stayed 2/3. Updated runtime requires host restart.

# Session handoff — 2026-10-27 (worker visual-selection ranges)

The external DjVu highlighting task now uses the optional generic capability
`source.navigate.selection` (ADR 0047). Neovim resolves Visual selections through
its existing shared resolver, then sends zero-based published-line indices and
end-exclusive UTF-8 byte ranges. Cursor/window/ticket and selection share the
same capture and deduplication. ModeChanged and relevant OptionSet events publish
changes without requiring cursor motion. Legacy workers receive no new field.
The guardian handshake and dependency checks include the capability. Selections
beyond 512 rows or unrepresentable partial terminal cells suppress visual
projection as a whole; actual Neovim selection/yank is unaffected.

DjVu-specific behavior remains in ../jusi-djvu: multiple selected boxes, no
page/paragraph/column fallback paint, and line-end ¬/soft-hyphen coordinate matching
without changing source text. Its page 4 bullet test clears the highlight without
scrolling. Restart a host using the updated runtime, then reopen the document.
No unrelated changes, user configuration, commits or remote publication.

Verification (primary agent, macOS arm64, Node 24):
- Entry npm run harness: exit 0, .local/review/highlight-harness.log.
- Focused worker navigation/transport: exit 0, highlight-navigation.log and
  highlight-transport.log. Unicode, reverse/exclusive, linewise, clearing,
  rich-mode suppression, legacy behavior and capability dependencies covered.
- Additional real Neovim 512/513-row and serialized-frame-budget probe: exit 0,
  highlight-selection-limits.log.
- npm run check: exit 0, highlight-check.log (includes build and smoke:live).
- npm run smoke:electron: exit 0, highlight-core-electron.log.
- npm run smoke:package initially failed during Electron packaging with a TLS
  download disconnection, before desktop tests: highlight-package.log. No TLS
  policy changed. Retried the same generated package config with electronDist
  pointing to the installed node_modules/electron/dist (44.5.0), then reused all
  six existing package lanes sequentially: exit 0, highlight-package-local.log.
  Default/native integration, delayed focus, alpha workflow and both browser
  workflow adapters passed. Existing guest-teardown diagnostics remain nonfatal.
- External provider: 28 npm tests, test:host, and test:electron all exit 0, logs
  ../jusi-djvu/.local/review/highlight-{unit,host,electron}.log. Electron exercises
  characterwise, linewise, block, reverse, exclusive selections and Escape;
  real page 4 verifies the hyphenated fragment and unmapped bullet, unchanged
  embedded text, and final page 913 publication.
- Inspected provider screenshots: djvu-selection.png has separate boxes across
  two lines; djvu-word-real.png aligns with the printed фундамен- fragment.

Manual CUA deferred: the provider interaction is covered by real-input Electron
assertions and screenshot inspection. The shared browser UI is unchanged; its
existing review queue remains 2/3. Requirements statuses were not promoted.
Next: external provider page mappings and viewport-follow behavior remain separate
requested work. Historical browser readiness/input findings remain open.

# Session handoff — 2026-10-27 (worker cursor positions for external word mapping)

The external jusi-djvu task required same-line word mapping. Added the generic
optional `source.navigate.cursor` capability (ADR 0046). A non-null navigation
frame includes cursorByte in the returned UTF-8 text line; the source anchor is
unchanged. Neovim owns position/window/ticket; providers own geometry. Legacy
providers retain line-level deduplication. The guardian advertises the capability;
handshake validation enforces its source.navigate/text.extract dependencies.
No DjVu-specific implementation was added to core. Existing dirty/untracked work
was preserved; no agents, commits, releases or user configuration changes.

The independent ../jusi-djvu provider now parses real OCR word zones, keeps normal
readable text lines, and highlights/reveals the cursor word. Actual line/region
coordinates are the explicit fallback when word zones are absent. Zoom and stored
page rotation transform real boxes; no estimated word widths. Restart the host to
load the new Lua API, then reopen the document. No visual-range projection or
reverse click-to-text protocol was added.

Verification, primary agent on macOS arm64 with Node 24:
- npm run harness exit 0 at entry.
- Focused worker-navigation and worker-transport Lua checks exit 0:
  .local/review/word-navigation.log and word-transport.log. Legacy behavior,
  same-line Unicode bytes, deduplication, rich/text restore and dependency failures.
- npm run check exit 0: .local/review/word-check.log (includes build/live). The
  following desktop stage started via &&, establishing the successful check exit.
- The first desktop run lost its process/completion record when the session was
  resumed; word-core-electron.log is incomplete and is not a pass.
- Resumed npm run smoke:electron exit 1: word-core-electron-resumed.log/.exit.
  Existing browser fixture's “link cursor/text did not settle” failure, DOM source,
  normal mode, Text ready, cursor {3,8} on “A😀é文 אב”. This same readiness failure
  is recorded in the C2 handoff below; root cause remains unconfirmed. No speculative
  production fix or blind desktop rerun. New worker routing is not used by that DOM
  source. The passing packaged case below does not establish a fix for this race.
- Full npm run smoke:package exit 0: word-package.log/.exit. Default presentation,
  native integration, delayed focus, alpha workflow and both browser workflow
  adapters passed. Expected failure-fixture/guest teardown and GPU warnings remain.
  Packaged init.lua, worker.lua and worker-guardian.lua byte-match source:
  .local/review/word-packaged-runtime.json.
- External provider: npm test exit 0 (14 tests), npm run test:host exit 0 and
  final npm run test:electron exit 0. Logs in ../jusi-djvu/.local/review/:
  word-unit.log, word-host.log, word-electron-final.log/.exit. Actual w/search,
  Unicode and repeated-word mapping, empty/coarse zones, all rotation transforms,
  rotated decoder output, zoom, old-host rejection, stale work and cleanup covered.
  Real 71-page DjVu review artifact: ../jusi-djvu/.local/review/djvu-word-real.png.
  Screenshot inspected: box aligns with the scanned word “Release”.

Manual CUA deferred: new interaction is covered by real Electron automation, and
the appearance was checked in the saved screenshot. Covered UI review queue is
now 2/3; historical native first-click and browser readiness issues remain open.
No requirements statuses promoted. Next: separately address historical browser
readiness/input findings; provider visual selections/reverse mapping need their
own generic contract if requested. Final documentation harness/diff results are
recorded in .local/review/word-docs.log.

# Session handoff — 2026-10-20 (updated Linux x64 test release)

User reports private CA setup works and explicitly requested current-state Linux
assets on the existing GitHub test release. Built/uploaded portable Linux x64
archive, checksum and installation notes to notawhaleble/jusi-neovim v0.1.0-test.
Updated release notes to identify the newest download; historical assets retained.
No source commit/tag pushed. Existing dirty/untracked tree preserved.
README points to LINUX-TESTING-20261020.md. User report is not a formal TLS gate.

Primary agent, macOS arm64, Node 24; commands below exit 0:
- npm run harness: .local/review/linux-update-harness.log.
- npm run dist:linux:portable:x64 --
  --config.directories.output=.local/review/linux-test-20261020/build:
  .local/review/linux-update-build.log.
- python3 .local/review/linux-test-20261020/verify.py:
  .local/review/linux-update-verify.log; 87 compiled/runtime/provider/preload/
  renderer files match current tree. Executable is ELF x86-64, executable mode
  retained, binary matches official cached Electron 44.5.0 Linux x64 archive.
  Production main verified; smoke-test bootstrap absent. Content hashes:
  .local/review/linux-test-20261020/contents-sha256.json.
- gh release upload and gh release edit --notes-file:
  .local/review/linux-update-upload.log. Remote assets all uploaded; byte sizes
  and GitHub SHA-256 digests match all three local files:
  .local/review/linux-update-remote.json.
- Final npm run harness / git diff --check:
  .local/review/linux-update-docs.log.

Artifact: jusi-neovim-0.1.0-test-20261020-linux-x64.tar.gz, 125463378 bytes.
SHA-256: 3c11603712b2ef777d7e529eb43f54db540b5beb93f151ba0a55a19d8c557474.
Staging: .local/review/linux-test-20261020/upload/.

No application changes in this upload. Unchanged production code already passed
npm run check, default Electron and both-adapter scoped macOS package DevTools
checks on 2026-10-19; these passed suites were not repeated. No Linux desktop,
sandbox execution, full package suite or CUA performed. UI review queue stays
1/3; historical W2, nested-native serialization and native fullscreen first-click
findings remain open. No requirements upgraded. Next: existing browser/Neovim
conformance follow-ups and Linux runtime acceptance.

# Session handoff — 2026-10-20 (private CA scope and platform guide)

User clarified corporate private CA/server trust, currently imported in Chrome.
Asked which target OS (macOS/Linux/both); answer pending. Documented platform
import/removal in docs/browser/private-ca.md, linked from README. Mac uses Keychain
SSL trust; Linux uses Chromium's NSS shared DB with legacy-path precedence.
Guide discloses cross-profile/application scope, persistence, cancellation/CLI
behavior, restart and validation failures. No custom TLS verifier, new import UI,
application code or machine trust-store changes. Existing work preserved.

Primary-agent checks, Node 24:
- git status --short saved: .local/review/ca-entry-status.txt.
- npm run harness exit 0: .local/review/ca-entry-harness.log.
- Documentation review plus final npm run harness / git diff --check exit 0:
  .local/review/ca-docs.log. Shell examples reviewed for quoting and explicit
  paths; imports intentionally not executed on the user's certificate stores.

Upstream source review: Electron session API, Chromium Linux certificate-management
instructions, Apple certificate import/trust instructions. These establish the
platform procedure, not Jusi import or corporate-endpoint acceptance. R6 remains
partial with no new verified evidence. No builds, desktop/package suites or CUA
run: documentation-only scope. UI queue unchanged (1/3); native fullscreen AX
first-click finding remains open.

Next: target-platform import/restart/removal acceptance with a private CA chain,
including hostname, expiry, untrusted-chain and intended-usage failures. User may
already have platform trust; do not assume Chrome-local settings are shared.
Client-certificate identity work is not part of this immediate request.

# Session handoff — 2026-10-19 (browser DevTools; certificate clarification pending)

User prioritized custom certificate loading and DevTools. DevTools implemented as
one coherent slice (ADR 0045). `:JusiWebDevTools` toggles detached tools for the
current browser document; F12 in rich mode uses the same shared dispatcher in
both adapters. Existing Neovim buffer/window/incarnation validation selects the
command target. No shell inspector, remote debugging listener or TLS change.
Existing dirty/untracked work preserved; no agents delegated.

Certificate work is NOT implemented: asked whether the user needs CA/server trust,
client certificates (mTLS), or both; answer pending. Electron's supported session
API does not expose an additional-CA bundle; ADR 0002 permits the documented OS
store path where profile scope is unavailable. Choose the actual import workflow
after clarification, with explicit scope/persistence/removal and TLS negative
cases. No trust store on this machine was changed.

Verification: primary agent, macOS arm64, Node 24. All commands below exit 0;
logs under `.local/review/`:
- npm run harness: cert-devtools-entry.log.
- npm run build; node src/test/browser-commands.test.mjs:
  devtools-build.log / devtools-unit.log. Toggle, keyboard exclusions, missing
  capability and dispatch exception paths covered.
- JUSI_TEST_BROWSER_WORKFLOW=1 JUSI_TEST_BROWSER_DEVTOOLS_ONLY=1
  node scripts/run-smoke-electron.mjs: devtools-dom.log;
  same with JUSI_TEST_NATIVE_POPUPS=1: devtools-native.log.
  Actual adapters cover command open/close, F12, shell isolation and guest close.
- npm run check: devtools-check.log (includes build and live).
- npm run smoke:electron: devtools-electron.log. Existing invalid guestInstanceId
  teardown warnings and expected worker error-fixture messages retained.
- JUSI_TEST_BROWSER_WORKFLOW=1 JUSI_TEST_BROWSER_DEVTOOLS_ONLY=1
  npm run smoke:package -- --workflow-only: devtools-package.log. Scoped packaged
  DevTools workflows, both adapters; inherited workflow flag also scopes the
  runner's alpha invocation to DevTools. This is not full package acceptance.
- Final npm run harness and git diff --check: devtools-docs.log.

Manual review deferred: meaningful automated coverage for the new interaction;
queue adds one covered UI milestone (1/3). Existing native first physical/AX click
after fullscreen failure remains open and is not replaced by this deferral.
No Linux runtime or certificate acceptance. R7 remains partial; R6 unchanged.
Next: obtain certificate type/scope and implement that flow, then return to the
existing native fullscreen/input and Neovim conformance follow-ups.

# Session handoff — 2026-10-18 (W2 timing and host fullscreen input)

User requested investigation of the W2 post-reload timeout and clicks swallowed
following Ctrl-Cmd-F/F11. Existing dirty/untracked tree preserved; primary agent
only, macOS arm64, Node 24.

Fullscreen cause reproduced before the fix: retained Meta-down plus host
enter-full-screen without guest blur/key-up consumes an ordinary button click.
Extended ADR 0043's shared transient-input reset to enter/leave-full-screen,
including all registered link modifiers/pending lookups and mode prefixes. No
Neovim state or guest lifetime changes. Native adapter integration additionally
exposed missing F11/Ctrl-Cmd-F dispatch: native guests never reached the DOM
webview shortcut handler. Recognition/toggle now lives in browser-window-input.ts
and is invoked by shell, DOM guests and native guests.

W2: the original historical timeout did not reproduce. Added bounded guest
focus/input-event failure diagnostics and JUSI_TEST_DUPLICATE_RELOAD_TRIALS=1–20.
The original one-reload case and a ten-reload stress case passed (initial ten tab
switches, distinct same-URL guests, retained input, reload and survivor after
sibling close). No W2 production fix or timing workaround was made; this does
not prove fixture timing was the cause or establish Mixcloud acceptance.

Verification (all logs in .local/review/):
- npm run harness exit 0: input-investigation-entry.log.
- JUSI_TEST_BROWSER_WORKFLOW=1 JUSI_TEST_BROWSER_DUPLICATE_ONLY=1
  npm run smoke:electron exit 0: w2-trace.log. Same focused runner after build,
  JUSI_TEST_DUPLICATE_RELOAD_TRIALS=10 exit 0: w2-stress-trace.log.
- JUSI_TEST_BROWSER_WORKFLOW=1 JUSI_TEST_BROWSER_BLUR_ONLY=1
  node scripts/run-smoke-electron.mjs failing-before exit 1:
  fullscreen-boundary-before.log (ordinary control did not advance at entry).
- npm run build and node src/test/browser-input-boundary.test.mjs exit 0:
  input-boundary-build.log / input-boundary-unit.log. Unit coverage checks
  fullscreen reset, per-host isolation, one listener/event and cleanup.
- Focused DOM exit 0: fullscreen-boundary-dom.log. Initial native exit 1:
  fullscreen-boundary-native.log, waiting for actual F11 host transition (missing
  handler, not a click timeout). After sharing handler, build/native exit 0:
  fullscreen-shortcuts-build.log / fullscreen-boundary-native2.log.
- Both focused adapters cover missing key-up at entry/exit, actual F11 and
  Ctrl-Cmd-F entry/exit, ordinary controls/links, deliberate modified clicks,
  and existing app-focus/pending-link cancellation. Source runners as above;
  native adds JUSI_TEST_NATIVE_POPUPS=1.
- npm run check exit 0: input-investigation-check.log (includes build/live).
  npm run smoke:electron exit 0: input-investigation-electron.log.
- DOM review runner exit 0: fullscreen-boundary-review.log, using
  JUSI_TEST_REVIEW=browser-blur. Actual CUA Ctrl-Cmd-F entry and exit followed
  by button clicks changed Paused -> Playing -> Paused; window controls
  disappeared/restored. No duplicate app-switch review.

Known limits: historical W2 timeout unresolved; nested-native parent serialization
remains separate. Existing invalid-guest teardown/GPU warnings and expected worker
failure-fixture messages retained. No Linux or real-site acceptance, package suite
or browser safety claim. Package checks deferred: no packaging, preload, security
configuration or shipped Lua/resource changes in this slice.
Native targeted CUA: Ctrl-Cmd-F entered fullscreen and removed window controls,
but the first AX-targeted click focused the Paused button without changing it to
Playing. A screenshot confirmed Paused; no repeated clicking/restart. Ctrl-Cmd-F
restored window controls, and review stopped. Native OS first-click acceptance
is NOT passed despite automated guest-input success. This resembles the previously
recorded native AX focus handoff concern but its cause is not established. The
review runner itself exited 0 (fullscreen-boundary-native-review.log); that is
not a manual pass. DOM review passed; native manual queue retains this concrete
failure, not a deferred-review counter increment. Review notes:
.local/review/fullscreen-boundary-manual.txt.

Next: investigate native first physical/AX click focus/placement after fullscreen
without synthetic guest-input bypass; capture W2 diagnostics if its timeout
recurs. Then remaining Neovim/browser conformance planning. No requirements
statuses upgraded. Final harness and diff checks recorded in input-investigation-docs.log.

# Session handoff — 2026-10-17 (Linux x64 test asset)

User explicitly requested a build from the current working tree and upload to the
existing GitHub test release, v0.1.0-test in notawhaleble/jusi-neovim. Built the
portable Linux x64 tar.gz format documented in README; older assets retained.
Source base 49031173bb2d93928f7f8a5d5855cbc7165ac837 plus current dirty/untracked
application files. No source commit/tag pushed. README testing-note date updated.

Primary-agent verification, macOS arm64, Node 24:
- npm run harness exit 0: .local/review/linux-release-harness.log.
- npm run dist:linux:portable:x64 --
  --config.directories.output=.local/review/linux-test-20261017/build exit 0:
  .local/review/linux-release-build.log. Electron 44.5.0, Linux x64 portable target.
- JUSI_TEST_BROWSER_WORKFLOW=1 JUSI_TEST_BROWSER_LOCATION_ONLY=1
  npm run smoke:package -- --workflow-only exit 0:
  .local/review/linux-release-package-smoke.log. Scoped macOS packaged workflows,
  both adapters, no CUA; this is not Linux runtime acceptance or a full suite.
- Archive comparison exit 0: .local/review/linux-release-verify.log;
  .local/review/linux-test-20261017/contents-sha256.json records 86 matched current
  compiled/runtime/provider/preload/renderer files. Executable is ELF x86-64,
  executable permissions retained, binary matches cached official Electron 44.5.0
  Linux x64 archive. Production main verified; smoke bootstrap absent.
  Validator initially assumed .d.ts/devDependencies/version were shipped;
  electron-builder strips them. Corrected validator uses runtime files and the
  actual Electron binary hash. No packaging/security bypass introduced.
- gh release view initially used tag test (not found); existing tag is v0.1.0-test.
  Local docker info formatter panicked; no container workflow used. Native Linux
  desktop/sandbox tests remain unavailable. No full suites or computer use run.

Artifact: jusi-neovim-0.1.0-test-20261017-linux-x64.tar.gz, 125462632 bytes.
SHA-256: 7ff4cdc515f305ece9b0aef6e458202575135f288aea250c2f85e247967ad49f.
Upload staging: .local/review/linux-test-20261017/upload/ (archive, checksum and
LINUX-TESTING-20261017.md installation/provenance/known-limits notes).
gh release upload v0.1.0-test exit 0: .local/review/linux-release-upload.log.
All three remote assets report uploaded; sizes and GitHub SHA-256 digests match
local files: .local/review/linux-release-remote.json. Final npm run harness and
git diff --check exit 0: .local/review/linux-release-docs.log. Existing W2 post-reload input and
nested-native serialization findings remain unresolved; no feature work here.

# Session handoff — 2026-10-17 (W2 investigation only)

No production code changed. User reports W2 no longer occurs and explicitly
requested no full suites when nothing needs fixing. Source review found retained
DOM ancestry while parked, per-buffer/session surface identity, and native views
hidden rather than reconstructed. This does not identify the historical cause.

Added JUSI_TEST_BROWSER_DUPLICATE_ONLY=1 to the shared browser workflow, skipping
unrelated editor/command cases. Two distinct same-URL guests retain independent
input state across ten tab switches, explicit reload and closing one while using
the other. Native guests use separate opener buffers because each source permits
one live child. Explicit Neovim window identities select the tested split.

Verification (primary agent, macOS arm64, Node 24):
- Entry npm run harness exit 0: .local/review/w2-entry-harness.log.
- npm run smoke:electron with JUSI_TEST_BROWSER_WORKFLOW=1 and
  JUSI_TEST_BROWSER_DUPLICATE_ONLY=1: w2-dom.log exit 1, test mistakenly requested
  text-off with JusiWebBuffer! then waited for Text ready; corrected fixture.
  w2-dom2.log exit 0, including build. Invalid guestInstanceId warnings occur
  around closure while survivor assertions pass; not proof of the Mixcloud cause.
- Subsequent focused runs use the same built production code:
  PATH=/opt/homebrew/opt/node@24/bin:$PATH JUSI_TEST_BROWSER_WORKFLOW=1
  JUSI_TEST_BROWSER_DUPLICATE_ONLY=1 node scripts/run-smoke-electron.mjs;
  native adds JUSI_TEST_NATIVE_POPUPS=1.
- Native setup failures: w2-native.log and w2-native2.log exit 1, second popup
  denied because the source already owns a child (initial hidden-source hypothesis
  was incomplete). A nested-source experiment w2-native3.log exit 1/timed out:
  MessagePack rejects a Function in the parent binding; NativeChildOwner.reserve
  passes the full source object into allocate. Separate follow-up, not W2 evidence.
- Independent native openers: w2-native4.log exit 1 at second guest focus; setup
  had not explicitly selected its native split. Final w2-native5.log exit 0 after
  selecting the authoritative native buffer/window; all lifecycle assertions pass.
- Final DOM w2-dom-final.log exit 1: input wait in use() after explicit reload of
  the second document (workflow line 65), not the initial ten switches. Cause
  unresolved; prior DOM success does not establish repeatability. No blind rerun
  or speculative production change. No Mixcloud error/guest loss was reproduced.

W2 disposition: original report not reproduced, not confirmed fixed. Actual
Mixcloud URL/build/profile remain unavailable; real-site acceptance unclaimed.
Next focused triage, if needed: observe activeElement/document focus and input
routing at the post-reload DOM timeout, distinguish fixture timing from product
failure. Separately track scalar identity serialization for nested native opens.
No npm run check, full/default Electron, package suite, smoke:live or CUA run.
Manual queue remains 0/3 (no production/UI change). Final harness/diff checks
recorded in .local/review/w2-docs.log; no requirements marked verified.

# Session handoff — 2026-10-17 (W4 document/video fullscreen)

Implemented ADR 0044. Fullscreen permission now requires a registered, focused
browser document in the focused host with the exact current buffer/session/
incarnation and tab/window/grid. Chromium retains gesture/frame-policy checks;
automatic-fullscreen and unrelated permissions remain denied. Native views fill
host content bounds while fullscreen; other native views stay parked. Exit,
text mode, owner changes, navigation, crash and closure restore normal placement
and the preceding host fullscreen state without modifying Neovim layout.

A real YouTube review exposed an Electron/macOS Escape-release loop. Main-thread
inspection found repeated shell before-input-event Escape keyUp (WebContents 1),
including when Chromium consumed keyDown before exposing it. The shared lifecycle
now consumes the release after HTML fullscreen exit. Regression sends consecutive
keyDown/keyUp; waiting for exit before keyUp had hidden this failure and was removed.
Pending exit completion cannot restore a newer owner; destruction/crash restores
even when the old document's JavaScript promise never completes.

Verification, primary agent, Node 24, Neovim 0.11.4, macOS arm64:
- Entry git status preserved: .local/review/fullscreen-entry-status.txt; entry
  npm run harness exit 0: fullscreen-entry-harness.log. Existing dirty tree retained.
- Failing-before request fixture: fullscreen-before.log / fullscreen-before3.log
  exit 1 (clicked request did not enter fullscreen under deny-all permission).
  before2 was a test syntax error, fixed before further checks.
- Permission-only probes showed DOM 1440x900 but native 1196x360 inside a
  1440x900 host (fullscreen-permission-probe.log, fullscreen-native-probe.log).
- Intermediate DOM exit checks found host restoration and rapid Escape failures
  (fullscreen-dom2.log through dom7.log). Hidden-page fullscreenElement is checked
  after returning to its tab; hidden-tab acceptance checks host exit and parking.
- Native close initially left the host fullscreen (fullscreen-native9.log exit 1);
  destruction now completes restoration independently of a pending script reply.
- First package attempt exit 1: fullscreen-package.log, YouTube's themeRefresh
  navigation aborted loadURL. Review harness now tolerates only ERR_ABORTED on
  the actual YouTube host and waits for the resulting page; TLS stays enforced.
- Second package attempt: fullscreen-package2.log, real Escape hang; stopped the
  exact isolated test process. Samples: fullscreen-escape-hang.sample.txt and
  fullscreen-youtube-hang.sample.txt. Inspector evidence: fullscreen-js-stack2.json.
  A worker-profiler probe stalled before input and was terminated; the temporary
  inspector/profiler switches were removed. No diagnostic listener remains.
- Original consecutive Escape regression now passes: fullscreen-release-dom.log
  exit 0. Native release run initially failed synthetic entry after host resize;
  the fixture now awaits observed guest focus/visibility before sending mouse input.
  fullscreen-release-native2.log and fullscreen-release-unit.log exit 0.
- Final packaged command: JUSI_TEST_BROWSER_WORKFLOW=1
  JUSI_TEST_BROWSER_FULLSCREEN_ONLY=1 JUSI_TEST_REVIEW=browser-fullscreen
  npm run smoke:package -- --workflow-only, exit 0: fullscreen-package4.log.
  package3 stopped during packaging without an acceptance result. Package4 covers
  both transports: click entry, full-host dimensions, control interaction, immediate
  Escape down/up, tab switch/return, reload, pre-existing host fullscreen, text-mode
  exit and destruction. The duplicate DOM lane was resumed without duplicate CUA.
- Final npm run check exit 0: fullscreen-final-check.log (includes build/live).
  Final full default npm run smoke:electron exit 0: fullscreen-final-electron.log.
  Prior check/default runs also passed, but predate the Escape-release correction.
- Final npm run harness and git diff --check exit 0: fullscreen-docs.log.

Actual YouTube CUA passed in both packaged adapters, using isolated test profiles:
watch?v=aqz-KE-bpKQ, clicked Full screen, full-display playback/letterboxing verified
visually, pause/resume controls, real Escape, re-entry and player-button exit.
Original layout and document focus restored, including the native source/browser
split pair. Notes: .local/review/fullscreen-manual.txt. Per user instruction, no
W5 Cmd-Tab/app-focus regression CUA was replayed. Manual queue remains 0/3.

Nonfatal logs include Electron invalid-guest teardown messages, expected worker
failure-fixture output, and YouTube ancillary connection/listener warnings. They
are retained, not claimed fixed. This establishes scoped macOS W4 acceptance,
not arbitrary iframe/media/platform conformance or browser safety parity. Linux,
multiple displays/DPI and arbitrary embedded players remain outside this evidence.

Next: investigate W2 last as requested (user no longer reproduces it); do not mark
it fixed without evidence. Then resume remaining Neovim conformance and define
browser conformance boundaries. W1/W3/W5 scoped fixes remain recorded below.

# Session handoff — 2026-10-17 (W5 Cmd-Tab input recovery)

User reordered remaining work: W5 first, W4 fullscreen next, W2 last because the
same-page tab issue no longer appears to reproduce. This supersedes prior next-step
ordering. W2 is not marked fixed. The exact YouTube pause -> remain web-focused ->
Cmd-Tab away/back -> swallowed video click / ordinary link opens new tab sequence
is recorded in WEB-BUFFER-ISSUES.md.

Confirmed missing boundary: WebContents/element blur need not accompany host app
deactivation, and Command key-up can be lost. The retained modifier made ordinary
clicks enter the modified-link branch; non-links were swallowed. A failing-before
DOM fixture reproduced it by delivering Meta key-down and host blur without guest
blur or key-up. ADR 0043 adds a shared host blur/focus reset registration used by
both adapters' link modifiers and mode/window-command prefixes. No mode toggle,
reload, ownership change or popup permit revocation is introduced. One listener
pair per host serves all registered input state; destroyed sources unregister.
Reset also invalidates pending asynchronous link lookups across app deactivation.

Verification (primary agent, Node 24, Neovim 0.11.4, macOS arm64):
- Entry git status: .local/review/browser-blur-entry-status.txt; unrelated work
  preserved. Entry npm run harness exit 0: browser-blur-entry-harness.log.
- Failing-before fixture exit 1: browser-blur-before.log, shared workflow line 40,
  ordinary control click failed to advance after Meta-down plus host blur.
- Build/unit exit 0: browser-blur-build.log, browser-blur-unit.log. Tests cover
  20 guests with one host listener pair, host isolation, guest blur, destruction
  and idempotent cleanup.
- Initial fixed DOM/native fixture exit 0: browser-blur-dom.log and
  browser-blur-native.log (browser-blur-focused-exit.txt).
- Extended workflow initially failed focus precondition at line 47:
  browser-blur-dom2.log. After a deliberate new-tab/close sequence the source is
  intentionally back in text mode; calling guest.focus alone did not establish
  rich mode. The test now uses the normal i path before each separate deliberate
  gesture case. No such toggle occurs inside the missing-key-up reproduction.
- Final focused DOM/native exit 0: browser-blur-dom3.log, browser-blur-native2.log.
  Commands: JUSI_TEST_BROWSER_WORKFLOW=1 JUSI_TEST_BROWSER_BLUR_ONLY=1 npm run
  smoke:electron; native adds JUSI_TEST_NATIVE_POPUPS=1. Covers host blur and focus
  independently, ordinary control/link clicks, exactly one tab for fresh Meta,
  Control, Shift and middle clicks, and canceled delayed link lookup after blur.
- npm run check exit 0: browser-blur-check.log (includes build/live).
- Full default npm run smoke:electron exit 0: browser-blur-electron.log.
  Sequential final exit record: browser-blur-final-exit.txt.
- JUSI_TEST_BROWSER_WORKFLOW=1 JUSI_TEST_BROWSER_BLUR_ONLY=1
  JUSI_TEST_REVIEW=browser-blur npm run smoke:package -- --workflow-only exit 0:
  browser-blur-package.log. Both packaged adapters pass scoped input-boundary
  acceptance. This is not a full packaged release acceptance claim.

Final npm run harness and git diff --check exit 0: browser-blur-docs.log.

Targeted real OS CUA review completed (browser-blur-manual.txt): both packaged
adapters paused a fixture control, Cmd-Tabbed to Finder and back, then resumed via
ordinary click and retained current-document link behavior without a mode toggle.
Also verified actual YouTube in the DOM adapter using an isolated test profile:
watch?v=aqz-KE-bpKQ paused by frame click at 0:18; after Cmd-Tab round trip another
frame click resumed (Pause control and elapsed 0:21). A recommended-video click
navigated to watch?v=Y-rmzh0PI3c with unchanged Neovim tab count. Text mode was used
only afterward to display the tab-count comparison. No user account/live profile
was used. Native actual YouTube, Linux and physical modifiers intentionally held
across app activation remain unclaimed; synthetic flags cannot infer missing OS
key events. Existing unrelated historical test failures remain recorded below.
Manual queue 0/3 after targeted review. Fullscreen was not tested or fixed here.

Next coherent milestone: W4 document/video fullscreen (fixture plus actual YouTube),
then investigate W2 last. Remaining Neovim conformance remains deferred until the
reported browser issue queue is addressed.

# Session handoff — 2026-10-17 (W1 current URL buffer names)

Implemented ADR 0042. Initial web buffers and both browser adapters publish current
committed URLs to b:jusi_browser_url and Neovim buffer names. Hash/history,
redirect/reload and ordinary navigation update names without changing requested
surface URIs or reloading guests. Duplicate URLs keep distinct identities and use
numeric suffixes only for name collisions. Scheme-only URLs use jusi-web:// in
the name, retaining exact metadata. Other providers keep their naming policy.
Native bindings are reduced to scalar identity fields before RPC. Stale session/
incarnation updates are rejected. Rename errors preserve metadata and permit retry.

Neovim creates an unloaded old-name buffer on rename; cleanup removes only the
newly allocated, unlisted, unloaded, unmodified exact-old-name artifact. Existing
buffers remain untouched. Focused regression covers no accumulation/history,
literal spaces/percent/pipe/hash characters and rename failures.

Verification (primary agent, Node 24, Neovim 0.11.4, macOS arm64):
- Entry git status preserved: .local/review/web-next-entry-status.txt. Entry
  npm run harness exit 0: web-next-entry-harness.log. Unrelated edits preserved.
- Build passed; initial Lua test failed at line 24 on back-navigation naming:
  browser-location-focused.log. Rename trace: browser-location-rename-trace.log.
  A keepalt experiment still created the old-name buffer (focused2.log); removed.
  Final focused Lua/helper tests exit 0: browser-location-focused3.log,
  browser-location-final-lua.log. RPC scalar-only/stale identity test exit 0:
  browser-location-rpc.log; build: browser-location-build-final.log.
- DOM URL workflow initially failed at history-back because scripted hash navigation
  lacked userGesture (browser-location-dom.log); true gesture fixes the fixture.
  Final DOM URL workflow exit 0: browser-location-dom2.log.
- Native first failed serializing the binding's live document (browser-location-native.log).
  Sanitized bridge payload; native2/native3 then exposed absent /redirect fixture
  handling, with the URL correctly staying /redirect rather than /next. Added the
  redirect route to the native fixture. Assertions also allow legitimate numeric
  collision suffixes. Final native URL workflow exit 0: browser-location-native4.log.
- Both use JUSI_TEST_BROWSER_WORKFLOW=1 JUSI_TEST_BROWSER_LOCATION_ONLY=1 npm run
  smoke:electron; native adds JUSI_TEST_NATIVE_POPUPS=1.
- npm run check exit 0: browser-location-check.log. Full default npm run
  smoke:electron exit 0: browser-location-electron.log. Sequential exit record:
  browser-location-check-exit.txt. Includes required build/live checks.
- Initial packaged run failed before browser creation in nvim-integration-cases:28,
  appended shell-output viewport assertion (actual empty vs preserved stream lines):
  browser-location-package.log. Cause unresolved; no production editor change.
  Focused URL mode now skips unrelated editor cases; full default suite retains them.
- JUSI_TEST_BROWSER_WORKFLOW=1 JUSI_TEST_BROWSER_LOCATION_ONLY=1
  JUSI_TEST_REVIEW=browser-location npm run smoke:package -- --workflow-only
  exit 0: browser-location-package2.log. This is both-adapter scoped packaged URL
  acceptance, not a full package pass. Built runtime and shared navigation helper
  verified in the package. No extra package rebuild after that passing run.

Final npm run harness and git diff --check exit 0: browser-location-docs.log.

Combined packaged CUA review completed for URL labels and accumulated W3 workflows:
existing-buffer tab creation, split statuslines and plain-buffer restoration; both
adapters reviewed. Packaged app path verified before input, DOM split/native tab
screenshots inspected. Native AX exposed stale split text after tab creation;
screenshot confirmed actual single-tab layout. Record: browser-location-manual.txt.
Manual queue reset to 0/3. No claim about unrelated native rich-input AX-click,
Linux, actual Mixcloud/YouTube or browser parity. Existing transient desktop/package
failures stay unresolved, even where later scoped runs pass.

Next coherent milestone: W2 independent same-URL buffers, guest identity/lifetime
and repeated switching, then related W5 modifier/focus routing and W4 fullscreen.
Read-only triage found persistent DOM hosts stay in one root and are parked by CSS;
no confirmed W2 cause or production fix yet. Asked user asynchronously for exact
Mixcloud/YouTube URLs and sign-in needs; no answer yet, fixture work can continue.
Remaining Neovim conformance stays deferred until the web issue queue is addressed.

# Session handoff — 2026-10-17 (W3 existing-buffer tab reproduction)

User's exact `tabe` -> `b 2` sequence reproduced duplicate status after the prior
fix. Prior coverage used `tab split`, which missed Neovim copying window-local
options from another window displaying an existing buffer. A BufLeave restoration
experiment also failed; trace records an undecorated departure and a decorated
BufEnter arrival. The prior window-event source inference is removed.

ADR 0041 now interns exact installed formats with internal IDs that recover their
original local option, including global inheritance versus explicitly equal local
text. Copied/cached formats are recognized on attach without appending again.
Plain buffers follow Neovim's option policy; no departed-window custom format is
forced into a new buffer. Explicit user clearing is preserved. Old 2026-10-16
STATUS limit and restoration policy are superseded. Records stay for the Neovim
process lifetime because cached options can outlive windows; distinct formats
allocate records, repeated attach does not. Runtime hot reload/custom statusline
plugin interoperability remain unclaimed. Restart the host to load this runtime.

Verification (primary agent, Node 24, Neovim 0.11.4, macOS): logs in .local/review/.
- Entry git status: browser-status-existing-entry.txt; unrelated edits retained.
  Entry npm run harness exit 0: browser-status-existing-harness.log.
- Exact reproduction exit 1: browser-status-existing-before.log. BufLeave-only
  experiment also failed; event trace: browser-status-existing-trace.log.
- Final headless test exit 0: browser-status-existing-focused.log. Repeated tabe,
  existing-buffer selection, browser/plain revisits, split/tab-split, custom/global
  formats, explicit clearing and global changes. Included in npm run check.
- Initial JUSI_TEST_BROWSER_WORKFLOW=1 npm run smoke:electron exit 1:
  browser-status-existing-workflow.log, browser-workflow-cases.mjs:30 reference
  caret missing (index 0, scrollY 0), before status assertions. Cause unresolved.
  Added JUSI_TEST_BROWSER_STATUS_ONLY=1 to the existing shared workflow harness;
  no copied harness or unrelated production caret change.
- JUSI_TEST_BROWSER_WORKFLOW=1 JUSI_TEST_BROWSER_STATUS_ONLY=1 npm run smoke:electron
  exit 0: browser-status-existing-dom.log; same with JUSI_TEST_NATIVE_POPUPS=1
  exit 0: browser-status-existing-native.log. Exact tabe/buffer sequence exercised.
- npm run check exit 0: browser-status-existing-check.log.
- npm run smoke:electron exit 0: browser-status-existing-electron.log. Earlier
  reference-caret and prior session Unicode timeout causes remain unresolved;
  this passing full smoke does not retroactively diagnose those failures.

- JUSI_TEST_BROWSER_WORKFLOW=1 JUSI_TEST_BROWSER_STATUS_ONLY=1 npm run smoke:package
  -- --workflow-only exit 0: browser-status-existing-package.log. Scoped status
  regression through both packaged adapters; not full packaged acceptance.
- Final npm run harness and git diff --check exit 0: browser-status-existing-docs.log.

Manual review deferred: automated exact reproduction covers the changed behavior;
queue 2/3. No CUA, screenshots, Linux or real-site acceptance. User observes the
same existing web buffer usable in separate tabs with separate text/cursor state;
this is not W2 independent same-URL/Mixcloud acceptance. W1 URL naming remains next;
W2/W5/W4 and scoped Neovim conformance remain in the existing order.

# Session handoff — 2026-10-16 (W3 inherited browser statusline)

Completed a bounded W3 duplication fix; W1 URL-based names is still next, followed
by W2 guest lifetime, related W5 input and W4 fullscreen. Other dirty work preserved.
The headless regression reproduced duplicate suffixes on split creation before the
fix. Browser status ownership now records the prior and installed local formats;
WinLeave/WinNew transfer the source record when a new window inherits that exact
format. Repeated attach is idempotent; close removes ownership. Global inheritance
and custom-format restoration have focused coverage. See ADR 0041.

Known limit: explicitly clearing a local format while attached and leaving without
another attach cannot be distinguished from Neovim resetting the option on a buffer
switch. W3 broader custom-plugin acceptance remains open; do not mark all W3 cases
or browser conformance complete. No URL naming changes in this slice.

Verification (primary agent, Node 24, macOS, Neovim 0.11.4):
- Entry npm run harness exit 0; git status inspected, preexisting edits retained.
- Before-fix headless regression failed at split duplicate assertion:
  .local/review/browser-status-before.log. Initial restoration test failed at line
  34; trace showed Neovim resets the local option to empty on buffer switch:
  browser-status-trace.log. Corrected restoration; final focused test exit 0:
  browser-status-focused.log. Added to npm run test:providers.
- npm run check exit 0: browser-status-check.log (includes build/live).
- npm run smoke:electron exit 1: browser-status-electron.log. Exact failure:
  browser-interaction-cases.mjs:106 expected Unicode cursor column 4, observed 6;
  caret offset 5. Occurred before the new workflow assertions. Cause unresolved;
  no blind full-suite rerun or claim of full Electron acceptance.
- JUSI_TEST_BROWSER_WORKFLOW=1 npm run smoke:electron exit 0:
  browser-status-workflow.log; same with JUSI_TEST_NATIVE_POPUPS=1 exit 0:
  browser-status-native.log. Both exercise split/tab status equality along with
  navigation, readiness, URL-copy and existing link-tab workflows.
- JUSI_TEST_BROWSER_WORKFLOW=1 npm run smoke:package exit 0:
  browser-status-package.log. Package driver inherited the workflow selector;
  this is scoped packaged browser workflow evidence, not a full-package pass.
  Sequential focused/package batch exit 0: browser-status-workflow-exit.txt.
- Final npm run harness and git diff --check exit 0: browser-status-docs.log.
- GuestInstanceId and GPU warnings remain in native/package logs. These do not
  close W2 or prove its reported Mixcloud failure harmless.

Manual review deferred under selective policy: covered UI milestone queue 1/3.
No CUA, screenshot review, Linux or real-site acceptance in this slice. Explicit
empty custom statusline replacement and the Unicode-click failure remain open.
Next: W1 current URL metadata/names with collision-safe buffer identity; retain
W2/W5/W4 and remaining Neovim conformance in the existing priority order.

# Session handoff — 2026-10-16 (priority change; observed web-buffer queue)

User explicitly defers the remaining Neovim conformance work. Work order:
observed web-buffer fixes -> finish scoped Neovim conformance -> define browser
conformance boundaries and work through them. The previous cursor handoff's next
float/viewport slice is superseded. Neovim is considered usable for the user's
everyday work; do not mark remaining conformance gaps complete.

Recorded all five reports and acceptance criteria in WEB-BUFFER-ISSUES.md:
URL buffer names, duplicate-page/Mixcloud guest failure on tab switches, repeated
profile/readiness status sections, YouTube fullscreen, intermittent YouTube clicks
and unwanted new tabs. Preserved the exact site error ID, Electron guestInstanceId
stack and the user's repeated-status example. Platform/exact URLs/build details
are not yet supplied. The omitted statusline example was subsequently supplied.

Docs/planning and read-only source triage only; no implementation fix claimed.
Statusline inheritance into a newly tracked window is a plausible W3 cause from
browser.lua, pending reproduction. Do not infer W2/W5 share a cause or consider the
reported guest error harmless based on earlier passing teardown tests.
Next coherent implementation slice: W1/W3 buffer naming and status lifecycle,
then W2 guest identity/lifetime, related W5 input routing, and W4 fullscreen.

Entry git status preserved at .local/review/web-issues-entry-status.txt.
Entry harness exit 0: .local/review/web-issues-entry-harness.log.
Docs verification: npm run harness and git diff --check (exit 0),
.local/review/web-issues-docs-check.log. Build, desktop, package and CUA not run:
no executable behavior changed. Manual queue remains 0/3. Requirement statuses
and implementation evidence unchanged; future work stays in implementation docs.

# Session handoff — 2026-10-16 (C4b cursor glyphs and blinking)

Implemented ADR 0040. Block cursors now paint the full underlying glyph with
opaque colors, inverting the effective cell colors for attr_id zero or using the
explicit cursor highlight. ASCII, combining and wide cells use authoritative grid
runs; external command-line glyphs use grapheme boundaries and measured widths.
Neovim blinkwait/blinkoff/blinkon drive a per-cursor Web Animation. Zero disables
blinking; unchanged publications retain the cycle, while movement/style/text/input
restarts it. Hidden/busy cursors cancel animation. Command-line cursor nodes are
reused and preserve exclusive cursor ownership. No bridge/protocol changes.

Verification (primary agent, Node 24, Neovim 0.11.4, macOS arm64), all exit 0:
- Entry npm run harness: .local/review/nvim-cursor-entry.log; preexisting tree
  inventory: nvim-cursor-entry-status.txt. Unrelated dirty work preserved.
- npm run build and node src/test/cursor.test.mjs: nvim-cursor-focused.log.
- JUSI_TEST_DISPLAY_ONLY=1 npm run smoke:electron: nvim-cursor-display.log.
- npm run check: nvim-cursor-check.log.
- npm run smoke:electron: nvim-cursor-electron.log.
- JUSI_TEST_NATIVE_POPUPS=1 JUSI_TEST_REVIEW=nvim-conformance-native
  npm run smoke:electron: nvim-cursor-native-review.log.
- JUSI_TEST_REVIEW=nvim-conformance-native npm run smoke:package:
  nvim-cursor-package.log. Full default/native integration, interrupted focus,
  alpha and both browser workflow lanes passed in one sequential invocation.
- Documentation npm run harness and git diff --check:
  nvim-cursor-docs-harness.log, nvim-cursor-diff-check.log.

Tests cover explicit/reversed/source colors, zero blink timing, hide/reappearance,
wide-cell allocation, actual grid/command-line cursor text, deterministic Chromium
blink phases and animation identity across redraw. Saved nvim-cursor-wide.png and
nvim-cursor-highlight.png inspected. Package logs contain fixture failure-path
messages and Electron guest teardown/GPU warnings; no assertion or exit failure.

Combined review queue reached 3/3 and was completed in the existing packaged
nvim-conformance-native checkpoint: underline variants/strike, highlighted opaque
cursor, styled prompt, Ctrl-B command cursor and return to editor. Both browser
adapters were present. Review record: .local/review/nvim-cursor-manual.txt. Queue
now 0/3. Source CUA resolved a different running Electron instance; no input was
sent there and that checkpoint was resumed without claiming manual acceptance.
Packaged app URL was verified before interaction. No new review harness copied.

Remaining: language-map cursor selection and inactive-window styling; host font,
spacing/blend/mouse preference decisions; float-anchor/viewport/optional-event
handling and version/platform acceptance. Native browser input AX-click follow-up
from the prior review stays open (automated focus/typing passes). No Linux, other
Neovim versions, IME or real Fugitive push acceptance added. Real Jusi attention
and sibling custom tabline overflow remain separate unresolved evidence, not
closed by generic rendering checks. Next coherent slice: float/viewport and
remaining event conformance classification/handling. The overall C4 pass is open.

# Session handoff — 2026-10-16 (C4b UI option state/contract)

Implemented ADR 0039. Scalar option_set values now travel with completed screen
snapshots; partial redraws cannot leak changes and older snapshots remain immutable.
Unknown scalar option names are retained without automatically enabling behavior;
malformed values are ignored. Reported capability mismatches are exposed as
screen.unsupportedUiOptions and logged once per transition. Recovery clears the
condition. Normal Neovim negotiation is retained.

Important experiment correction: override=true is not safe for this host on Neovim
0.11.4. It enabled ext_tabline/ext_wildmenu even though neither was requested,
removing grid-drawn tabline output. Both the default desktop and focused diagnostic
caught this. The saved upstream ui.c confirms the global-capability calculation.
The override was removed; no production force-override remains. A less capable
secondary UI remains unsupported while attached, but is now diagnosed explicitly;
there is no visible recovery surface or legacy-grid fallback. Do not claim general
multi-UI conformance from the detection/recovery test.

The inventory now classifies reported font/spacing, blend, mouse, grid-owned and
extension options. Fonts/spacing still use the host policy; pumblend and mouse
preferences are retained but not newly applied. Tracking is not preference support.
This completes the option-state/diagnostic slice, not all of C4.

Verification under .local/review (primary agent, Node 24.10.0, Neovim 0.11.4,
macOS arm64):
- Entry harness exit 0: nvim-options-entry.log; inventory:
  nvim-options-entry-status.txt.
- Initial build and real second-UI test exit 0: nvim-options-focused.log. This test
  originally checked preserved required capabilities but missed unrequested widgets.
- Initial npm run check exit 0: nvim-options-check.log. Initial full Electron exit 1:
  nvim-options-electron.log, nvim-options-exit.txt, at tabline attention assertion.
- Focused diagnostic reproduced exit 1: nvim-options-tab-diagnostic.log. option_set
  showed ext_tabline=true/ext_wildmenu=true and root grid contained blanks despite
  the correct highlight definition. Upstream source saved as nvim-ui-0.11.4.c.
- After removing override: build plus revised real-UI test exit 0:
  nvim-options-negotiation.log. Checks actual downgrade detection, disabled native
  tabline externalization and restoration after second-UI detach.
- JUSI_TEST_NVIM_ONLY=1 desktop exit 0: nvim-options-restored.log. Tabline highlight
  lifecycle, messages, pointer, external command/dialog and display cases pass.

Final npm run check and npm run smoke:electron both passed exit 0:
nvim-options-final-check.log, nvim-options-final-electron.log,
nvim-options-final-exit.txt. Includes real two-UI negotiation, completed-frame
option immutability, tabline colors and existing browser integration acceptance.

No new renderer interaction/appearance in the final change, so manual queue stays
2/3. No CUA or screenshot replay required. Package smoke deferred to next browser
integration/release checkpoint; no packaging, preload or runtime resource change.
Linux, other Neovim versions, real Jusi attention/custom sibling overflow and native
manual-focus follow-up remain open. Next: remaining C4 cursor fidelity, option
preference support decisions, float/viewport/event classification and version/platform
acceptance; do not treat this as completion of the whole Neovim pass.

# Session handoff — 2026-10-16 (C4b prompt highlight groups)

Implemented ADR 0038. The bridge resolves positive command-prompt group IDs using
nvim_get_hl(0, {id, link=false, create=false}), preserving their namespace separately
from hl_attr_define IDs. RGB decoding is shared with grid attributes. The renderer
receives explicit prompt attributes, never a guessed attribute-table index.
Linked groups resolve correctly; visible prompts update on highlight changes.

Resolution does not block publication or input. One request is in flight at a time;
level/prompt/group/highlight-epoch changes reject old replies. Hide, highlight
attribute/group and default-color events invalidate resolution. Results enrich only
the completed snapshot; pending redraws are never sampled. Failure falls back to
default styling without retry loops. Shutdown/process exit discard pending replies.

Verification (primary agent, Node 24.10.0 / Neovim 0.11.4 / macOS arm64), logs under
.local/review:
- Entry harness exit 0: nvim-prompt-entry.log; dirty-tree inventory:
  nvim-prompt-entry-status.txt.
- Initial decoder extraction placed a variable inside the wrong guard; TypeScript
  caught it (exit 2): nvim-prompt-build.log, nvim-prompt-focused.log. Corrected scope.
- Build + prompt resolver tests exit 0: nvim-prompt-focused2.log. Covers queued
  replacements, stale replies, hide, shutdown, failure/no retry loop, redefinition,
  group/attribute distinction and immutable prior snapshots.
- JUSI_TEST_NVIM_ONLY=1 source desktop exit 0: nvim-prompt-desktop.log. Real linked
  echohl/input prompt resolved and computed CSS matched expected RGB.
- Extended focused build/desktop exit 0: nvim-prompt-recolor-build.log and
  nvim-prompt-recolor.log. Redefining the linked group while input is open updates
  prompt styling; normal prompt completion still works.
- Screenshot nvim-prompt-highlight.png inspected: green bold prompt with aligned
  caret. This is screenshot review, not manual CUA.

Final npm run check and npm run smoke:electron both passed exit 0:
nvim-prompt-check.log, nvim-prompt-electron.log, nvim-prompt-exit.txt.
The check includes build/live and the existing frame/state regression tests.

Manual interaction deferred; queue 2/3 (decoration/basic cursor, prompt groups).
No browser integration/release checkpoint or package/preload/runtime-resource
change: package smoke not repeated. Linux, other versions, actual Jusi attention,
custom sibling overflow and native manual focus remain open.
Next: remaining C4b cursor blinking/inversion and UI option negotiation, followed
by remaining float/viewport/event inventory and platform/version acceptance.
General named host-widget styling via hl_group_set remains separate; this slice
uses it only to invalidate prompt resolution. C4 is not complete.

# Session handoff — 2026-10-16 (browser click readiness)

Traced the C4b acceptance failure through guest mouse delivery, shell delivery,
interaction-port resolution, hit testing and cursor commit. The failing trace
received a valid view but returned null before calling hitTest: no published mirror
was available. In successful traces the current ticket was present, hitTest returned
index 60, and the cursor committed row 2 / codepoint column 4. The previous painted
caret alone was not evidence that the current document ticket was available.

Corrected the DOM browser acceptance fixture to require a published mirror and
validate its exact ticket with readBrowserState before measuring/delivering the
click. Native input keeps its own visibility gate (it is not represented by a DOM
attachedWebView). Revision/ownership rejection in production remains unchanged.
This fixes a missing test precondition; it does not promise cursor mapping during
an unavailable/rebuilding document, nor diagnose every historical click timeout.
Temporary production tracing was removed. Existing bounded mouse/shell failure
traces remain in the test, with nested payloads serialized for useful diagnostics.
No user interaction or CUA was needed.

Evidence under .local/review (primary agent; Node 24.10.0, Neovim 0.11.4,
macOS arm64):
- Entry harness exit 0: nvim-click-entry.log; entry dirty-tree inventory:
  nvim-click-entry-status.txt.
- Build/trace exit 1 at the existing click assertion: nvim-click-build.log,
  nvim-click-trace.log. Trace shows received -> null position, no hit-test call.
- Expanded diagnostic build and targeted interaction exit 0:
  nvim-click-build2.log, nvim-click-trace2.log. Diagnostic full Electron and targeted
  interaction also passed: nvim-click-trace3.log, nvim-click-trace4.log. These
  passing diagnostic runs alone were not treated as a production fix.
- After removing production tracing and adding ticket readiness, build and focused
  interaction exit 0: nvim-click-ready-build.log, nvim-click-ready.log.

Final sequential acceptance exit 0 (nvim-click-exit.txt): npm run check
(nvim-click-check.log), npm run smoke:electron (nvim-click-electron.log), and
JUSI_TEST_NATIVE_POPUPS=1 node scripts/run-smoke-electron.mjs
(nvim-click-native.log). Both adapters' Unicode click and focus/input pass.
The earlier C4b default desktop acceptance blocker is cleared on this platform.
Package smoke not repeated: this follow-up changes test readiness/diagnostics only;
prior packaged evidence remains scoped to the preceding checkpoint.

Manual queue remains 1/3: this is test readiness work, not another UI milestone.
Native manual-focus, Linux attention and sibling custom tabline overflow remain
open. No new browser features, sibling edits, commits or publishing.
Next implementation remains C4b prompt highlight-group resolution, then remaining
cursor/options and event/version/platform acceptance, after final checks below.

# Session handoff — 2026-10-16 (C4b decoration/basic cursor slice)

Implemented ADR 0037. RGB highlight attributes now preserve double/dotted/dashed
underlines and strikethrough alongside existing solid/wavy styles. Grid and all
external UI chunks share a tested CSS conversion, preserving special color and
combined underline/strike. mode_info_set cursor-style disablement restores the
host block default. Busy start/stop is immutable completed-frame state and hides
both cursors; external command lines suppress the editor cursor underneath.

C4b is split at this coherent boundary. Prompt group resolution, hl_group_set,
blinking, exact block-cell inversion, language-map attributes, UI option negotiation
and the remaining float/viewport/version/platform inventory are not completed.
No browser feature expansion. The earlier Linux attention/custom Jusi overflow
and native manual-focus follow-ups remain open.

Verification: primary agent, Node 24.10.0 / Neovim 0.11.4 / macOS arm64.
All logs below are in .local/review:
- Entry npm run harness exit 0: nvim-c4b-entry.log.
- Build + screen-state + highlight focused tests exit 0: nvim-c4b-focused.log.
  Tests cover decoration preservation, combined styles/reverse/defaults, style
  enable/disable/re-enable and immutable busy/mode snapshots. Frame test checks
  busy does not leak before flush.
- JUSI_TEST_DISPLAY_ONLY=1 desktop exit 0: nvim-c4b-display.log. Real Neovim
  underline/strike rendering and guicursor disablement pass. Inspected screenshot
  nvim-c4b-decorations.png: styles visibly distinct, text remains cell aligned.
- npm run check exit 0: nvim-c4b-check.log (including build/live).
- Initial npm run smoke:electron exit 1: nvim-c4b-electron.log. All Neovim display,
  nested command/dialog, message and pointer cases passed, including the new
  command-line/editor cursor exclusion. Later browser Unicode click timed out at
  browser-interaction-cases.mjs:92: cursor stayed at column 6, expected 4;
  caretRangeFromPoint still resolved the intended Unicode offset 5.
  Test setup had a Neovim mapping command after click measurement. Moved setup
  before positioning/measurement and reused same-turn native visibility/input
  delivery. This addresses a timing hazard, not a proven production diagnosis.
- Targeted interaction run still failed at that click: nvim-c4b-interaction.log,
  exit 1. Added bounded before-mouse and shell-pointer tracing, emitted only on
  failure. Targeted diagnostic run then passed exit 0: nvim-c4b-click-trace.log.
  No production browser fix is claimed; the failure remains intermittent.
  Mouse listener is removed and shell trace disabled after the assertion.
- Full npm run smoke:electron with tracing again failed exit 1:
  nvim-c4b-electron-final.log, nvim-c4b-electron-final-exit.txt. New display tests
  passed. Trace proves mouseDown/mouseUp reached the guest and browser-pointer
  reached the shell with correct identity/coordinates, but documentRevision was
  undefined and cursor remained unchanged. DOM caret hit still resolves offset 5.
  Missing revision is an observation, not an established cause (the interaction
  contract permits an omitted revision). Remaining investigation is renderer
  ownership/readiness, shared hit-test result and cursor commit; no more blind
  desktop retries. Overall integration acceptance is blocked, not passed.

Manual interaction review deferred; queue 1/3. Saved screenshot inspection is not
CUA. Busy state is covered by unit/frame assertions; no live long-running command
or exact blink/inversion acceptance. Package suite deferred: no runtime/preload/
packaging changes, and the prior browser integration checkpoint is recorded below.

Next: trace the delivered browser hit through renderer ownership/readiness and
cursor commit to resolve this acceptance blocker. Then resolve prompt highlight
group IDs explicitly in the bridge, followed by remaining C4b cursor/options and
C4 inventory acceptance. Do not return to new browser feature
work before the agreed Neovim pass is accounted for.

# Session handoff — 2026-10-16 (browser regression acceptance)

Fixed a reproducible shared cursor projection race: after acknowledged position A,
B could paint while its transport reply was pending, and a return to A was skipped
against the old completed-position cache. Dispatch now invalidates that cache;
only the latest request may commit it. Both adapters have failing-before and
passing-after A/B/A tests, including late B completion. ADR 0023 records the rule.
This is a confirmed defect, not proof that every earlier intermittent caret,
history or click timeout shared this cause.

Synthetic heading/history input now checks native visibility (and keyboard focus)
and sends paired events in the same main-process turn. Added bounded, opt-in
native transition tracing and failure-only caret/history/click diagnostics.
An interrupted acceptance run also exposed E325 for synthetic buffer T00: smoke
runs shared Neovim swap state. The launcher now gives each run XDG_STATE_HOME under
its disposable test directory; no user swap files were removed.

Verification uses primary agent, Node 24.10.0, Neovim 0.11.4, macOS arm64;
logs below are under .local/review:
- Entry harness exit 0: nvim-regression-entry.log.
- Diagnostic packaged workflow and native source interaction passed exit 0 before
  the production change: nvim-regression-package-diagnostic.log and
  nvim-regression-click.log. These demonstrate intermittency, not a fix.
- Rejected scroll-settling hypothesis timed out waiting for scrollY > 0:
  nvim-regression-click-settled.log. That experimental wait was removed.
- First test edit had duplicate const syntax (nvim-regression-projection-before.log);
  corrected failing-before assertion is nvim-regression-projection-before-2.log.
  Build and both-adapter document tests then passed exit 0:
  nvim-regression-projection-after.log.
- Packaged workflow-only after the production fix passed exit 0:
  nvim-regression-workflow-fixed.log.
- npm run check and npm run smoke:electron passed exit 0:
  nvim-regression-check.log and nvim-regression-electron.log.
- Full package attempt: nvim-regression-package-final.log. Default integration,
  native integration and focused interrupted-input/five-refresh lanes passed.
  The aggregate process disappeared during alpha workflow with no exit marker or
  failed assertion; do not count this as a complete passing package invocation.
- Remaining workflow attempt failed exit 1 on E325 (T00 swap collision), before
  browser workflows: nvim-regression-remaining.log and corresponding -exit.txt.
- After state isolation, node scripts/smoke-package.mjs --workflow-only passed
  exit 0: nvim-regression-isolated.log and nvim-regression-isolated-exit.txt.
  Alpha and both browser transports pass, including caret coordinates, heading
  click and Ctrl-O/Ctrl-I history. The complete package matrix has passing evidence
  across sequential runs, not a single uninterrupted full invocation.

Final npm run check (including build/live) after launcher isolation passed exit 0:
nvim-regression-final-check.log. Final harness and git diff --check passed exit 0:
nvim-regression-handoff.log, nvim-regression-handoff-exit.txt; dirty-tree inventory
nvim-regression-status.txt. No additional full desktop rerun after the launcher-only
change: the affected packaged workflow group passed with that launcher.

Combined CUA checkpoint reached in the isolated package. Verified nested expression
command line cancellation restores its parent; multiline message dismissal stays
closed through undo/redo; combining/CJK/emoji cells and following text align in the
saved/live view with both browser adapters composed above the scratch editor.
Direct non-ASCII key synthesis and a literal-newline command were unsuitable test
inputs; corrected commands used nr2char, with no user files involved. An AX click
on native input did not establish a clear handoff (subsequent keys affected scratch
text); native manual focus remains inconclusive. Automated native interrupted
focus and typing passed. Combined review queue reset to 0/3, retaining this explicit
manual focus follow-up; no broad focus/IME acceptance claim.

Older native startup/link-readiness observations remain unexplained. No Linux,
real pending Jusi attention, sibling custom tabline overflow, actual Fugitive push,
other Neovim versions or IME acceptance. R1 remains partial. C4b semantic display
(prompt highlight groups, decorations, cursor/options) is the next implementation
slice after this regression acceptance; browser feature work is not the next step.

# Session handoff — 2026-10-16 (C4a grid cells and event inventory)

## Latest slice: authoritative Unicode grid allocation

Implemented ADR 0036. grid_line items now remain whole cells, including combining
sequences and empty wide-character continuations. Repeat counts repeat cells.
Published runs carry explicit column counts; Unicode cells remain separate and
ASCII of one highlight coalesces. Renderer widths follow Neovim columns, keeping
subsequent text/cursor aligned independently of UTF-16 length and fallback fonts.
Fixed old unit fixtures that incorrectly packed ASCII strings into one cell.

Added NEOVIM-UI-INVENTORY.md, classifying every event in installed Neovim 0.11.4
API metadata, plus a version/platform evidence matrix. C4 is not complete:
prompt group resolution, decorations, busy/cursor semantics, option negotiation,
float/viewport fields and broader font/version/platform acceptance remain.

Verification: primary agent; Node 24.10.0, Neovim 0.11.4, Electron 44.5.0,
macOS arm64. Logs/artifacts below are under .local/review:
- Entry npm run harness exit 0: nvim-c4-entry.log.
- Initial screen test failed only because expected compact runs omitted the new
  columns field: nvim-c4-screen.log. Corrected fixture expectations.
- Build + screen-state + nvim-frame tests exit 0: nvim-c4-focused.log.
  New tests cover combining cells, CJK/emoji continuations, repeated multi-codepoint
  cells, replacement/scroll and immutable prior snapshots.
- Initial JUSI_TEST_NVIM_ONLY=1 desktop exit 1: nvim-c4-desktop.log. Mouse trace
  contained numerous unscripted pointer movements during synthetic drag, consistent
  with desktop interference; the later full source mouse workflow passed.
- JUSI_TEST_DISPLAY_ONLY=1 node scripts/run-smoke-electron.mjs exit 0:
  nvim-c4-display.log. Real Neovim grid text, rendered column coordinates and
  widths, cursor after CJK/emoji, and combining replacement pass.
- Saved screenshot nvim-c4-grid.png inspected: combining text, CJK, emoji and
  following cursor/text aligned. Includes a ZWJ emoji sample, without claiming
  all ZWJ sequences or fonts are accepted.
- npm run check exit 0: nvim-c4-check.log; includes smoke:live.
- npm run smoke:electron exit 0: nvim-c4-electron.log; C0/C2/C3/C4a and standard
  browser interaction pass.
- npm run smoke:package exit 1: nvim-c4-package.log; nvim-c4-exit.txt records 1.
  Default, full native integration, interrupted focus/five-refresh and alpha lanes
  passed. Default browser-workflow lane timed out at browser-workflow-cases.mjs:24
  waiting for mirrored reference-column caret coordinates. Root cause unconfirmed.
- Added failure-only caret coordinate/window/mode diagnostics, then targeted source
  JUSI_TEST_BROWSER_WORKFLOW=1 node scripts/run-smoke-electron.mjs passed exit 0:
  nvim-c4-browser-diagnostic.log. No production change; not proof failure is fixed.
- Remaining native packaged browser lane exit 1: nvim-c4-browser-native.log,
  browser-workflow-cases.mjs:70 waiting for Ctrl-O history navigation after rich
  entry. This differs from the default caret failure; no diagnosis yet.
- Combined manual checkpoint attempt, same package with
  JUSI_TEST_NATIVE_POPUPS=1 JUSI_TEST_REVIEW=nvim-conformance-native: exit 1,
  nvim-c4-manual.log. Failed before checkpoint at browser-interaction-cases.mjs:118
  waiting for a heading click to map Neovim cursor to row zero. No CUA interaction
  occurred. Desktop retries stopped after these concrete failures.

Manual queue reaches 3/3 (C3, focus delivery, C4a). Combined review is due and
blocked before its harness checkpoint, not passed or reset. CUA only inspected
available app inventory; saved screenshot review is distinct from manual review.
Final harness/diff check exit 0: nvim-c4-handoff.log; inventory nvim-c4-status.txt.
Production code stayed frozen during broad suites. The new failure diagnostics
are test-only; the package retains the earlier test module without those diagnostics.

Known limits: explicit allocation does not constrain oversized glyph ink or prove
complex bidi/font shaping. Wide continuations are rendered with the leading cell's
highlight. No Linux, other Neovim versions, actual pending Jusi attention, real
Fugitive push, IME or sibling changes. No publishing/commits. R1 remains partial.

Next: diagnose the three browser integration failures with targeted event/coordinate
traces before repeating package acceptance or the due combined manual review.
Then C4b prompt highlight groups, decorations and cursor/option semantics, following
NEOVIM-UI-INVENTORY.md. Keep older unresolved observations separately recorded.

# Session handoff — 2026-10-16 (focused-test error popup resolved)

The apparent native-child shutdown hang was an uncaught exception in the added
focus tracer, not evidence of a production shutdown defect. The user reported a
native error popup. Capturing uncaught exceptions exposed the first error:
`TypeError: Object has been destroyed` at native-popup-cases.mjs record(), called
by the instrumented shell focus method during child destruction. record() read
child.isFocused() after the child had been destroyed. Electron's default error
dialog blocked the harness until the external watchdog killed it. Subsequent
forced-exit EPIPE/destroyed-object errors in the diagnostic log were secondary.
This corrects the previous handoff's unconfirmed native-close attribution.

Fixed the tracer to check destruction before querying focus and restore original
focus methods and visibility instrumentation in finally, before teardown. The
smoke bootstrap now logs uncaught exceptions and exits nonzero instead of showing
a blocking native error dialog. This is test infrastructure only; the production
focus-request fix from the previous slice is unchanged.

Verification (primary agent, Node 24.10.0, macOS arm64; logs in .local/review):
- npm run harness: exit 0, nvim-dialog-entry.log.
- Captured failure, exit 1: nvim-dialog-capture.log. Exact first exception above.
- JUSI_TEST_NATIVE_POPUPS=1 JUSI_TEST_FOCUS_ONLY=1 node
  scripts/run-smoke-electron.mjs: exit 0, nvim-dialog-fixed.log.
- node scripts/smoke-package.mjs --focus-only: exit 0, nvim-dialog-package.log.
  Rebuilt test package; interrupted focus delivery, chord/typing and all five
  refreshes passed, followed by clean process exit. Aggregate exit 0 captured
  in nvim-dialog-exit.txt. Existing Chromium/unsigned-package diagnostics remain.
- Final harness and git diff --check: exit 0, nvim-dialog-handoff.log.
  Final tree inventory: nvim-dialog-status.txt.

C3 scoped macOS acceptance is complete across sequential runs: the production
code is identical to the previous passing npm run check/default Electron/default
and native package/alpha/both browser-workflow runs; the corrected focused source
and package exits complete that matrix. Did not rerun those passed broad suites
for this tracer/bootstrap-only fix. No claim of a single full-package exit-0 run
or general GUI/platform parity. Prompt group styling remains explicitly in C4.

No CUA or screenshots needed: programmatic exception capture identified the popup
and the repaired process exits verified its resolution. No UI milestone increment;
manual queue stays 2/3. No Linux, real IME/Fugitive/Jusi attention acceptance,
sibling changes, publishing or commits. Existing unrelated changes preserved.

Next: C4 display/event fidelity, prompt highlight-group resolution and the
version/platform matrix. Linux attention/custom Jusi overflow and older C1/C2
unconfirmed observations remain separately open.

# Session handoff — 2026-10-16 (native focus delivery follow-up)

## Latest slice: retain focus requests until delivery

Fixed a reproducible lost-restoration race in NativePopupCoordinator. Calling
Electron WebContents.focus() is asynchronous and does not prove focus was delivered.
Previously restoreFocus cleared the request before calling it. A placement change
could interrupt delivery and the next acknowledgement had nothing to restore.
Keep the request until the actual visible-child focus event (or observed focus),
while retaining active-window/incarnation validation and text-mode cancellation.
ADR 0021 and architecture describe the resulting contract.

The reusable focused harness now interrupts one focus delivery, invalidates the
viewport, and requires the next placement to restore focus. This failed before
the fix (nvim-focus-regression-before.log, native-popup-cases.mjs:72) and passed
its assertions after it, along with chord/typing and five text refreshes. Focus
calls and events are traced; successful trace: .local/review/native-focus-trace.json.
This establishes the specific race, not the cause of every historical timeout.

Primary agent only. Existing unrelated edits preserved. Checks/logs below are in
.local/review; Node 24.10.0, Neovim 0.11.4, Electron 44.5.0, macOS arm64:
- Entry npm run harness exit 0: nvim-focus-entry.log.
- npm run build exit 0: nvim-focus-build.log.
- npm run check exit 0: nvim-focus-check.log (includes smoke:live).
- npm run smoke:electron exit 0: nvim-focus-electron.log.
- npm run smoke:package exit 1: nvim-focus-package.log; aggregate exit captured
  in nvim-focus-exit.txt. Default package, C0/C2/C3 and full native integration
  passed, including the previously failing rich-mode transition. Focused package
  assertions also passed, but its process failed to exit and the runner killed it.
- Initial instrumented package run nvim-focus-diagnostic.log likewise passed
  focus assertions but hung on teardown. Source regression-after.log has passing
  assertions; its exit was not captured before the session resumed, so do not
  count it as an exit-0 suite.
- Narrow teardown probes nvim-focus-cleanup.log and nvim-focus-cleanup-2.log both
  exited 1 (matching *-exit.txt files): direct child close stalled, including after
  confirmed shell focus. These attempted cleanup changes were removed. The final
  harness matches the test module included in the package acceptance build.

Open blocker: native child closure/teardown after the focused repeated-refresh
workflow hangs; normal native integration close passed. Root cause is unconfirmed.
Do not conflate passing focus assertions with a passing focused process or complete
package acceptance. No repeated full-package run. Further close attempts stopped;
independent outstanding package lanes completed with exit 0, captured in
nvim-focus-remaining-exit.txt. Reused the same packaged executable via
node scripts/run-smoke-electron.mjs --package <executable>:
- JUSI_TEST_ALPHA_WORKFLOW=1: nvim-focus-package-alpha.log.
- JUSI_TEST_BROWSER_WORKFLOW=1: nvim-focus-package-browser.log.
- JUSI_TEST_NATIVE_POPUPS=1 JUSI_TEST_BROWSER_WORKFLOW=1:
  nvim-focus-package-browser-native.log.
Existing injected worker errors and Chromium/GPU diagnostics remain in those logs.
Final harness and git diff --check exit 0: nvim-focus-handoff.log; final tree
inventory: nvim-focus-status.txt.

No appearance change or new screenshot review needed. No CUA replay of covered
focus assertions; manual review deferred, queue 2/3. C3's prompt-group styling,
C4 display/event inventory, Linux attention, sibling custom tab overflow and prior
C1/C2 intermittent observations remain open. No Linux build, sibling edits,
real IME/Fugitive/Jusi attention acceptance, publishing or commits.

Next: diagnose focused native child closure/teardown, obtain a clean focused
package exit, then begin C4. Full C3 package acceptance remains incomplete.

# Session handoff — 2026-10-15 (Neovim conformance C3)

## Latest slice: external command lines, messages and dialogs

C3 implementation is present (ADR 0035). Targeted acceptance passes; full packaged
integration acceptance is incomplete due to native focus failures below.
- Retain nested command lines by level; restore parents and correctly decode
  block show/append arguments. Preserve highlighted chunks and immutable snapshots.
- Convert UTF-8 byte positions before measuring rendered caret/completion anchors;
  scroll long command lines to the caret. Preserve completion kind/menu/selected info.
- Forward confirm, input, inputlist and substitution answers to Neovim instead of
  intercepting them with the local pager. Preserve history/error/status highlights.
- Bound each retained message to 128 KiB and each live/history list to 512 KiB,
  200 entries and 4096 chunks per entry; retain scalar-safe suffixes and show
  truncation. Existing display-revision dismissal and streaming tests still pass.
- Unit modules now execute sequentially. Static imports previously overlapped
  async lifecycle tests with CPU-heavy fixtures and triggered a one-second timeout.

Primary agent only; Node 24.10.0, Neovim 0.11.4, Electron 44.5.0, macOS arm64.
Production code frozen during suites. Logs under `.local/review/`:
- Entry `npm run harness`: exit 0, nvim-c3-entry.log. Final harness and
  `git diff --check`: exit 0, nvim-c3-handoff.log. Tree inventory: nvim-c3-status.txt.
- Focused build/overlay state/text/compositor: exit 0, nvim-c3-focused-2.log;
  final build exit 0, nvim-c3-build-final.log.
- `JUSI_TEST_NVIM_ONLY=1 node scripts/run-smoke-electron.mjs`: exit 0,
  nvim-c3-desktop-focused-3.log. Real nested levels, Unicode caret, blocks,
  confirm/input/inputlist/substitution, colored output/history/errors and external
  completion anchor/selection/hide pass, as do C0/C2 regression cases.
- `node src/test/native-child-owner.test.mjs`: exit 0, nvim-c3-runner-focused.log.
- `npm run check`: final exit 0, nvim-c3-check-2.log, including unit, provider,
  worker, document and smoke:live checks.
- `npm run smoke:electron`: exit 0, nvim-c3-electron.log.
- `JUSI_TEST_NATIVE_POPUPS=1 node scripts/run-smoke-electron.mjs`: exit 0,
  nvim-c3-native.log, shared browser/native interaction acceptance.
- `npm run smoke:package`: exit 1, nvim-c3-package.log. Build, default packaged
  C0/C2/C3 and default browser suite passed. Native lane passed shared interaction
  but timed out at native-popup-cases.mjs:109 waiting for child focus after `i`.
- Independent focused lane on the same package: exit 1,
  nvim-c3-package-focus.log (`JUSI_TEST_NATIVE_POPUPS=1 JUSI_TEST_FOCUS_ONLY=1
  node scripts/run-smoke-electron.mjs --package <packaged executable>`). Timeout
  at native-popup-cases.mjs:62 during text refresh; trace shows view becoming
  visible without restoring focus. No active cmdline/completion in failure state.
  Root cause unconfirmed; do not label this fixed or assume unrelated to C3.
  Stopped desktop acceptance. Remaining alpha and both browser-workflow package
  lanes did not run. No blind full-package rerun.

Earlier diagnosed failures:
- nvim-c3-focused.log used old arbitrary popup inset expectations. Corrected to
  pass measured command anchors; focused-2 passed.
- nvim-c3-desktop-focused.log expected inputlist number_prompt; this version emits
  a confirm message plus external command prompt. focused-2 similarly expected
  confirm_sub for substitution, which arrives as a cmdline prompt. Corrected
  assertions to observed protocol; focused-3 passed.
- nvim-c3-check.log: native-child binding timer expired under overlapping module
  evaluation. Sequential test imports resolve the runner overlap; check-2 passed.

Saved screenshot inspection passed for nvim-c3-highlighted-message.png and
nvim-c3-completion.png (colored multiline output and Unicode completion alignment).
No model-driven CUA this slice; manual interaction review deferred, queue 1/3 from
C2's reset. The concrete automated native focus failure stops further desktop
review; use the reusable focused harness for diagnosis before manual acceptance.

Known limits: prompt hl_id is a group ID, unlike chunk attribute IDs. Retain it
but render prompts with default styling rather than unrelated attributes. Explicit
group resolution is C4 work. Grid CJK/emoji/font fallback, styled wrapping metrics,
bidi and broader versions remain unverified. Retained byte limits do not bound an
incoming RPC allocation or Neovim's own history. Linux, real IME, real Fugitive
push/authentication and pending Jusi attention were not tested. No sibling edits,
Linux build, publishing or commits. C1 initial-native-control and C2 link-readiness
observations remain open; Linux attention and custom Jusi tab overflow remain open.
R1 stays partial; other requirement statuses unchanged.

Next: diagnose packaged native rich-mode/refresh focus failure, complete outstanding
package lanes, then C4 display/event inventory, prompt group resolution and the
version/platform matrix. Do not claim full C3 package acceptance or GUI parity.

# Session handoff — 2026-10-15 (Neovim conformance C2)

## Latest slice: explicit-grid editor and tab mouse input

C2 is implemented (ADR 0034), with macOS acceptance:
- Grid-relative press/release/drag and four-direction wheel input, Shift/Control/
  Alt/Meta forwarding, Neovim-owned multi-click detection, and pointer capture.
  Cancellation/lost capture/blur release gestures; fractional wheel deltas
  accumulate into bounded discrete steps.
- Shell-only typed IPC validates live window/grid/tab identities and rejects
  closed, hidden or replaced targets. A root-grid gesture can complete across
  the tab switch it initiates; a new stale-tab press cannot.
- Preserve float mouse_enabled. Empty composition containers no longer intercept
  editor input. Browser surfaces retain their own events and click-to-text mapping;
  modal host command/message/completion UI blocks new editor gestures.
- Real-input acceptance covers cursor placement, drag selection/capture cancellation,
  double-click selection, modifiers, all wheel directions, split resizing, native
  tab click/close, custom tabline callbacks and overlay interception. Shared browser
  fixtures assert no native grid-mouse mapping fires on guest clicks in either adapter.

Overflow finding: Neovim 0.11.4's native tabline reduces label widths and truncates
excess tabs without scrolling to the active tab. The real 41-tab probe and upstream
statusline.c agree. Do not claim native automatic overflow scrolling was implemented.
The host preserves Neovim's cells/click targets. Jusi custom selected-tab fitting
still belongs in the sibling repository; Linux attention remains unresolved.

Primary agent only; Node 24.10.0, Neovim 0.11.4, Electron 44.5.0, macOS arm64.
Production code remained unchanged during acceptance. Accepted commands, exit 0;
all logs below are under `.local/review/`:
- Entry npm run harness; final harness/diff check recorded in nvim-c2-handoff.log.
- npm run build and node src/test/nvim-mouse.test.mjs: nvim-c2-focused-2.log.
- JUSI_TEST_NVIM_ONLY=1 node scripts/run-smoke-electron.mjs:
  nvim-c2-desktop-focused-7.log, nvim-c2-capture-focused.log and
  nvim-c2-wheel-focused.log (successive added acceptance cases, not blind repeats).
- npm run check: nvim-c2-check.log, including all unit/provider/worker/document
  suites and smoke:live. npm run smoke:electron: nvim-c2-electron.log.
- JUSI_TEST_NATIVE_POPUPS=1 JUSI_TEST_REVIEW=nvim-conformance node
  scripts/run-smoke-electron.mjs: nvim-c2-native-review.log. Automated native
  acceptance passed; development CUA checkpoint was skipped due app-identity ambiguity.
- JUSI_TEST_INTERACTION_ONLY=1 node scripts/run-smoke-electron.mjs:
  nvim-c2-interaction-diagnostic.log. Reuses shared cases without copying the harness.
- JUSI_TEST_REVIEW=nvim-conformance-native npm run smoke:package:
  nvim-c2-package-acceptance.log. Full matrix passed: default/native browser
  interaction, delayed native focus/five refreshes, everyday alpha workflow and
  current browser workflows through both adapters. Packaged files include the new
  mouse acceptance module. Final failures: none. Existing injected worker errors,
  invalidGuestInstanceId teardown, unsigned package and platform/GPU diagnostics remain.

Diagnosed failures and open observations:
- Initial build: typed preload method missed by the edit; added sendMouse to both
  preload sources (nvim-c2-build.log).
- Initial pointer fixture used the ten-character ruler width as one cell; divided
  by ten (nvim-c2-desktop-focused.log). Drag trace then showed synthetic moves had
  buttons=0 and Chromium lost capture; added leftButtonDown. Assertions also needed
  renderer settlement before issuing a blocking Neovim command (focused-2/3 and
  nvim-c2-drag-diagnostic.log). These were test delivery defects.
- Tab fixture confused the visible-only snapshot with the full tab list; recorded
  the first handle before switching. Native overflow expectations were incorrect:
  long names are shortened and sufficiently many tabs are truncated. Corrected the
  fixture after reading upstream behavior (focused-4/5/6 logs).
- First packaged manual run entered a malformed multiline review command, then
  failed the later text-off insert-mode wait (nvim-c2-package.log, smoke-electron
  line 218). The review checkpoint now explicitly restores normal mode and dismisses
  local/Neovim pagers before continuing. The final packaged review resumed successfully.
- nvim-c2-package-final.log failed the pre-existing link cursor/text readiness wait.
  Focused diagnostics and final full package passed without a production change.
  Root cause is unconfirmed. Failure now reports cursor, current line, mode and
  text status. Retain this observation; do not claim it fixed by a passing rerun.
  C1's earlier initial-native-control timeout also remains unconfirmed.

Combined manual review completed at queue 3/3 using existing review checkpoints.
Development Electron shares an identity with the user's already-running app;
CUA selected that existing window for inspection only, and made no changes to it.
Used the isolated test package for actual review instead. DOM checkpoint confirmed
editor click/drag selection and attention-colored tab cells. Native checkpoint
showed both adapters and the editor composed together, multiline message output,
Enter dismissal remaining dismissed across undo/redo, restored browser surfaces,
and split resizing beneath the native browser. CUA AX/screenshots are in the
session tool record; checkpoint logs are nvim-c2-package.log and the final accepted
package log. Corrected the malformed manual command with a literal escaped newline.
Manual queue reset to 0/3. No broad browser safety or platform-parity claim.

No Linux execution/rebuild, real Fugitive push/authentication, real IME, physical
trackpad tuning, or real pending Jusi attention acceptance. No sibling repo changes,
publishing or commits. Existing unrelated edits preserved; final tree inventory is
nvim-c2-status.txt. R1–R7 remain partial or blocked.

Next: C3 nested external command lines, byte/cell-correct cursor/highlight chunks,
confirm/input/error/history/completion behavior and bounded streaming message bytes.
Then C4 display/event fidelity and the version/platform matrix.

# Session handoff — 2026-10-15 (Neovim conformance C1)

## Latest slice: completed frames and stable tab identities

Started the authorized [Neovim conformance pass](NEOVIM-CONFORMANCE-PLAN.md).
C1 is implemented with scoped macOS acceptance (ADR 0033):
- Capture renderer snapshots at flush, including multiple flushes and a trailing
  partial frame in one notification. Timers coalesce completed snapshots only.
  Grid/highlight/overlay/geometry state cannot leak through direct publication or
  initial-state IPC. Initial IPC returns the published frame/generation pair.
- Keep ownership and provider identity invalidation immediate. Region navigation
  now uses a separate shell-only, ticket/window/revision-checked live read instead
  of treating getInitialState as a cursor query. Native interaction retains its
  existing live read. Exit/disposal suppresses queued publication.
- TabClosed reconciles previously published handles against nvim_list_tabpages.
  Tab numbers are no longer sent as handles. Live tests close a reordered tab
  whose number differs from its handle, verify all tabs/windows and preserve the
  surviving browser session. A separate compound-creation probe also matched.
- Corrected acceptance fixtures: streaming now uses a real paused/resumed shell
  process, releases it on failure, and waits for rendering; link activation waits
  for the exact live Neovim line/text readiness through both adapters. Added an
  opt-in bounded JUSI_TEST_FRAME_TRACE for redraw/native-report ordering diagnostics.

Primary agent, Node 24.10.0, Neovim 0.11.4, Electron 44.5.0, macOS arm64. Sequential
verification with code frozen while each batch ran. Accepted commands, exit 0:
- npm run check: `.local/review/nvim-conformance-final-check.log` (includes build,
  all unit/provider/worker/document suites and expanded smoke:live).
- npm run smoke:electron: `nvim-conformance-electron-final-2.log`.
- JUSI_TEST_NATIVE_POPUPS=1 JUSI_TEST_FRAME_TRACE=1 node scripts/run-smoke-electron.mjs:
  `nvim-conformance-native-trace.log` (final both-adapter fixture correction;
  source native interaction/focus/placement/close passed).
- JUSI_TEST_FRAME_TRACE=1 npm run smoke:package: `nvim-conformance-package-final-4.log`.
  Full package matrix: default and native interaction, delayed-focus/five refreshes,
  alpha workflow, and both-adapter current browser workflows. Final trace artifact:
  `nvim-frame-trace.json` (last process's bounded trace).
- Focused development build/unit/live: `nvim-conformance-focused.log`.
  Live interaction-read unit and reading workflow: `nvim-conformance-live-read-focused.log`.
  Shell streaming fixture: `nvim-conformance-desktop-focused-2.log`.
All abbreviated artifacts above are under `.local/review/`. No production code
changed after final-check; subsequent edits corrected shared test synchronization
and diagnostic output, exercised by the full final package suite.

Failures diagnosed before follow-up runs:
- Initial desktop output assertion in `nvim-conformance-electron.log`: nvim_echo
  emits replace_last=true, so the old fixture was testing replacement, not append,
  and its earlier pass sampled old paint. Raw evidence: message-probe/out-write
  logs. Replaced with real shell stream and render synchronization. The first
  shell fixture used unescaped !, which Neovim expanded as shell history (E34);
  raw shell-escape probe confirmed it. Replaced with equivalent `until test`.
- `nvim-conformance-electron-accepted.log` failed region settlement because the
  newly cached presentation frame was incorrectly used as a live cursor read.
  The separate validated interaction API fixes that production dependency.
- `nvim-conformance-final-electron.log` failed link activation: the fixture's
  row>=2 readiness condition accepted an earlier frame while text was rebuilding;
  action diagnostics showed row 0 and no ready revision. Exact readiness now
  waits on live Neovim. The intermediate DOM-only fixture query then failed native
  acceptance in `nvim-conformance-package-final-2.log`; the final assertion is
  shared across transports and no longer assumes attachedWebViews includes native.
- `nvim-conformance-native-focused.log` timed out at initial popup control creation
  (native-popup-cases line 32). A diagnostic source run and full final package
  passed afterward. Root cause remains unconfirmed; do not claim it fixed.
  Retain bounded redraw/viewport/ack traces on recurrence rather than blind retries.
- Passing suites retain injected worker rejection, existing invalidGuestInstanceId
  teardown, unsigned package and platform/GPU diagnostics. No final assertion failed.

No new appearance or uncovered interaction was introduced. No CUA replay or new
visual acceptance claimed; automated native/browser composition and input checks
were retained. Manual review deferred; UI queue 2/3 including the prior message
slice. No Linux execution, real IME, user-config/Fugitive push, or Linux attention
reproduction; custom Jusi overflow is still external work. No publishing/rebuild
of Linux assets. Existing unrelated edits preserved. R1–R7 remain partial or blocked.

Next: C2 explicit-grid native editor/tab pointer routing (press/release/drag/wheel,
modifiers and multi-click), preserving overlay and both-browser-adapter ownership.
Then C3 external UI lifecycle and C4 display/event fidelity. Keep the initial
native-popup control timeout as an open integration observation.

# Session handoff — 2026-10-15

## Latest slice: Neovim message lifecycle and integration review

ADR 0032 fixes the host pager's retained-output replay: dismissal uses per-entry
monotonic display revisions rather than a global snapshot signature. New output
and repeated identical commands still display. Streaming follows the tail until
the user scrolls back; updates preserve that viewport. Escape/q now acknowledge
real Neovim return prompts, as Enter already does. Only the protocol kind denotes
a prompt. Added msg_history_clear and six-field cmdline_show compatibility.

[NEOVIM-INTEGRATION-REVIEW.md](NEOVIM-INTEGRATION-REVIEW.md) records the assessment:
sound ownership/transport foundation, incomplete GUI protocol/input conformance.
Priorities are flush-boundary publication, TabClosed number/handle reconciliation,
native grid mouse/tab input, and cmdline/dialog/Unicode fidelity. These findings
are not fixed or marked accepted by this message lifecycle slice.

Tabs: actual sibling Jusi attention_tabline loaded with mocked summaries produces
the gold highlight in the real host bridge. Desktop assertions verify native
custom-tabline highlight display, redefinition and removal. A 60-column/ten-tab
probe reproduces Jusi custom overflow keeping the tail visible after selecting
the first tab. Native tabline and custom formatting are separate, and the host
currently forwards no native tab mouse/wheel input. No sibling repo edits made.
Linux attention color failure remains unreproduced; requested build/tabline/HL
diagnostics while attention is pending. No claim of a Linux fix.

Verification: primary agent only, macOS arm64, Node 24.10.0, Neovim 0.11.4,
Electron 44.5.0. Code frozen during each sequential verification batch. Exit 0:
- Entry npm run harness: `.local/review/nvim-integration-entry.log`.
- Focused overlay unit: `nvim-integration-overlay.log`.
- Focused build and JUSI_TEST_NVIM_ONLY=1 node scripts/run-smoke-electron.mjs:
  `nvim-integration-focused-3.log`. Includes real :! return prompts with Enter
  and Escape, tail/scrollback, dismissal then undo/redo/tabs, repeat output and
  tab highlight lifecycle. The reusable cases also run in the default suite.
- npm run check (includes build/unit/provider/worker/document/live suites):
  `nvim-integration-check.log`.
- npm run smoke:electron: `nvim-integration-electron.log`.
- npm run smoke:package: `nvim-integration-package.log`; full default, native,
  delayed-focus, alpha and both-adapter browser workflow matrix. Test package
  inclusion list now includes scripts/nvim-integration-cases.mjs.
- Sibling/native tab probe: `nvim-tabs-probe.log` and its .mjs script.
- Final npm run harness and git diff --check: `nvim-integration-handoff.log`.
All abbreviated log names above are under `.local/review/`.

Failure diagnosis: initial focused desktop run exited 1 waiting for G to reach
new output (`nvim-integration-desktop-focused.log`, cases line 19). The fixture
sent G without Shift and used literal backslash-n rather than Lua newlines.
Corrected the fixture; focused-2 passed, then added real shell-prompt/screenshot
coverage and focused-3 passed. No application retry workaround added. Full suites
contain expected injected worker errors, existing guest teardown invalidGuestId
and macOS process-policy diagnostics; no final acceptance assertion failed.

Inspected saved screenshots `nvim-message-tail.png` and `nvim-tab-attention.png`:
last streaming line sits above the prompt; gold attention label is visible.
No live CUA replay: covered interactions have automated assertions. Manual review
deferred, queue 1/3 since the prior checkpoint. Real Fugitive/network push,
Linux runtime, user's actual attention event delivery/configuration and broad
Neovim GUI parity were not tested. No publishing or Linux rebuild performed.
Requirements remain partial/release-blocked. Existing unrelated edits preserved.

Next: reproduce Linux attention with the requested diagnostics; implement the
review's flush/tab-identity milestone, then native mouse/tab conformance. Fix
custom overflow in the owning Jusi tabline in its own session. The push's actual
network/authentication delay is not diagnosed by fixing message presentation.

# Session handoff — 2026-10-14

## Latest slice: browser navigation and reading state (2026-10-14)

ADR 0031 is implemented. This section supersedes earlier default-routing/float
notes below; the previous slices remain historical evidence.

- Ordinary clicks/Ctrl-J retain the current document, including target=_blank.
  Explicit Ctrl-J supplies a user gesture, fixing Chromium history skipping.
  Cmd/Ctrl-click (also Shift/middle-click) and text Ctrl-N use foreground Neovim
  link tabs. Both mouse phases are consumed; modifiers reset across focus boundaries.
  Ctrl-Q closes presentations; link tabs preserve their source. Private link tabs
  retain the existing fresh-session semantics.
- Scripted popups use `JusiWebAllowPopup` and retained Chromium children in horizontal
  Neovim splits by default. No production auxiliary BrowserWindow handler is installed.
  Exact Session/opener and source-owned lifetime remain. Native grid placement now
  uses ordinary split bounds; a toolbar row is reserved only in debug mode.
- Ctrl-L writes the actual current URL to `*` through both transports and text mode.
  Browser identity binds even with text extraction off. Rich-mode entry applies
  pending authoritative layout before focusing, preventing split-switch focus loss.
- Vim statuslines show profile/private scope and `Text ready` only for ready state.
  Browser bottom controls are debug-only; non-browser readiness controls remain.
- `JusiWebPause` retains published text and stops automatic reparsing; stale guest
  maps are still revoked. `JusiWebResume` catches up and reenables updates.
  `JusiWebRefresh` works while paused. Navigation still builds an initial mirror.
- The user's letter-per-line “Jump up to” report reproduced with CSS-clipped
  screen-reader labels in a two-column reference fixture. Ancestor zero-area clips,
  fully inset clips and display/content-visibility suppression are excluded from
  the visual mirror. Accessibility content in the actual page is unchanged.

Verification: primary agent only; Node 24, macOS arm64, sequential commands with
implementation frozen while checks ran. Final accepted commands all exit 0:
- `npm run check`: `.local/review/browser-workflows-check-accepted.log`.
- `npm run smoke:electron`: `.local/review/browser-workflows-electron-accepted.log`.
- `npm run smoke:package -- --workflow-only`:
  `.local/review/browser-workflows-package-workflows.log`. Fresh package exercised
  everyday navigation/forms/tabs/splits/retry/off/close, then both adapters' new
  clipped-reference, pause/manual/resume, statusline, copy, history, Cmd/Ctrl-click,
  Ctrl-N and Ctrl-Q cases.
- Final documentation `npm run harness` and `git diff --check`: exit 0,
  `.local/review/browser-workflows-handoff.log`.
- Focused development alpha regression and both-adapter workflows:
  `browser-workflows-enter-focused.log`, `browser-workflows-both-modifiers-dom.log`,
  `browser-workflows-both-modifiers-native.log`, all under `.local/review/`, exit 0.
- Targeted CUA review at the shared `browser-workflows` checkpoint confirmed one
  app frame with a horizontal source/child split, both Vim profile/readiness
  statuslines, projected caret and no ordinary page badges. Screenshot is in this
  session's CUA output; checkpoint execution log: `browser-workflows-native-review.log`.
  The DOM source and native child were both visible in the same reviewed frame.
  Manual-review queue reset to 0/3; no extra CUA replay of covered workflows.

Failures diagnosed before reruns:
- `browser-workflows-clipped-before.log` fails specifically on the accessibility
  label entering the mirror. Both-adapter final workflows pass after filtering.
- Synthetic Ctrl-J navigation lost browser history without userGesture; fixed and
  covered. Direct Chromium background-tab adoption hung, so the final implementation
  uses the established Neovim link-tab path (ADR 0031).
- Text-off/private popup commands lacked guest identity; fixed in readiness binding.
  Focused/full desktop popup command, private Session and opener tests now pass.
- Earlier check failures were stale style-signature fixture length and missing
  mock `clip`; fixed, then full check passed. The headless split-size assumption
  was replaced with an ordinary-window assertion; desktop geometry is exercised.
- Full `npm run smoke:package` in `browser-workflows-package-final.log` exited 1 at
  alpha ordinary-link navigation after its default/native/focus suites had passed.
  Native modifier transitions needed renderer blur resets; the next alpha run
  exposed pending-layout rich-entry ordering. Both were fixed; the affected alpha
  and new both-adapter package workflows were rerun successfully on the final code.
  The entire package matrix was not repeated after those focus fixes.
- Passing desktop logs include intentional worker rejection fixtures and some
  Electron teardown/GPU diagnostics; no final acceptance assertion failed.

Known limits: real Wikipedia/Mixcloud sessions were not replayed; the supplied
reference-label pattern and continuously changing text were tested deterministically.
Arbitrary CSS clipping, shadow/frame text, durable rewrap anchors, cross-platform
modifier behavior, real OAuth/media/IME and release/security gates remain open.
No signed release, Linux checks, publishing or remote creation was performed.
Next: user real-page testing, then remaining M3/M4 integration acceptance. Keep
R1–R7 partial/release-blocked; this slice does not establish browser-safety parity.


## Latest slice: browser reading usability (2026-10-14)

Implemented ADR 0030 across both browser adapters:
- Ctrl-J activates mapped text inside links, buttons, summary/label, common ARIA
  controls, inline handlers/tab stops and pointer-cursor elements. Disabled/inert
  controls are rejected. Links now use DOM click semantics so page handlers run.
- Tab/Shift-Tab in Neovim navigation mode cycle scroll owners represented in the
  mirror, including root, preferring visible destination text. Both shell keyboard
  paths preserve Shift. Shared navigation queues read authoritative Neovim state
  between commits; stale session/window/incarnation/revision results are rejected.
- Neovim saves each window's view before invalidation and restores the nearest
  identical line and byte column after commit. Repeated invalidations retain the
  original anchor; deleted/changed lines fall back to clamped row/column.
- Relevant mutations revoke stale guest jobs/maps immediately, then batch revision
  notices with 400 ms quiet time / 1500 ms maximum. Thumbnail resource changes,
  textless paint changes and unchanged cached text styles no longer force builds.
  Resize, fonts, actual text and relevant visibility/style changes still refresh.

Verification: primary agent, Node 24, sequential checks, implementation frozen
while suites ran; final commands all exit 0. Logs under `.local/review/`:
- `npm run harness`: `browser-usability-entry.log`.
- Focused build, observer/controller both-adapter tests and headless Lua anchor
  tests: `browser-usability-focused.log`; serialized region tests additionally in
  `browser-usability-race-focused.log`.
- `npm run check`: `browser-usability-final-check.log` (build, unit, provider,
  worker/document/package-conformance and live smoke).
- `npm run smoke:electron`: `browser-usability-final-electron.log`.
- `JUSI_TEST_READING_ONLY=1 JUSI_TEST_NATIVE_POPUPS=1 node
  scripts/run-smoke-electron.mjs`: `browser-usability-final-native.log`.
- `npm run smoke:package`: `browser-usability-package.log`; default/native shared
  reading cases, native refresh-focus and A2 workflow pass in the macOS package.
- Final harness/diff check: `browser-usability-final-docs.log`.

Shared desktop cases cover nested/disabled/custom controls, actual Tab/Shift-Tab
keyboard delivery, rapid ordered region requests, anchored insertion refresh and
paint-only mutation filtering. Lua tests cover independent windows, repeated
invalidations, clamped missing anchors and old-ticket rejection. Unit tests cover
bounded batching, visibility changes and late region results after ownership change.
Expected injected worker/extraction errors and unsigned-package/system warnings
remain. Packaged A2 teardown again logged invalid guestInstanceId without a failed
assertion. No Linux rebuild/upload, Linux execution or real YouTube test was run.

Combined manual/CUA review was triggered at queue 3/3. Added opt-in checkpoints to
existing shared fixtures (`JUSI_TEST_REVIEW=1`, or one stage such as
`reading-controls`); signal `.local/review/browser-review-continue` to resume.
`JUSI_TEST_READING_ONLY=1` focuses affected acceptance without copying the harness.
Observed both adapters' cap/retry UI and typed `qreview` while limited, followed by
successful automated recovery. Sampled history/zoom and region navigation. Manual
review found physical Shift-Tab moving forward: both main's interception and the
renderer fallback dropped Shift. Fixed both; the initial Neovim-string-only test
could not catch this. Actual-key desktop assertions now cover both transports.
DOM manual retest confirmed Tab then rapid Tab/Shift-Tab returns to the same region.
Native post-fix physical-key verification is automated, not another CUA replay.

Diagnostic logs: `browser-usability-review-dom.log` (initial manual run, exit 0;
visual Shift-Tab failure despite automated pass); `browser-usability-review-native.log`
(exit 1, reading assertion after unsynchronized rapid-key fixture), then focused
`browser-usability-race-native.log` (exit 0). The fixture now waits for a settled
expected destination before moving to the next action. `browser-usability-key-dom.log`
(exit 1) identified physical Shift-Tab still intercepted as plain Tab in main after
only the renderer fix. `browser-usability-key-dom-final.log` (exit 0) verifies the
main fix and the targeted CUA retest. No blind reruns. No claim that the initial
manual failure alone established an async race; queue serialization separately
covers rapid commands and uses current Neovim state at execution.

Manual batch queue reset to 0/3, with an open observation: immediate AX state after
rapid native back/forward/zoom input showed the prior history hash. Stable automated
history assertions pass; rapid native history was not manually accepted. Track this
with existing native focus/parking limits, rather than claiming full input parity.

Limits: this is filtered/batched full extraction, not incremental parsing.
Continuously changing real text can still supersede a long build. Resource-only
reflow, whitespace-only child changes and CSSOM changes can require manual refresh;
text wrapping may remain stale while live ranges still project current geometry.
Textless/canvas/delegated controls without detectable semantics and shadow/frame
content remain outside this coverage. Text anchors can be ambiguous after editing,
rewrapping, duplication or navigation in the same session. Synthetic click does not
supply trusted browser activation for restricted APIs. Requirements remain partial;
no browser safety parity or broad performance acceptance claimed. Existing edits
preserved; no agents or remote publishing.

Next: user tries the source build on their page layouts; measure real YouTube
playback/infinite-scroll churn, then pursue incremental text updates/durable source
anchors if actual text remains too volatile. Rebuild Linux test assets only when
requested. Existing A4 startup/restart and alpha quickstart remain open.


## Latest slice: Linux test assets rebuilt with namespace fix (2026-10-12)

At the user's explicit request, rebuilt and replaced both Linux x64 downloads in
https://github.com/notawhaleble/jusi-neovim/releases/tag/v0.1.0-test:
- `jusi-neovim-0.1.0-test-20261012-linux-x64.tar.gz`
- `Jusi.Neovim-0.1.0.AppImage`
- `linux-x64-20261012-SHA256SUMS.txt` (now covers both formats)
- `LINUX-TESTING-20261012.md`

Both binaries contain the `jusi_neovim` namespace fix. Release notes and attached
instructions require a fresh extraction directory so obsolete `lua/jusi` files
cannot survive an overlay upgrade. Asset names are unchanged; users must download
fresh copies. Prerelease retained; no source branch/tag moved. Notes disclose the
uncommitted working-tree build and generated-source-archive mismatch.

Verification, primary agent, Node 24, sequential builds, exit 0:
- `npm run harness`: `.local/review/linux-namespace-entry.log`.
- `npm run dist:linux:portable:x64`: `linux-namespace-portable.log`.
- `npm run dist:linux:x64`: `linux-namespace-appimage.log`.
- Extracted AppImage with cached 7zz; checked archive and AppImage ELF x86-64,
  executable permissions, production entry, absence of old Lua namespace and
  exact matches for 73 shipped files per format: `linux-namespace-artifacts.json`.
- `gh release upload --clobber`, notes update and remote digest/size verification:
  `linux-namespace-upload.log`, `linux-namespace-release-after.json`; all four
  uploaded assets match local SHA-256 and sizes, release notes match, prerelease true.
- Final harness/diff check: `linux-namespace-final.log`, exit 0.
All paths above are under `.local/review/`.

Portable SHA-256: `9e19811c4ffe74c6de3e7e702b78b1c61c5948c8c2c9c19e37aeb67fc7795074`.
AppImage SHA-256: `1e85d359bc75a29e8e469263a0d9de21ba0474ae5bb3e10ad1230d4e7c42c223`.

Initial ad-hoc archive validation expected generated `.d.ts` files; inspection
confirmed electron-builder excludes those declarations. Corrected the verifier to
compare shipped runtime files; both formats passed without rebuilding. Existing
asar-disabled and Linux desktopName packaging warnings remain.
Reused the preceding namespace slice's successful native/lazy coexistence,
`npm run check`, source Electron and macOS package suites; no runtime source changed
since those checks, so they were not rerun. No Linux desktop/sandbox/IME execution
available; cross-build/content checks are not Linux runtime acceptance. No CUA;
deferred review queue remains 2/3. Requirements unchanged, existing edits preserved.

Next: user retests the fresh Linux download with their normal notebook configuration;
continue A4 startup/restart and alpha quickstart.


## Latest slice: host/notebook Lua namespace separation (2026-10-12)

Fixed normal-config startup collision: bundled host Lua modules now live under
`jusi_neovim`, leaving `jusi` to the independent notebook plugin. Updated runtime
callbacks, bridge calls, bundled web provider, existing Markdown/worker conformance
fixtures and current API docs. No compatibility alias under `jusi`; external
providers targeting the old experimental host imports must migrate. ADR 0029 records
the boundary. User notebook setup and installed notebook package need no changes.

Package conformance now installs a separate `jusi` fixture, calls its setup during
user init with the host runtime prepended, and checks root/submodule identity before
and after provider operations. Native, early-setup and lazy.nvim configurations pass.
This validates namespace coexistence, not full notebook feature integration.

Verification, primary agent, Node 24, sequential, code frozen during suites; exit 0:
- Entry `npm run harness`: `.local/review/namespace-entry.log`.
- Focused `npm run test:packages`: `.local/review/namespace-focused.log`; includes
  pinned lazy.nvim as well as native configurations.
- `npm run check`: `.local/review/namespace-check.log` (build, unit, Lua, live smoke).
- `npm run smoke:electron`: `.local/review/namespace-electron.log`.
- `npm run smoke:package`: `.local/review/namespace-package.log`; macOS default,
  native integration, focused refresh and A2 workflow checks passed.
- Final `npm run harness` and `git diff --check`: exit 0;
  `.local/review/namespace-final.log`.

No failing assertions. Expected worker-error/injected extraction diagnostics remain;
packaged A2 teardown again logged invalid guestInstanceId without a failed assertion.
Unsigned package warnings remain. No Linux execution or full notebook end-to-end
acceptance. No CUA: namespace change covered by automated startup and integration
checks; manual review deferred, UI queue remains 2/3. Existing edits preserved.
No release upload or Linux distribution rebuild; existing downloaded binaries still
contain the old namespace and must be replaced with a build containing this fix.
Requirements remain partial; only namespace evidence/path references updated.

Next: rebuild the Linux test download when requested, then confirm the user's normal
notebook configuration on Linux. Continue A4 setup/restart and alpha quickstart.


## Latest slice: FUSE-free Linux test download (2026-10-12)

User explicitly requested building/uploading to the existing fake/test GitHub
release, superseding the default no-publishing scope for this task. Added
`npm run dist:linux:portable:x64` (electron-builder tar.gz, explicit x64).
Existing AppImage commands/assets remain. README describes portable launch.
No application runtime or sandbox configuration changed; no branches/tags moved.

Uploaded to https://github.com/notawhaleble/jusi-neovim/releases/tag/v0.1.0-test:
- `jusi-neovim-0.1.0-test-20261012-linux-x64.tar.gz`
- `linux-x64-20261012-SHA256SUMS.txt`
- `LINUX-TESTING-20261012.md`

Remote digest matches local SHA-256:
`f7b2f0c72044344b84f0901660ee500361b333595cc539f6f82d673f25cf4402`.
Prerelease status and original AppImage retained. Notes disclose current dirty
working-tree build based on 49031173bb2d93928f7f8a5d5855cbc7165ac837; original tag
and generated source archives do not represent all binary source changes.

The archive runs directly from an extracted user-owned executable location,
without FUSE or AppImage extraction into /tmp. The reported /tmp AppRun EPERM
cause is unconfirmed (possible execution policy); this format avoids that path,
not arbitrary OS restrictions. Neovim is still external. No no-sandbox workaround.

Verification, primary agent, Node 24, sequential suites, exit 0:
- `npm run harness`: `.local/review/linux-download-entry.log`.
- `npm run check`: `.local/review/linux-download-check.log`.
- `npm run dist:linux:portable:x64`: `.local/review/linux-download-build.log`.
- `npm run smoke:package`: `.local/review/linux-download-package.log`; macOS
  default/native/focused/A2 checks passed, not Linux execution evidence.
- Archive inspection: `.local/review/linux-download-archive.json`; ELF x86-64,
  executable permission, safe member paths, production entry point and exact
  runtime/preload/provider resource matches, no smoke entry or local secret files.
- Upload/remote verification: `linux-download-upload.log`,
  `linux-download-remote.json`; all published assets under the existing release.
- Final harness: `linux-download-harness-final.log`; diff review and
  `git diff --check` exit 0.
All logs above are under `.local/review/`. Expected extraction-failure diagnostics
in A2 and unsigned-package warnings remain. The Docker info client panicked;
`docker version` established the daemon is unavailable (`linux-download-docker.log`).
No usable Linux runtime; Linux desktop/sandbox/IME checks not run, requirements
unchanged. No separate source desktop rerun: packaging-only command change,
packaged suite covered the affected boundary. No CUA; deferred UI queue stays 2/3.

Next: user tests Linux archive launch and reports exact remaining startup errors.
Continue A4 setup/restart and quickstart for local alpha; optimization stays deferred.


## Latest slice: A2 everyday workflow accepted (2026-10-12)

User deferred further optimization. A1 stays partial with measured Unicode cost
and strict slice-budget assessment recorded; it is no longer the immediate work.
A2 now passes one combined default-adapter workflow in source and packaged builds:
real link/history/reload/zoom commands, retained form input through rich/text mode,
same-buffer tab moves, ordinary editor tabs and splits with explicit ownership,
failed extraction with rich input still working, retry, text-off input/close, and
fresh session/guest on reopen. Uses existing shared command/focus cases plus
`scripts/alpha-workflow-cases.mjs`; no production runtime behavior changed.

Run focused source coverage with `JUSI_TEST_ALPHA_WORKFLOW=1 node
scripts/run-smoke-electron.mjs`; package isolation is `npm run smoke:package --
--workflow-only`. Full package smoke now includes this workflow in its existing
single test build. Production package contents remain unchanged.

Verification (Node 24, primary agent, sequential, all final exit 0):
- Entry `npm run harness`: `.local/review/alpha-workflow-entry.log`.
- Focused workflow: `.local/review/alpha-workflow-focused.log`.
- `npm run check`: `.local/review/alpha-workflow-check.log`.
- `npm run smoke:electron`: `.local/review/alpha-workflow-electron.log`.
- `npm run smoke:package`: `.local/review/alpha-workflow-package.log`, including
  default/native integration, native focused regression, and A2 default workflow.
- Final `npm run harness` and `git diff --check`: exit 0;
  `.local/review/alpha-workflow-harness-final.log`.

Initial focused failures were fixture issues: tab attachment was checked before
shell rendering; ordinary editor cursor was read from a browser layout snapshot
that only updates cursor movement for browser buffers; an injected function was
returned through Electron's structured-clone boundary. Corrected waits, direct
Neovim editor assertions and a void injection result. Final focused log supersedes
those runs. Injected extraction errors are expected. Chromium overlay diagnostics
remain; source close also logged an invalid guestInstanceId during teardown, without
failed lifecycle assertions. No observed default-workflow blocker in this scope.

No manual/CUA review this slice: automated acceptance only, no new product UI.
Deferred UI queue remains 2/3; A3/A5 real IME/manual acceptance is still open.
Native refresh-focus historical timeout remains unexplained despite passing current
regressions. No Linux or browser-security acceptance; requirements stay incomplete.

Next: A4 reproducible local build/launch, normal versus clean configuration,
startup failure feedback, profile persistence across restart and shutdown; write
an alpha quickstart. Then combined A3/A5 manual review and final checkpoint, with
an explicit disposition for partial A1 before declaring local alpha accepted.


## Latest slice: A1 automatic publication timing (2026-10-12)

Added default-adapter timing mode to the existing Electron fixture/runner, with
three trials each for words, wrapped text and mixed Unicode, plus mutation and
navigation cancellation. Observes automatic production extraction, guest content
paint, real key delivery, published shell state and host-renderer long tasks/timer
gaps. Independently checks the marker in Neovim and all non-whitespace units in the
published mirror. See ALPHA-TIMING.md for boundaries and commands. No guest host API.

Found an actual alpha-path problem: the 200k mixed Unicode fixture exceeded the
10-second text deadline. Targeted isolated extraction took 11.064 s, sampled activity
almost entirely geometry. Shared token grouping now reuses same-line geometry;
groups over 1,024 normalized units split before native Range queries. Keeps existing
whitespace/newline behavior and deadline. Initial unbounded grouping delayed first
paint; bounding improved completion but did not resolve slow Unicode initial paint.

Final `.local/review/alpha-timing-all.json` (Apple M1, 16 GiB, macOS arm64, Node
24.10.0, Electron 44.5.0 / Chromium 152.0.7977.130):
- Words: publication observed 763–784 ms, content paint 61.9–84.8 ms.
- Wrapped: publication 1049–1065 ms, content paint 56.6–81.3 ms.
- Unicode: publication 8603–8653 ms, content paint 856.7–865.5 ms.
- Input p95 6–8 ms across normal trials. No host-renderer long tasks observed;
  host timer gaps peaked at 20.5 ms. These are scoped observations, not all-UI proof.
- Superseded mutation/navigation markers never published; replacements reached
  Neovim. Input/content assertions passed. A1 remains partial: Unicode margin/paint
  cost and strict extraction slice budget remain. Native end-to-end timing deferred.

Verification, primary only, code frozen during sequential suites:
- Entry npm run harness: exit 0, `.local/review/alpha-timing-entry.log`.
- Focused build and extraction limits: exit 0, `alpha-timing-focused.log`,
  `alpha-timing-bounded-build.log`; grouped words/tabs/empty-line cases exit 0,
  `alpha-timing-group-tests.log`.
- JUSI_TEST_ALPHA_TIMING=1 node scripts/run-smoke-electron.mjs: final exit 0,
  `alpha-timing-verified.log`; full measurement matrix and content verification.
- npm run check: exit 0, `alpha-timing-check.log` (includes build/smoke:live).
- npm run smoke:electron: exit 0, `alpha-timing-electron.log`.
- npm run smoke:package: exit 0, `alpha-timing-package.log`; default/native shared
  interaction and native focused delayed-acknowledgement cases passed.
- Final npm run harness and git diff --check: exit 0,
  `alpha-timing-harness-final.log` (harness).

Diagnostic history: `alpha-timing-first.log` failed at Unicode publication after
six passing trials. Focused `alpha-timing-unicode.log` reproduced error status with
no map/publication; artifact `alpha-timing-unicode-failure.json` retained.
`alpha-unicode-isolated.log` / `extraction-performance-unicode-diagnostic.json`
established 11.064 s geometry cost. Grouping passed three Unicode trials
(`alpha-timing-unicode-fixed.log`); bounded grouping passed the full matrix
(`alpha-timing-all.log`), then final full-content assertions passed the verified
matrix. No blind reruns or extended document deadline. Expected superseded-text,
worker-rejection, unsigned-package and system diagnostics remain.

No CUA/screenshot review: algorithm/measurement change with automated content and
geometry coverage, no new UI workflow/layout. Deferred queue stays 2/3. Existing
native refresh-focus timeout remains unexplained; no Linux, real IME or release
security acceptance. Existing edits preserved; no agents, publishing or remote work.

Superseded next step: user deferred further optimization on 2026-10-12. Unicode
layout/first paint and slice-budget assessment remain later work; proceed through
A2 and the remaining local-alpha gates with A1 partial.


## Current delivery target: local alpha (2026-10-11)

User selected the scoped local alpha as the next finish line. LOCAL-ALPHA.md now
bounds it to the current macOS arm64/default browser presentation and five gates:
responsive automatic text; core workflows; input/layout; reproducible local setup;
final acceptance. Native in-window popups remain experimental and opt-in. Their
shared regressions still run when affected, but their complete backlog does not
block the default alpha. Known native refresh-focus timeout remains open.

Next implementation: A1 end-to-end automatic extraction timing in the existing
Electron fixtures, observing rich paint, host renderer stalls, real input and
Neovim publication. Then work through A2–A5 without expanding to deferred features.
All alpha gates remain open; no readiness, browser parity or milestone closure is
claimed. The wider requirements and dependency gates remain unchanged.

Documentation-only milestone: existing edits preserved; no source changes, agents
or remote actions. Entry/final npm run harness: exit 0, `.local/review/alpha-entry.log`
and `.local/review/alpha-harness-final.log`; document review and git diff --check:
exit 0. Build, desktop, package, benchmark and CUA not rerun because execution
behavior is unchanged. Deferred manual queue stays 2/3; A3/A5 allow one combined
manual session at the alpha checkpoint under the existing review policy.


## Latest slice: measured wrapped-text extraction (2026-10-11)

Added an isolated sandboxed Chromium benchmark using the existing Electron runner:
JUSI_TEST_EXTRACTION_ONLY=1 JUSI_TEST_PERF_LABEL=latest node scripts/run-smoke-electron.mjs.
It records machine/runtime, cooperative slices, input-event delivery, first contentful
paint and guest/main timer gaps. These exclude Neovim publication and host renderer
UI; R2/M3 performance acceptance remains partial. See M3-PERFORMANCE.md for method,
exact measurements and caveats. Extraction-only runs preserve other review artifacts.

On Apple M1 / 16 GiB / macOS arm64 / Node 24.10.0 / Electron 44.5.0 / Chromium
152.0.7977.130, 200k wrapped text improved from 5852.6 ms to 1084.5 ms (~5.4x) with
200,000 units and 2,410 visual lines retained. Shared extraction now recursively
splits ranges across visual lines instead of querying each character's geometry;
mapping copies check the cooperative clock every 1,024 units. Both adapters execute
this same source. No new UI or provider API. Slice p95 was 8 ms for words/wrapped
text, 8.6 ms for unwrapped text; strict 8 ms acceptance is not established. Wrapped
input p95/max was 6/8 ms (42 samples). No input samples in the short unwrapped case.

Artifacts: `.local/review/extraction-performance-baseline.json` and
`.local/review/extraction-performance-verified.json`. Single runs, not repeated
statistical trials. Geometry verification moved after measurement to avoid test
work inflating timer gaps; `perf-final.log`'s 53.2 ms gap is superseded, not a
claimed runtime stall fix. Mutation cancelled extraction with no published map;
retry extracted the replacement text. Real-browser line geometry and exact modeled
80-unit wrap boundaries/range-call reduction pass.

Verification (primary only; existing edits preserved):
- npm run harness at entry: exit 0, `.local/review/perf-entry.log`.
- Focused build/extraction-limit tests: exit 0, `perf-focused.log`,
  `perf-focused-final.log`; strengthened geometry tests: `perf-geometry-final.log`.
- Focused benchmark: exit 0 for baseline, range split, final and corrected timing
  (`perf-baseline.log`, `perf-range-split.log`, `perf-final.log`, `perf-verified.log`).
- npm run check: exit 0, `.local/review/perf-check.log`, including build/smoke:live.
- npm run smoke:electron: exit 0, `.local/review/perf-electron.log`.
- npm run smoke:package: final exit 0, `.local/review/perf-package-boundary.log`;
  DOM/native interaction, cap recovery and native focused regression all passed.
- Final npm run harness, git diff --check, benchmark/runner syntax checks: exit 0;
  `.local/review/perf-harness-final.log` records harness output.

Failures: strengthened unit fixture initially expected totalTextLength 2048, omitting
25 visual-line separators; corrected expectation to 2073 (`perf-geometry.log`).
First package run (`perf-package.log`, exit 1) had expected Neovim cursor/text ready
but no browser caret after the limit fixture. That fixture sent the rich-to-text
chord and immediately mutated the page. Added the missing focus-exit wait before
mutation; packaged DOM/native suites then passed. No extra runtime fix; prior event
ordering was not traced. There is no focused packaged cursor/limit workflow, so the
existing package suite was used after this fixture correction. Earlier refresh-focus
timeout still has no established cause and remains open.

Manual/screenshot review deferred: extraction algorithm and benchmark change, with
meaningful geometry/input assertions and no new UI workflow/layout. Queue remains
2/3 (commands; cap reporting). No CUA, image inspection, Linux, real IME or release
security acceptance. No agents or remote actions. Existing expected worker/system/
unsigned-package diagnostics remain.

Next: end-to-end automatic extraction/publication timing and host renderer stalls
through both adapters; measure normalization/tokenization phases before tuning the
remaining unwrapped-slice overshoot. Add representative Unicode/layout cases and
repeated trials. Do not infer the 50 ms host UI gate from guest/main timer probes.


## Latest slice: focused native focus regression (2026-10-11)

Extracted browserFocusCases from the shared interaction workflow, preserving both
adapter coverage. Added JUSI_TEST_FOCUS_ONLY=1 to the existing native fixture and
`npm run smoke:package -- --focus-only`; no copied smoke harness. Focused failures
emit a bounded 100-event visibility/focus trace. Full package smoke additionally
runs the focused delayed-acknowledgement regression against its existing build.

Diagnosis: baseline focused development and package runs passed. Deliberately
holding one shell animation frame for 150 ms and invalidating the native viewport
reproduced the cancelled-chord assertion failure: trace showed visible:false then
blur, the input retained x, and the assertion ran before acknowledgement. The old
single focus sample cannot distinguish intentional parking from permanent loss.
The shared assertion now waits for bounded focus restoration (and native visibility)
and verifies the same active input and retained value. The delayed-acknowledgement
case passes after this change. No production code or focus ownership rule changed.
This establishes a flaw in the assertion; the previous package run had no trace,
so its precise event ordering is not proven. The older refresh-focus timeout is
still unexplained, not declared fixed by passing reruns.

Verification: primary only, macOS arm64, Node 24.10.0, Electron 44.5.0 / Chromium
152.0.7977.130. Existing working tree preserved; no agents or remote actions.
- Entry npm run harness: exit 0, `.local/review/focus-retention-entry.log`.
- JUSI_TEST_NATIVE_POPUPS=1 JUSI_TEST_FOCUS_ONLY=1 node scripts/run-smoke-electron.mjs:
  baseline exit 0 (`focus-retention-focused-before.log`); delayed-frame regression
  before assertion fix exit 1 (`focus-retention-delayed-ack-before.log`, expected
  reproduction); after fix exit 0 (`focus-retention-delayed-ack-after.log`).
- node scripts/smoke-package.mjs --focus-only: baseline exit 0,
  `.local/review/focus-retention-package-before.log`.
- npm run check: exit 0, `.local/review/focus-retention-check.log`; includes build,
  unit/Lua conformance and smoke:live.
- npm run smoke:electron: exit 0, `.local/review/focus-retention-electron.log`.
- npm run smoke:package: exit 0, `.local/review/focus-retention-package.log`;
  default DOM suite, full native suite, delayed-acknowledgement focus regression and
  five text refreshes all passed in the same package. Expected fixture-rejection,
  unsigned-package and system diagnostics remain.
- Final npm run harness and git diff --check: exit 0,
  `.local/review/focus-retention-harness-final.log` (harness).

No CUA or screenshot inspection: test-only milestone; deterministic automation
resolves the sampled-focus assertion concern. No production UI change, so deferred
manual queue stays 2/3 (commands; extraction limits). Linux, real IME, extraction
performance measurements and release/security gates were not run. Full focus
parity remains open. The genuine prior refresh timeout retains failure diagnostics;
use the focused harness if it recurs instead of repeated broad workflows.

Next: measured extraction performance for 200k text and huge wrapped nodes,
mutation/cancellation, rich first paint and input latency. Address synchronous
work only where measurement identifies a bottleneck; keep timing limits explicit.


## Latest slice: explicit browser extraction limits (2026-10-11)

Both adapters now show “Text limit reached · retry” when shared extraction exceeds
its output, mapping, source-work or visited-text-node budgets (ADR 0028). No partial
mirror/map is published. Retry and mutation recovery retain existing revision
checks. Large-node normalization and wrapped-word geometry now yield internally;
this is not measured performance acceptance. Exact 200k character and line bounds,
overflow, excluded nodes, source scanning and supersession have unit coverage.

Primary-only verification, macOS arm64 / Node 24.10.0 / Electron 44.5.0 / Chromium
152.0.7977.130. Existing working-tree edits preserved; no agents or remote changes.
- Entry npm run harness: exit 0, `.local/review/caps-entry.log`.
- Focused npm run build, extraction-limits and browser-document tests: exit 0,
  `.local/review/caps-focused.log`.
- npm run check: exit 0, `.local/review/caps-check-final.log`; includes build,
  extraction/controller conformance, Lua workflows and smoke:live.
- npm run smoke:electron: exit 0, `.local/review/caps-electron-final.log`.
- JUSI_TEST_NATIVE_POPUPS=1 node scripts/run-smoke-electron.mjs: exit 0,
  `.local/review/caps-native-final.log`.
- npm run smoke:package: **exit 1**, `.local/review/caps-package.log`. Packaged DOM
  suite passed; both adapters passed the new visible limit/retry/rich-input/recovery
  cases. Native run then failed the existing `cancelled chord must leave rich input
  focused` assertion (browser-interaction-cases.mjs): value `x` arrived, subsequent
  document.hasFocus() was false. This differs from the prior refresh-focus assertion;
  no common cause or fix is established. Do not claim packaged focus acceptance.
  Failure-only visibility/WebContents/document/shell diagnostics added afterward;
  that logging branch is not re-exercised. No blind rerun.

Attempts: two full checks (second after fixing the exact empty-line boundary), three
standard desktop runs, two native desktop runs, one package run. Initial standard
run reached `limited` but its new input fixture sent only a char event and timed out
on value `q` (`caps-electron.log`). Matching the established keyDown/char/keyUp
sequence and focusing the field after guest focus passed (`caps-electron-input.log`,
`caps-native.log`). No runtime fix was made for this fixture failure. Final boundary
fix accepts exactly 200,000 empty lines without attempting to add another line.
Expected worker-rejection/system/unsigned-package diagnostics remain.

Manual/screenshot review deferred: new status uses existing text-status controls and
both-adapter automated assertions cover label, retry and rich input. Queue 2/3:
reload/history/zoom; extraction limit/retry/recovery. No live CUA or screenshot
inspection. The concrete packaged focus failure is reported, not manually accepted.
No Linux, real IME, rich-first-paint/input-latency/slice-p95 measurements or release
security gates run. No claim of browser safety parity or 8 ms/50 ms timing compliance.

Next: isolate native focus loss across shell parking/acknowledgement using the exact
packaged failure and added diagnostics; existing harness has no focused focus-only
mode, so add a reusable mode before further broad reruns. Then measure extraction
performance (200k text, huge wrapped node, mutation/cancellation, input latency),
including remaining synchronous normalization transforms/tokenization/layout work.
Final docs checks recorded in `.local/review/caps-harness-final.log` and diff check.


## Current policy: delegation stopped again (2026-10-11)

User revoked test delegation after the shared commands milestone. AGENTS.md now
requires primary-only execution; selective manual/CUA review and the 1/3 deferred
queue remain. Superseded policy backed up at
`docs/implementation/backups/AGENTS.luna-testing.2026-10-11.md.bak`.

Local rollout token_usage_record audit now provides actual recorded usage for the
shared-commands feature turn (not the earlier transcript-size estimates): primary
GPT-6 Astra, 46 responses, 7,326,189 input (7,161,600 cached; 164,589 uncached),
11,805 output including 2,666 reasoning; Luna, 70 responses, 2,835,005 input
(2,759,168 cached; 75,837 uncached), 6,714 output including 98 reasoning.
Audit artifact: `.local/review/commands-token-audit.json`.
Primary inputs grew from 140,536 to 171,660 tokens per response. Fourteen parent
wait calls and six agent follow-ups added repeated long-context processing.
Primary verification/debugging phase alone: 37 responses, 5,929,895 input,
6,483 output. This was excessive orchestration for the feature. Real fixes were
needed, but repeated broad fixtures, polling and handoff corrections added avoidable
work. Luna routing was confirmed by its local turn_context model record; routing
failure was not the cause. Quota conversion and other concurrent usage are unknown;
the preceding rate-limit snapshot had a different reset window, so this is not a
clean measured 80-percentage-point quota delta.

Policy-only change. No application or CUA tests rerun. Documentation verification
is recorded in `.local/review/primary-policy-harness.log` and git diff --check.


## Latest slice: shared reload/history/zoom (2026-10-11)

Both browser adapters use one key parser and WebContents command dispatcher for
reload, back/forward and document zoom. Missing capabilities, destroyed contents
and dispatch exceptions return unhandled; navigable-history boundaries are no-ops.
Native views now receive the existing browser shortcuts. Composition/Alt/key-release
guards apply. Shared real keyboard fixtures verify history, zoom factors/reset and
reload completion before running existing interaction regressions. See ADR 0027.

The new sequence exposed a DOM-only delayed forced zoom extraction that could
outlive navigation and reset Neovim's cursor. Removed it: both adapters reset
projections and rely on shared resize/reflow tracking to rebuild text.

Verification delegated to one fresh-context agent requested as gpt-6-luna/low,
reused for all follow-ups. Primary implemented/diagnosed; no duplicate successful
checks or CUA. Serving-model/token/cached-token telemetry unavailable. This is
implementation milestone 1 of the three-milestone delegation experiment; no savings
claim. macOS arm64, Node 24, Electron 44.5.0 / Chromium 152.0.7977.130.
- Entry harness, focused build and browser command unit tests: primary, exit 0;
  `.local/review/commands-entry.log`, `commands-build.log`.
- npm run check: exit 0 before and after runtime correction; final
  `.local/review/commands-check-final.log` includes build and smoke:live.
- npm run smoke:electron: final exit 0, `.local/review/commands-electron-final.log`.
- JUSI_TEST_NATIVE_POPUPS=1 node scripts/run-smoke-electron.mjs: final exit 0,
  `.local/review/commands-native-final.log`.
- npm run smoke:package: diagnostic rerun exit 0,
  `.local/review/commands-package-diagnostic.log`; both adapters passed keyboard,
  interaction and lifecycle cases. IMPORTANT: earlier package failure below is not
  established fixed by this passing rerun.

Final primary docs review: npm run harness exit 0
(`.local/review/commands-harness-final.log`), git diff --check exit 0.

Attempts: two full check runs, five standard desktop runs, two native desktop runs,
two package runs. Failure-only diagnostic excerpts are retained in the fixtures.
Initial history test created script-only entries Chromium would not traverse;
canGoBack was false despite entries and Ctrl-O delivery. User-activated fixture
entries fixed that (commands-electron.log, commands-history-diagnostic.log).
Subsequent cursor tests showed authoritative cursor reset to 0 during projection;
removed the delayed DOM zoom extraction (commands-electron-history-fixed.log,
commands-geometry-diagnostic.log). Native fixture injected input during navigation
parking; it now waits for visibility (commands-native.log).

Known unresolved failure: commands-package.log timed out on native focus retention
after text refresh, after shared command/interaction cases passed. Added failure-only
visible/WebContents/document/shell focus diagnostics; the package rerun passed and
emitted none. No cause is established and no fix for this intermittent failure is
claimed. This limits broad focus acceptance, not the directly observed command cases.
Keep diagnostics for the next occurrence; do not blindly rerun or call focus parity
complete. Expected rejection/system/unsigned-package diagnostics remain.

Manual/screenshot review deferred: automated key/history/factor/reload assertions
cover this command slice, no layout redesign. Queue 1/3: reload/history/zoom both
adapters. No CUA or image inspection performed. Focus-retention failure remains open
for targeted investigation rather than being marked manually verified.

Next: investigate intermittent refresh-focus retention if reproducible, then text
extraction performance and visible cap reporting. Other rich link/copy/window
accelerators, full zoom/DPI coordinates, IME, Linux and release/security gates remain.


## Selective manual review policy (2026-10-11)

User requested fewer computer-use regression checks. AGENTS.md and AGENT.md now
keep automated checks but remove mandatory CUA and screenshot review on each slice.
Targeted manual review is triggered by uncovered new interactions, unresolved
visual/focus issues or native/OS flows; otherwise batch after three UI-affecting
milestones with deferred review or at the next browser integration/release checkpoint.
Luna performs required review; primary consumes its report without duplicating it.

Manual review queue: shared reload/history/zoom; extraction limit/retry/recovery. Deferred UI-affecting milestone count: 2/3.
Baseline: shared mode-key/focus slice already manually reviewed. For each later
UI-affecting milestone record reviewed or deferred, changed workflows and the counter.
Deferral is not verification and does not close release/security gates.

Policy-only verification: npm run harness exit 0
(`.local/review/ui-policy-harness.log`), policy diff review and git diff --check.
No build, desktop, package or CUA run: no execution code changed. Primary handled
these quick documentation checks; no agent spawn or usage-savings claim.


## Current testing policy experiment (2026-10-11)

User renewed Luna delegation. AGENTS.md now assigns substantial verification,
routine triage and supported interactive/artifact review to one GPT-6 Luna/low agent
with a fresh brief, reused within a milestone. Primary retains implementation and
acceptance decisions without duplicating successful checks or UI inspection.
Previous primary-only policy is backed up in
`docs/implementation/backups/AGENTS.primary-testing.2026-10-11.md.bak`.
No exact token/billing breakdown was available to the primary for the preceding turn;
visible transcript estimates are not billed usage. Next three implementation
milestones should record actual usage if available, or explicitly mark unavailable.
Application behavior and required acceptance checks are unchanged.
Policy verification: fresh agent requested as gpt-6-luna/low, no history fork;
harness exit 0 (`.local/review/luna-policy-harness.log`), diff check exit 0, backup
and policy reviewed. Serving-model/token telemetry unavailable; no savings claim.
No build, desktop or package suite rerun for this policy change.


## Previous slice: shared mode keys and focus/input conformance (2026-10-11)

Both browser adapters now use BrowserModeKeys for clean close and the timed text-mode
chord. Modifier/key-release handling, expiry, cancellation and composition guards
are shared. Blur/full navigation/destruction discard prefixes; DOM window-command
prefixes also reset. Native identity-checked mode/close dispatch remains intact.
A real DOM focus-loss test exposed that WebContents blur does not reflect webview
element blur reliably. The trusted shell now forwards element blur to a shell-only
registered-guest reset handler. It only discards input state; no guest IPC was added.
See ADR 0026. Remaining browser accelerators still need shared dispatch.

Verification (primary only, macOS arm64 / Node 24 / Neovim 0.11.4 / Electron 44.5.0):
- Entry npm run harness and focused BrowserModeKeys tests: exit 0.
- npm run build: exit 0, `.local/review/focus-build.log`.
- npm run check: exit 0 before and after the DOM fix; final log
  `.local/review/focus-check-final.log`. Includes build and smoke:live.
- npm run smoke:electron: final exit 0, `.local/review/focus-electron-complete.log`.
- JUSI_TEST_NATIVE_POPUPS=1 JUSI_TEST_MANUAL=1 node scripts/run-smoke-electron.mjs:
  exit 0, `.local/review/focus-manual.log`. The same desktop fixture passes focus-loss
  cancellation (Ctrl-N actually reaches the page), real typing, a fresh chord with
  intervening modifier input, return to rich mode and retained field value.
- CUA manually typed ` focus`, used Ctrl-backslash/Ctrl-N to focus Neovim, used i
  to return to the same input, appended ` restored`, then closed with Ctrl-Q. AX and
  live screenshot confirmed focus/value; the harness exited 0 after close.
- npm run smoke:package: exit 0, `.local/review/focus-package.log`; both adapters
  pass expanded shared interaction/focus cases in the shipped runtime/preload.
- Final npm run harness: exit 0, `.local/review/focus-harness.log`; diff review and
  git diff --check passed.
- Inspected `.local/review/presentation.png` after the standard run (local content,
  cursor and Text ready), plus the native live screenshot.

Failure diagnosis: focus-electron.log and focus-electron-final.log stopped on a
WebContents focus assertion. Document-level observations established that API did not
track embedded DOM focus. focus-electron-observed.log then exposed the actual stale
prefix after blur; fixed with the shell element-blur reset. focus-electron-accepted.log
passed cancellation and typing but hit one leftover WebContents focus assertion;
changed it to document.hasFocus. No runtime code changed after final check; only that
fixture assertion and docs followed. Expected worker-rejection, unsigned/asar and
system diagnostics remain. No sub-agents or remote changes.

Next: shared browser command dispatch for reload/history/zoom, with both-adapter
acceptance. Real IME/composition, rapid cross-tab races, Linux, zoom/DPI coordinates,
complex selections and performance/caps remain open. Synthetic composition unit tests
prove only the guard, not real IME support. Browser safety parity remains blocked.


## Previous slice: authoritative shared selection spans (2026-10-11)

Neovim resolves per-line regions with getregionpos and the active selection option.
The bridge carries validated half-open code-point spans; both browser adapters use
one UTF-16 mapper and one multi-range projection. Exclusive/reversed selections and
ordinary visual blocks now follow editor ranges rather than reconstructed corners.
Legacy producers retain inclusive endpoint compatibility. Option changes refresh the
snapshot. See ADR 0025 for boundaries and remaining selection cases.

Primary-only verification, macOS arm64 / Node 24 / Neovim 0.11.4 / Electron 44.5.0:
- npm run harness at entry: exit 0.
- npm run build: exit 0, `.local/review/selection-build.log`.
- Focused mapping and both-adapter controller tests: exit 0.
- nvim --headless -u NONE -l scripts/test-selection.lua: final exit 0. Covers
  exclusive/inclusive, reversed, composing characters, blocks, short/empty rows,
  partial-cell suppression and the 10,000-line work bound.
- npm run check: exit 0, `.local/review/selection-check.log` (includes Lua selection
  tests via test:documents, plus build and smoke:live).
- npm run smoke:electron: exit 0, `.local/review/selection-electron.log`.
- JUSI_TEST_NATIVE_POPUPS=1 JUSI_TEST_MANUAL=1 node scripts/run-smoke-electron.mjs:
  exit 0, `.local/review/selection-manual.log`. Shared real-browser geometry fixture
  passed forward/reversed exclusive selection, a two-line block and clear-on-Escape.
  CUA manually selected a 2x2 block: whole emoji on one line, bc on the next; live
  screenshot matched. Escape/i restored rich navigation, input retained appended
  ` selection`, trusted Close finished the harness.
- npm run smoke:package: exit 0, `.local/review/selection-package.log`; both adapters
  passed the same expanded interaction fixture in the shipped runtime.
- Inspected `.local/review/presentation.png` before the native run: local content,
  cursor and Text ready visible; inspected the live native block screenshot as well.

Initial focused Lua assertion failed because short-line virtual space was treated
like a partial in-text cell and suppressed the entire block. Corrected the distinction:
virtual space contributes no text; genuinely partial tab/wide cells suppress projection.
All full suites passed on first run after that fix. Expected worker-rejection and
unsigned/asar/system diagnostics remain. No sub-agents, no remote changes.

Limits: block dollar-motion, partial-cell geometry, complex grapheme/bidi/cross-node
cases and selections beyond the line cap are not complete. Neovim operations remain
authoritative even when the browser projection is suppressed. Linux, IME/composition,
zoom/DPI and browser release/security gates were not run or established by this slice.
Next: bounded shared focus/input conformance across adapters; retain the explicit
selection backlog instead of expanding this slice indefinitely. R1–R7 remain partial
or release-blocked. Final npm run harness: exit 0,
`.local/review/selection-harness.log`; diff review and git diff --check passed.


## Previous slice: shared Unicode text coordinates (2026-10-05)

Shared browser mapping now translates Neovim code-point columns to/from UTF-16 DOM
and mirror offsets. Cursor writes use byteidxcomp, matching strchars counting of
composing marks. Inclusive selection endpoints normalize order before extending
across a complete code point and following marks; cursor geometry does the same.
Both adapters use the shared functions (ADR 0024).

A stronger click test found DOM webview mousedown never received real guest input.
The previous heading test could pass with an already-reset cursor and did not prove
click delivery. Main now forwards host-observed guest mouse events, tagged with
session/incarnation/window/revision, to shared hit testing through the trusted shell.
No guest IPC was added. The test now starts at a different position and verifies a
click after both an emoji and combining accent reaches the correct Neovim column.

Primary-only verification, macOS arm64 / Node 24.10.0 / Neovim 0.11.4 / Electron 44.5.0:
- npm run build: exit 0, `.local/review/unicode-build.log`.
- Focused text-mapping and both-adapter conformance tests: exit 0.
- npm run check: final exit 0, `.local/review/unicode-check-final.log`.
- npm run smoke:electron: final exit 0, `.local/review/unicode-electron-fixed.log`.
- npm run smoke:package: exit 0, `.local/review/unicode-package.log`; both transports
  pass the same real Unicode cursor/selection geometry and click roundtrip fixture,
  plus link/scroll/retry and prior lifecycle/security assertions.
- JUSI_TEST_NATIVE_POPUPS=1 JUSI_TEST_MANUAL=1 node scripts/run-smoke-electron.mjs:
  final exit 0, `.local/review/unicode-manual-final.log`. The existing review mode
  retains the Unicode sample. CUA clicked it, entered editor mode, selected the whole
  emoji with 0lv, then selected e plus combining accent; both live screenshots showed
  the appropriate highlight. Escape/i returned to rich mode and trusted Close passed.
- Inspected `.local/review/presentation.png`: ordinary local rich page, cursor,
  isolated scope and Text ready remain visible.
- npm run harness and git diff --check: exit 0; harness log is
  `.local/review/unicode-harness.log`. Reviewed current docs and requirements evidence.

Failures: unicode-electron.log and unicode-click-diagnostic.log exposed missing DOM
mouse delivery (Chromium hit offset was correct, Neovim cursor unchanged, no element
mousedown). Fixed transport and reran desktop/check suites. First native review
(unicode-manual.log) reached the strengthened heading click before the native view
finished its command-triggered placement; moved the visibility wait after the cursor
command. Final manual and packaged runs passed. No runtime changes after final check;
only that fixture ordering adjustment and docs followed. Existing intentional worker
rejection diagnostics and unsigned/asar warnings remain. No sub-agents used.

Next: shared selection semantics (exclusive and block selections), complex grapheme/
bidi/cross-node cases, then broader focus/input and performance/cap acceptance. The
current inclusive mapping is not full Unicode or selection conformance. Zoom/DPI,
IME, native composition, Linux and browser release/security gates remain open.
Native child presentation stays opt-in; R1–R7 remain partial or release-blocked.


## Previous slice: shared browser interaction (2026-10-05)

Both transports now use browserInteraction for link activation, scroll/projection,
click-to-cursor conversion/validation and text retry. Renderer-only orchestration
was removed. Main routes native-owned targets to their adapter and enriches commands
with session/incarnation, authoritative cursor and mirror revision. It flushes pending
state before commands; DOM interaction reads pending state independently of painting.
Native document commands survive temporary compositor parking, while actual hidden-tab
and stale identities are rejected. Pointer input still requires a visible native view.

Native trusted text status is now a rebuild button using a current control token.
Cursor writes carry a ticket and Lua atomically checks buffer/incarnation/session,
revision and current tab before committing. No document IPC was added. See ADR 0023.

Final verification, primary only, macOS arm64 / Node 24.10.0 / Neovim 0.11.4 /
Electron 44.5.0 (all listed final commands exit 0):
- npm run check: `.local/review/browser-interaction-check-accepted.log`, including
  unit/adapter conformance, real Neovim, package installation and smoke:live.
- npm run smoke:electron: `.local/review/browser-interaction-electron-accepted.log`.
- npm run smoke:package: `.local/review/browser-interaction-package-accepted.log`;
  both adapters execute scripts/browser-interaction-cases.mjs for actual Ctrl-J,
  Ctrl-E, pointer input and trusted rebuild, alongside existing lifecycle gates.
- JUSI_TEST_NATIVE_POPUPS=1 JUSI_TEST_MANUAL=1 node scripts/run-smoke-electron.mjs:
  `.local/review/browser-interaction-manual.log`. CUA clicked rebuild, clicked the
  paragraph, used Ctrl-\/Ctrl-N and observed cursor at 2,7 on the clicked text;
  i returned to rich mode, input retained appended ` interaction`, Close completed.
  This ran before the final DOM pending-state fix; final packaged cases cover that fix.
- Inspected `.local/review/presentation.png`, `packaged-presentation.png` and live
  native screenshot: rich content, cursor and trusted text status remain visible.
- Shared unit cases also cover malformed hit results, hidden/replaced/wrong-window
  rejection, late hits after revision change, authoritative cursor versus old view
  state, revision mismatch and recovery from failed text extraction.
- Final npm run harness: exit 0, `.local/review/browser-interaction-harness.log`;
  documentation review and git diff --check passed. No code changes after final suites.

Failures diagnosed and resolved: first build exposed missing incarnation in attached
state; added it. Desktop link failures exposed commands overtaking rendered cursor
state; an initial fixture wait did not resolve the renderer lag. Captured diagnostics
led to authoritative command cursor/revision. Native commands were dropped during
transient parking; ownership now governs document operations. Packaged startup first
omitted the new shared fixture from its test-only file list; fixed. Packaged link
acceptance then exposed pending mirror state, resolved by flushing state and reading
it before paint. Earlier failing logs: browser-interaction-electron.log,
-electron-rerun.log, -diagnostic.log, -diagnostic2.log, -trace.log, -native.log,
-package.log and -package-final.log under `.local/review/` with the same prefix.
Temporary trace instrumentation was removed. Expected worker-rejection diagnostics,
unsigned/asar package warnings remain; some development runs also logged guest teardown
Invalid guestInstanceId diagnostics without failed assertions. No sub-agents used.

Next: shared character mapping (Neovim columns versus DOM string offsets, Unicode and
selection acceptance), then broader focus/input conformance and text performance/cap
reporting. Zoom/DPI coordinates, IME, overlapping native composition, Linux, real OAuth,
devices/TLS and release/security acceptance remain open. Basic interaction evidence does
not establish full parity. Native child presentation stays opt-in; R1–R7 remain partial
or release-blocked. Older entries below are historical where superseded.


## Previous direction: capability-based work and boundary audit

User requested shared capability naming and justified special cases. Updated
AGENTS.md, PLAN.md M3 and native integration gates accordingly. No runtime change.

Review found shared text/projection is implemented, but full interaction parity is
not: main.ts sends scroll/link events only to the renderer, and renderer/app.ts still
owns cursor/index conversion, scroll-followed-by-projection and link focus handling.
These are shared browser interaction gaps, not reasons for a second child engine.
Move behavior to shared code; retain coordinate/focus transport adapters.

Necessary distinctions: window-open authorization and actual Chromium child adoption
preserve opener, POST and exact Session; parent/child lifetime follows the explicitly
chosen auxiliary-window policy. WebContentsView composition, acknowledgement and
OS focus differ from DOM webview hosting, but are native transport concerns. Neovim
float allocation is presentation placement. None warrants separate parsing/mapping.

Verification: npm run harness and git diff --check exit 0; reviewed action handlers
and current roadmap. Build/desktop/package suites not rerun for this documentation
and working-agreement change. Previous implementation evidence remains below.


## Previous slice: shared browser document controller (2026-10-05)

BrowserDocumentController now owns optional text, mutation refresh, cancellation,
deadlines, validation/publication sequencing and cursor/selection mapping for both
DOM webviews and retained native children. Removed the independent NativePopupText
engine and renderer mapping/job duplication. Thin adapters supply execution and
publication; native ownership/layout/focus remain explicit (ADR 0022). Worker text
remains separate. Basic popup cursor and visual selection now project onto rich content.

Verification, primary only, macOS arm64 / Node 24 / Neovim 0.11.4 / Electron 44.5.0:
- npm run build: exit 0, `.local/review/shared-browser-build.log`.
- Focused renderer/native lifecycle and shared adapter conformance tests: exit 0.
  Shared cases cover initial publish, mutation, malformed extraction, retry,
  projection deduplication and invalidated operations through both adapters.
- npm run check: exit 0, `.local/review/shared-browser-check.log`; includes smoke:live.
- npm run smoke:electron: exit 0, `.local/review/shared-browser-electron.log`.
- npm run smoke:package: exit 0, `.local/review/shared-browser-package.log`;
  ordinary and gated native paths, including the native cursor overlay assertion.
- Reusable manual fixture: exit 0, `.local/review/shared-browser-manual-final.log`.
  CUA used Ctrl-\/Ctrl-N, j/v/l and observed cursor plus two-character visual
  selection on the popup paragraph. Escape/i restored input focus; typing appended
  ` shared` to retained input; trusted Close completed the fixture.
- Inspected `.local/review/presentation.png`: ordinary local rich page, cursor,
  isolated scope and Text ready. Live CUA screenshot confirmed native projection
  below the trusted toolbar. No sub-agents used.
- Final npm run harness: exit 0, `.local/review/shared-browser-harness.log`;
  documentation diff review and git diff --check passed. No runtime edits after suites.

The first manual run expired during context handoff (shared-browser-manual.log);
one restart completed the review. No application failure was found in final suites.
Packaged unsigned/asar warnings remain expected. Removed-file evidence was updated
from NativePopupText to its adapter before harness verification.

Next: shared browser interaction (PLAN.md M3): factor remaining renderer-only
cursor/index conversion and action orchestration into shared behavior, route both
adapters by exact identity, and expose trusted retry. Then run adapter conformance.
Unicode mapping, shadow/frame coverage and performance/caps are shared browser work.
Native composition/zoom/DPI and transport focus/IME acceptance remain separate from
new-window opener/session/lifetime policy. Linux, real OAuth/devices/TLS and
release/security gates remain. Native child presentation stays opt-in. R1–R7 retain
incomplete status. Older entries are historical.


## Previous slice: optional native popup text (2026-10-05)

NativePopupText now runs the fixed browser extractor for each bound child, honoring
its inherited off policy. Rich attachment does not wait. The trusted popup toolbar
shows pending/building/ready/off/error. Text reaches the exact Neovim buffer through
existing validation and revision-checked publication; a 300 ms mutation poll rebuilds
it. Navigation, disposal and replacement reject late results. Operations time out
rather than leaving the status building indefinitely (ADR 0021).

Text refresh exposed native focus loss during temporary hiding. Validated return
requests and already-focused native views now retain focus through placement
acknowledgement, rechecking active window/incarnation; switching active windows
clears pending focus. Gated integration now asserts focus survives a text mutation.

Verification, primary only, macOS arm64/Node 24/Neovim 0.11.4/Electron 44.5.0:
- npm run check: exit 0, `.local/review/native-text-check-final.log`.
- npm run smoke:electron: exit 0, `.local/review/native-text-electron.log`.
- npm run smoke:package: final exit 0, `.local/review/native-text-package-final.log`;
  default and gated paths, including text publication, mutation, off policy,
  shortcut roundtrip and focus retention. This covers the final focus fix.
- Focused development fixture: exit 0, `.local/review/native-text-focus-fix.log`.
- Unit cases reject late extraction after navigation/close/replacement, perform no
  extraction when disabled and reject timed-out completion.
- Final reusable manual fixture: exit 0, `.local/review/native-text-manual-final.log`.
  CUA observed popup Text ready, appended ` verified`, confirmed Ctrl-\/Ctrl-N
  returned to Neovim, `i` restored input focus and Close completed the fixture.
  Earlier live screenshot showed the status within the trusted toolbar, above the
  rich child. `.local/review/presentation.png` still shows local content, cursor,
  isolated scope and Text ready.

Failures: first fixture toolbar lookup raced text-triggered redraw; it now waits
for available controls. Packaged tests exposed dropped return requests and then
loss of existing focus after a later redraw; both were fixed, with a focused
refresh assertion added. The interrupted earlier manual run did not complete;
it is not counted as a pass. Earlier package failure logs are native-text-package.log
and native-text-package-rerun.log. No sub-agents or blind reruns.

Next: popup cursor/selection projection and explicit retry. Text is present in
Neovim but the rich view still covers the text buffer, without cursor highlighting.
Extraction is cooperative in the guest renderer, not parallel worker execution.
Performance, cap reporting, shadow/frame coverage, IME, multi-window focus edges,
composition/zoom/DPI, Linux and release/security acceptance remain open. Keep the
native-popup flag opt-in. Older slices below are historical where superseded.

## Previous slice: bound popup focus and mode routing

Native children now register with the shared Lua presentation lifecycle. Mode
requests carry the existing host reservation, buffer and incarnation; Lua validates
the original float and current tab before changing focus. Ctrl-\ then Ctrl-N returns
to the bound Neovim float; `i` returns to its visible native document. Ctrl-Q closes
that child. Rich content stays visible; optional popup text is still unimplemented.
See ADR 0020. No new document IPC or replayed navigation.

Primary-only verification, same macOS/Node 24 environment, all final checks exit 0:
- Focused build and Lua lifecycle tests; Lua covers forged token, hidden tab,
  closed reservation and exact window selection.
- Gated integration: `.local/review/native-input-focused.log`, native input chord
  to shell and Neovim `i` back to child, with retained input.
- npm run check: `.local/review/native-input-check.log`.
- npm run smoke:electron: `.local/review/native-input-electron.log`.
- npm run smoke:package: `.local/review/native-input-package.log`, including gated
  shortcut cycle in the packaged application.
- Manual reusable fixture: `.local/review/native-input-manual.log`. CUA clicked
  popup input, pressed Ctrl-\/Ctrl-N (shell focus observed), typed `i` (input focus
  restored), appended ` roundtrip` and verified retained value, then Ctrl-Q closed.
- Inspected `.local/review/presentation.png`: local content/cursor/scope/Text ready
  still visible. No sub-agents used.

During implementation, the new Lua test exposed missing shared lifecycle registration;
fixed with internal attach_native. The integration test initially used the wrong
preload method name, corrected to sendInput. A toolbar lookup raced the mode-triggered
redraw; fixture now waits for an available button before clicking. No blind reruns.

Next implement optional nonblocking popup text with revision cancellation and visible
status. Broader focus races, IME, multiple children, automatic initial focus and
composition/zoom/DPI acceptance remain; keep the flag opt-in. Older slices below
are historical where they describe mode switching as absent.

## Previous slice: native popup editing on macOS

Added Electron's standard Edit menu to the macOS application menu. The previous
custom menu omitted editing roles, leaving Command-A/paste/undo shortcuts unavailable
in the native child. AppKit now routes these roles to the focused document; no
clipboard IPC or document privileges were added. Existing shell/webview accelerator
interception is unchanged; this does not establish editing support in all surfaces.

Primary-only verification on the same macOS/Node 24 environment, all exit 0:
- npm run check: `.local/review/edit-menu-check.log`.
- npm run smoke:electron: `.local/review/edit-menu-electron.log`.
- Gated reusable manual fixture: `.local/review/edit-menu-manual.log`.
  CUA clicked the input, Command-A then pasted `Popup paste 日本語`, verified exact
  replacement, undid to `retained`, redid to the pasted value, and clicked Close.
  This resolves the previous native popup paste timeout. IME composition and
  copy/cut roundtrips were not exercised.
- npm run smoke:package: `.local/review/edit-menu-package.log`, both default and
  gated integration. Packaged clipboard shortcuts were not manually exercised.
- Inspected `.local/review/presentation.png`: local rich page, cursor, isolated
  scope and Text ready remain visible. No sub-agents used.

Next: bound native focus/common rich-text dispatch and optional text. Keep the
experimental flag until those and composition acceptance are complete. The previous
slice below is retained as historical evidence; its paste limitation is superseded.

## Current result

Core/browser scope remains; non-browser plugins stay in separate repositories and
sessions. R1–R7 remain partial/release-blocked. Default popup behavior is unchanged.
`JUSI_NATIVE_POPUPS=1` now enables an actual rich popup inside the main app's Neovim
float, with trusted origin/scope and Close controls (ADR 0019).

NativePopupCoordinator connects retained Chromium children, NativeChildOwner,
measured viewport generations and grid placement. Native views remain hidden until
the trusted shell acknowledges the matching control token/generation. Tab hiding
retains page state; overlap parks views. Toolbar close and page window.close dispose
the float. Source navigation/crash/destruction revokes the child. No document host
API, navigation replay or arbitrary partition override was added.

## Verification and delegation

Substantial routine verification ran serially on one GPT-6 Luna/low agent with a
fresh brief, frozen code and no source edits. Primary diagnosed failures and did
live desktop acceptance. This describes the completed checks, not the current policy.

The user subsequently reverted testing delegation: all work and checks now stay
with the primary agent unless delegation is explicitly requested again. The exact
previous AGENTS.md is backed up at
`docs/implementation/backups/AGENTS.luna-testing.2026-10-02.md.bak`.
This policy-only change leaves application behavior and required checks unchanged.
Verification: backup byte equality and policy diff reviewed; npm run harness and
git diff --check exited 0. No build, desktop or packaged suites were rerun.

macOS arm64, Node 24.10.0, Neovim 0.11.4, Electron 44.5.0 / Chromium 152.0.7977.130:

- npm run build and gated development popup fixture: exit 0
  (.local/review/native-build.log, native-integration-rerun.log).
- npm run check: exit 0 (.local/review/native-check.log).
- npm run smoke:electron: exit 0 (.local/review/native-smoke-electron-rerun.log).
- npm run smoke:package: exit 0, default and gated integration using the same
  packaged build (.local/review/native-smoke-package.log).
- Integrated assertions cover actual source Session/opener retention, sandbox/no
  Node/no host API, one app window, forged control rejection, hide/reattach retaining
  input and JS state, host resize, higher-float occlusion, toolbar and script close.
- Primary inspected .local/review/presentation.png: rich local content, cursor,
  isolated scope and Text ready visible. Electron's native-popup.png capture omits
  native child pixels on macOS; live CUA screenshot confirmed the actual child fits
  within the float below the trusted toolbar.
- Reusable manual fixture exited 0 (.local/review/native-manual-rerun.log): clicking
  the input and direct typing changed retained to retainedtest; trusted Close ended
  the fixture successfully. Clipboard paste timed out with no change. Do not claim
  paste/clipboard acceptance; investigate in the next input milestone.

Failures resolved: initial integrated placement stayed hidden because the persistent
one-line permit message was incorrectly treated as an overlay; that message lies
below the viewport and no longer blocks it. Standard smoke encountered a generation
change between measure and report: it now retries only when the generation actually
advanced, retaining failure for current-generation rejection. The first manual wait
expired during primary context handoff; one coordination retry completed. Existing
intentional worker diagnostics and unsigned package warnings remain.

## Limits and next step

Next implement bound native input/common rich-text dispatch and optional nonblocking
text, starting with focus/clipboard/IME behavior. Rich popup content currently has no
text layer; the surrounding source's Text ready badge does not apply to the popup.
Ctrl-Q and trusted Close exist, but common mode switching is unfinished. Block/error
feedback in the experimental coordinator is console-only. Integrated private flows
were not separately exercised here; older engine fixtures cover exact private Session.

Before enabling by default, finish atomic composition/zoom/DPI and focus acceptance,
assess conservative-invalidation flicker and exercise remaining source/child failure
paths end-to-end. Shell render acknowledgements alone are not an atomic composition
guarantee. Linux, signed release, real OAuth/devices/TLS and browser safety parity
remain open. Do not expand the Markdown fixture or create provider repositories here.
