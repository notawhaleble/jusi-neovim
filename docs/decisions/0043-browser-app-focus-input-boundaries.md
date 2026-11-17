# ADR 0043: Browser input state expires across application focus boundaries

The reported macOS Cmd-Tab sequence can retain a focused WebContents inside an
inactive BrowserWindow. Guest blur and the Command key-up are not guaranteed.
Tracking modifier transitions until guest blur therefore lets a stale Command
press consume non-link clicks and route ordinary links into new tabs.

A shared main-process helper registers each guest's transient input reset with its
host BrowserWindow. Both host blur and host focus clear held link-tab modifiers,
mouse-up suppression and pending mode/window-command prefixes. Guest blur and
navigation/destruction resets remain. The helper uses one listener per host boundary for
all registered states and removes registrations when the source is destroyed;
closing the last source removes host listeners. It does not focus a guest, change
Neovim mode, recreate a document, clear a popup permit or reload a page.

Resetting link input also advances an interaction epoch, so asynchronous link
lookups begun before deactivation cannot dispatch later. Both adapters share this
policy; their focus/placement and transport mechanisms remain adapter-owned.
Fresh explicit Cmd/Ctrl/Shift and middle-click gestures keep the existing new-tab
policy. Mouse event modifier flags are still used where Electron supplies them.
No attempt is made to infer physical modifiers held across an application switch
from a previous application's missing key events.

Acceptance includes host blur/focus without guest blur or key-up, ordinary control
and current-document link clicks, explicit modified/middle clicks and cancellation
of a pending link lookup through both adapters. Unit tests verify multi-guest
isolation and listener cleanup. Actual OS Cmd-Tab review and real-site evidence
are recorded separately in STATUS; synthetic events alone do not establish them.

## Fullscreen transition boundaries

Host `enter-full-screen` and `leave-full-screen` expire the same transient input
state. OS fullscreen shortcuts can consume modifier releases without a guest or
host blur. Resetting only application focus leaves ordinary clicks classified as
modified clicks after Ctrl-Cmd-F. The shared helper resets all registered guests
and invalidates pending link lookups on either transition, with the same cleanup
and host isolation guarantees. No Neovim mode or document lifetime changes.

F11 and Ctrl-Cmd-F recognition and host toggling are shared by the shell, DOM
guests and native browser views. Native views do not inherit the webview's input
routing, so their adapter explicitly invokes the shared handler. Acceptance covers
missing key-up at both transition boundaries and actual shortcut entry/exit with
ordinary controls/links in both adapters; OS keyboard evidence is tracked in STATUS.

Document `enter-html-full-screen` and `leave-html-full-screen` also reset transient
link input: an already-fullscreen host need not emit a native window transition.
Every keyboard event reconciles held modifier transitions against explicit false
modifier flags; a missed release cannot survive a later unmodified key. This
does not latch shortcut flags as new presses. If mouse flags are present, their
snapshot overrides historical keyboard state. Electron 44 omits those fields
from mouse callbacks; a lost release followed only by mouse events and no focus,
fullscreen or keyboard boundary remains a platform limitation, not a proven fix.

## 2026-10-31 current click authority

ADR 0050 supersedes historical keyboard-state fallback for link routing. The
confirmed Ctrl-O/missing-release incident had no intervening focus boundary.
Current trusted Chromium press/release flags now decide modified links; the
reset/epoch policy here still invalidates pending actions and input prefixes.
