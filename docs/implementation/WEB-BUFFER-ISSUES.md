# Observed web-buffer issues — active work queue

User direction, 2026-10-16: Neovim integration feels mostly usable for everyday
work. Defer the remaining Neovim conformance pass, address these observed web
buffer defects, then finish Neovim conformance, then define browser conformance
boundaries and work through them. Passing these fixes will not establish broad
browser parity or close the existing release gates.

## W1 — Browser buffer names follow the current URL

Reported: JusiWebBuffer buffers appear as Scratch. Requested: use the currently
opened URL as their name, updating on navigation.

Acceptance: initial open, redirect, ordinary and same-document navigation,
history, reload, native child, and multiple independent buffers for the same URL.
Neovim owns buffer names and requires uniqueness: explicitly resolve duplicate URL
names without sharing buffers or browser sessions. Preserve the exact URL as
metadata; determine a minimal disambiguating name for collisions. Handle URL text
as data, including spaces, percent signs and fragments. Other providers keep their
own naming policy. URL labels must not become file-backed buffers.

## W2 — Duplicate-page tab switching breaks the guest

2026-10-17 investigation: original Mixcloud failure not reproduced; no production
fix made. Focused same-URL lifecycle fixture passes native and passed an initial
DOM run, but the final DOM run timed out typing after an explicit reload. Cause
unresolved; do not mark fixed or consistently verified. STATUS records exact logs,
fixture corrections and a separate nested-native serialization failure. Actual
Mixcloud acceptance remains unclaimed. Per user direction, no full suites or CUA.


Reported: opening another instance of the same page in another tab produces a
Mixcloud error. Reload restores the page until another switch between tabs with
the same page. Site message:

```
Sorry, something went wrong.
Click here to try that again
Error ID: 0421e138b831461ea8ae4f2e54b97ebd
Quote this if you contact support.
```

Associated stderr:

```
Error occurred in handler for 'GUEST_VIEW_MANAGER_CALL': Error: Invalid guestInstanceId: 5
    at getGuestForFrame (node:electron/js2c/browser_init:1:115391)
    at node:electron/js2c/browser_init:1:114570
    at node:electron/js2c/browser_init:1:113808
    at Session.<anonymous> (node:electron/js2c/browser_init:1:118964)
    at Session.emit (node:events:514:28)
```

Investigate live guest lifetime, parking/reattachment, DOM ancestry/order changes,
per-buffer session identity, stale WebContents operations and late callbacks during
tab switching. Do not assume URL equality means session identity. Do not equate
all prior teardown warnings with this failure, or assume the site error has the
same cause solely because stderr is nearby. Do not mask with automatic reload.

Acceptance: deterministic two-buffer same-URL fixture with distinct DOM/input
state; repeated tab switches, reload, close one instance and continue the other;
retain live guest identity and usable input without unexpected navigation/reload.
Exercise shared behavior through both adapters; separately verify actual Mixcloud
with available user configuration. Platform, exact URL and installed build remain
to be captured; they do not block local lifecycle investigation.

## W3 — Profile/text status section accumulates

User's example:

```
[profile | text readiness] [profile | text readiness] [profile | text readiness]
```

Initial source-review hypothesis: runtime/lua/jusi_neovim/browser.lua tracks
installation per window, but a new split/tab can inherit an already-decorated
local statusline. Its first attach can append the suffix again. Reproduce before
claiming this is the reported cause.

Acceptance: exactly one browser status section across split/tab creation, repeated
browser/text buffer switches, navigation, readiness changes and window closure.
Restore the appropriate undecorated local/global user format when leaving browser
buffers. Preserve custom formats and independent window settings. Test both shared
browser adapters without introducing adapter-specific status formatting.

## W4 — YouTube fullscreen does not work

Implemented and verified on macOS in both adapters (ADR 0044). Shared permission/
ownership and exit lifecycle, native full-host bounds, prior-window-state restoration
and Escape key-up consumption are covered by unit/source/packaged tests. Targeted
actual YouTube CUA confirmed fullscreen entry, playback, Escape/player-button exit
and original layout/document focus restoration in both adapters. See STATUS for
failures found during implementation, final checks and platform limits. W5 app-focus
CUA was not replayed, per user instruction.

Investigate the document Fullscreen API, guest permission/embedding attributes,
Electron fullscreen events and host layout/focus ownership. Browser-window fullscreen
shortcuts alone do not establish document/video fullscreen support.

Acceptance: enter from an actual user click, render and interact with the fullscreen
video, exit with Escape/player control, restore layout/focus, and handle tab switch,
navigation and closure while fullscreen. Use a local Fullscreen API fixture for
repeatability and targeted actual YouTube review for site behavior. Keep adapter
transport differences in adapters and shared behavior consistent.

