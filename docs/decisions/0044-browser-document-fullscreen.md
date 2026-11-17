# ADR 0044: Browser document fullscreen

Fullscreen is a temporary browser presentation, not a Neovim layout mutation.
Both transports use one main-process permission/lifecycle coordinator. Requests
require a registered, focused WebContents in the focused host, bound to the exact
current buffer/session/incarnation and active tab/window/grid. Chromium retains
user-activation and iframe Permissions Policy enforcement; automatic-fullscreen
and unrelated permissions remain denied. A permission check is not a durable
origin grant.

The DOM webview uses Chromium's fullscreen top layer. A native WebContentsView
has no equivalent automatic host-sized placement, so its adapter uses the host's
content bounds while its authorized owner remains current. Other native views
stay parked. Ordinary shell-measured placement resumes after exit. Native bounds
never come from the document.

Escape exits document fullscreen. A text-mode transition, main-document navigation,
owner change, process loss or destruction revokes the presentation. The host
restores the preceding window fullscreen state; an already-fullscreen host stays
fullscreen. No tab, split, cursor or buffer is created for this presentation.

Electron references: [Fullscreen permission](https://www.electronjs.org/docs/latest/api/session),
[HTML fullscreen events](https://www.electronjs.org/docs/latest/api/web-contents).
Acceptance evidence and platform limits belong in STATUS.md.

On Electron 44.5.0/macOS, an unhandled Escape key-up during webview fullscreen
exit can repeatedly reach the embedder's before-input-event and monopolize the
main thread. Chromium may consume key-down before that event is exposed. The
shared coordinator therefore consumes a matching release after HTML fullscreen
exit as well as the explicit key-down/up gesture. Ordinary subsequent shell
Escape remains available. The acceptance fixture sends down/up consecutively;
it must not hide the failure by waiting for animation before sending key-up.

Exit restoration is sequenced: destroying/crashing a page completes restoration
even if its JavaScript exit promise never answers. A later completion cannot
restore the window on behalf of an obsolete fullscreen owner. New requests wait
until the preceding exit/host transition is complete.

Permission checks are side-effect-free. Only the permission request handler binds
the exact owner and captures the host's current fullscreen state. Chromium can
probe support before a later host fullscreen transition; a probe must not save
a stale windowed state for that future request. Repeated requests before entry
refresh the snapshot, while checks during an active presentation cannot replace it.

## Window shortcuts while a document is fullscreen

The 2026-11-01 user trace records a correctly captured pre-existing host fullscreen
state, followed by the host-toggle dispatch before HTML fullscreen leave. This
established a shortcut-priority defect, not the physical chord the user pressed;
the user reported ordinary YouTube F/double-click. The shortcut change alone did
not resolve ordinary document exits.

F11 and Ctrl-Command-F now ask the host's shared fullscreen coordinator to exit
the current document first. Active or pending document exit owns that press;
only a later explicit press outside that transition toggles the host window.
Auto-repeat is consumed without a second action. Shell, DOM guest and native
child input all use this same dispatch. The prior host-state restoration policy
is unchanged: pre-existing host fullscreen stays, and video fullscreen entered
from a windowed host returns to windowed mode. The host registry is weak and
removed when the coordinator is disposed. Traces distinguish document shortcut
exit from an actual host-window toggle.

## Explicit ownership of native window transitions

The November 3 normal-session trace records document leave with wasFullscreen=true
and hostFullscreen=true, followed by a delayed OS fullscreen exit without a host
toggle. A second live DOM webview reproduces it in the desktop acceptance fixture.
Electron 44.5 forwards HTML fullscreen exit to sibling webviews; a sibling that
never entered has no native-fullscreen snapshot and can window the shared host.
See [Electron SetHtmlApiFullscreen/UpdateHtmlApiFullscreen](https://github.com/electron/electron/blob/v44.5.0/shell/browser/api/electron_api_web_contents.cc).

Set disableHtmlFullscreenWindowResize on the shell, attached DOM guests and
native children. Only the shared authorized fullscreen coordinator enters native
window fullscreen; its existing prior-state restoration owns exit. This removes
implicit sibling window writes without forcing a delayed exit/re-entry or
changing the user's video controls. Both adapters must exercise F, Escape,
double-click and button exit with a sibling webview alive and assert no host
leave-full-screen event when the host was already fullscreen.
