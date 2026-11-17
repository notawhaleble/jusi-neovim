# ADR 0019: Opt-in rich native popup integration

Status: accepted for experimental integration; default routing unchanged.

`JUSI_NATIVE_POPUPS=1` connects NativePopupCoordinator to the production shell.
A one-use permit authorizes one active child per source. Main retains the actual
Chromium child and exact source Session; it does not replay navigation. Installed
local providers and unsolicited/nested opens remain blocked.

NativeChildOwner binds the document to a Neovim float before mounting. Main parks
native views when viewport generations expire, resolves bounds from actual grids
and measured shell geometry, and reserves one row for trusted origin/scope/Close.
The shell renders labels as text and acknowledges an opaque control token after a
render frame. Only the trusted shell can acknowledge or close; stale generations
and unknown tokens are rejected. Page content gets no host preload or Neovim IPC.
An ordinary one-line status message below the viewport does not block placement;
command UI, completion, history and command blocks still do.

Tab hiding preserves the child document; unresolved ownership/overlap hides it.
Page window.close and host Close dispose the float through existing ownership.
Ctrl-Q closes the child; closure returns focus to the shell. Source destruction,
crash or full navigation revokes the child. Default auxiliary windows remain as
specified in ADR 0012 when the flag is absent.

This is a rich-only integration. Optional text, shared rich/text dispatch, complete
keyboard/clipboard/IME behavior, visible blocked/error feedback and automatic focus
need further work. Frame acknowledgement is not proof of atomic native/DOM
composition for every CSS/zoom/DPI transition. Conservative invalidation may flicker.
The macOS disposable integration fixture verifies placement, retained state,
trusted controls and sandbox properties in development and packaged builds;
it does not establish browser security parity or real OAuth compatibility.