## W5 — YouTube clicks intermittently stop; a later click opens a new tab

Exact user reproduction (2026-10-17): open a YouTube video, pause by clicking the
video frame, remain in web-focus mode, Cmd-Tab to another app, Cmd-Tab back. The
video-frame click no longer resumes playback. A thumbnail click still works but
opens a new tab instead of the current window. Toggling text mode then web mode
restores both ordinary video clicks and current-window link navigation.


Reported: clicks sometimes stop working, then a click that succeeds opens a link
in another tab. Possible relation to recently fixed focus switching remains a
hypothesis, not a closed regression.

Investigate guest visibility/focus, stale overlays or placement acknowledgements,
input ownership, modifier state across blur/tab transitions, and ordinary versus
explicit modified/middle-click routing. Correlate with W2 without assuming a single
root cause. Keep ordinary link navigation in its current document; intentional
new-tab gestures retain the established policy.

Acceptance: repeated focus/tab switches and ordinary clicks in both adapters;
Ctrl/Cmd/Shift and middle-click policy; lost key-up/blur handling; no double dispatch
or unexpected tab creation. Verify actual YouTube controls/links when feasible.

## Execution order and evidence

Keep changes in coherent milestones. W1/W3 have scoped implementation evidence.
User's 2026-10-17 order: W5 app focus/modifier recovery first, then W4 fullscreen,
then investigate W2 last because it no longer appears to reproduce. Each issue
remains open until scoped tests pass; real-site/platform acceptance is separate
from deterministic fixture acceptance.

Follow AGENTS.md: focused regressions, then npm run check and affected Electron
acceptance; package smoke for shipped runtime/security/preload changes. Use targeted
CUA for real fullscreen/focus questions automation cannot answer. No blanket repeat
of passing workflows or broad browser conformance expansion in this queue.

Remaining Neovim work is retained in NEOVIM-CONFORMANCE-PLAN.md and
NEOVIM-UI-INVENTORY.md. After it is closed within an explicit supported scope,
define the browser conformance boundary against the existing implementation and
release-gate documents; that future scope is not implicitly unlimited Chromium parity.

### W3 implementation — 2026-10-16

The inherited-statusline hypothesis reproduced in a headless Neovim regression.
ADR 0041 records the window ownership fix and its explicit-empty-option limit.
Focused tests cover split/tab inheritance, custom formats, global inheritance,
repeated attachment and buffer changes. Shared desktop workflow assertions added
for both adapters. Verification results and remaining scope are in STATUS.
W1 remains unimplemented and is the next slice, before W2/W5 and W4.

### W3 correction — 2026-10-17

User reports `tabe` -> `b 2` still duplicates the status section, although views of
the existing browser buffer now appear to preserve their own text/cursor state.
That observation is not W2 same-URL independent-buffer/site acceptance.
The exact status reproduction failed against the first fix. Neovim copies local
options from a window already displaying the existing buffer, beyond WinNew.
ADR 0041 now uses explicit registered format identities instead of window-event
source inference; the precise sequence is in both headless and shared desktop tests.

### W1 implementation — 2026-10-17

URL naming and exact metadata now follow committed top-level navigation in both
adapters. Collisions retain distinct buffers with numeric suffixes; other providers
are unchanged. Scheme-only URLs use a `jusi-web://` display prefix to avoid Neovim
interpreting them as filesystem-relative names. ADR 0042 records the implementation.
Verification and any remaining limitations are in STATUS. W2 guest lifetime and
related W5 input are next, then W4 fullscreen; these are not fixed by URL naming.

### W5 implementation — 2026-10-17

Missing host app-focus reset reproduced before the fix. Shared reset handling now
clears retained modifiers and pending input without changing mode, and rejects
pending link dispatch across the boundary. Both-adapter source/package assertions
and real Cmd-Tab fixture review passed. Actual YouTube DOM playback and ordinary
recommended-video navigation passed the user's sequence (STATUS, ADR 0043).
W4 is next; W2 stays last per user direction. This does not establish arbitrary
site/input/platform conformance or document fullscreen support.

## 2026-10-18 follow-up: reload timing and host fullscreen input

Investigate the W2 fixture's intermittent post-reload input timeout separately
from the original Mixcloud report. The focused duplicate workflow now retains
bounded focus/input event diagnostics on failure and accepts
`JUSI_TEST_DUPLICATE_RELOAD_TRIALS` (1–20) for repeated reload/switch cycles.
A passing stress run cannot establish the historical cause.

Host fullscreen input is a W5 boundary extension, distinct from W4 document/video
fullscreen. Missing modifier releases across fullscreen entry/exit reproduced
swallowed clicks. Shared boundary resets now include both fullscreen events;
native views also invoke the shared host shortcut handler. See STATUS for checks
and limits; browser safety parity remains unclaimed.
