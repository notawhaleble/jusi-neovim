# ADR 0050: Current browser click modifiers authorize link tabs

A normal-use trace and user confirmation identified Ctrl-O followed by a missing
Control release. Electron's `before-mouse-event` omits modifier fields in the
pinned 44.5.0 converter. Retained keyboard state therefore intercepted ordinary
controls and opened the next link in a tab. Focus resets and later keyboard
snapshots cannot repair a release followed only by mouse input.

Both browser adapters now use the shared `backends/web/link-clicks` collector in
an Electron isolated world. Chromium's trusted mouse press/release supplies the
current modifier flags. Only supported HTTP(S) links without `download`, clicked
with Control/Meta/Shift or the middle button, suppress default handling. Ordinary
links and non-link controls keep their browser handling. macOS Control-left may
produce contextmenu rather than click, so the collector also suppresses that
follow-on event for the same intercepted link press. There is no navigation or
timeout heuristic that treats an old key press as current intent.

Main observes native press/release, then pulls one result for matching coordinates,
button and time. The collector is inaccessible from the page world; synthetic
DOM events are ignored. It has no Node, IPC, Neovim or shell bridge. A page cannot
request a tab through it. Results are bounded (eight queued/eight waiting, 250 ms
wait, one-second retention), consumed once and cleared on document blur. A new
document gets a fresh collector. Main validates the URL, session/incarnation,
current tab membership and interaction epoch before the existing Lua link action.
Focus/fullscreen/navigation invalidation still rejects pending actions. Failed
installation or vanished documents do not fall back to historical modifiers.
The existing popup permit policy remains separate.

Keyboard modifier history is now diagnostic only for link routing. Traces retain
that history and add the current trusted mouse flags so mismatches are visible.
The collector build hash is recorded. No raw URL or ordinary typed text is logged.

Acceptance covers both adapters: Ctrl-O same-document history, retained Control
with unmodified button/link clicks, current modified/middle links, isolated-world
separation and one new tab per action. Contract cases cover forged events,
unsupported/download/non-link targets, one-use/time/coordinate matching and
arrival ordering. Native focus setup must settle between tab closure and the
next input. Fullscreen bug investigation remains separate. Subframe and arbitrary
page-listener interference are not newly claimed as covered; release security
parity remains open.

Upstream evidence: [Electron 44.5.0 mouse converter](https://github.com/electron/electron/blob/v44.5.0/shell/common/gin_converters/blink_converter.cc#L382-L399).
