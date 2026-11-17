# ADR 0034: Neovim grid mouse input

Status: implemented; platform acceptance recorded in STATUS.

The shell forwards editor mouse gestures with nvim_input_mouse. Neovim owns
cursor/selection changes, mouse mappings, click counting ('mousetime'), native
statusline/separator resizing and tabline click/close callbacks. The host does
not translate clicks into guessed buffer positions or tab numbers.

A gesture starts only on an actual rendered editor grid or root-grid cell.
Coordinates are relative to that element and use the same measured cell size as
rendering. Grid 1 carries tabline, statusline and separators; window grids carry
explicit window and tab handles. Float mouse_enabled is retained from redraw
metadata; disabled floats are excluded from pointer hit testing. Empty composition
containers do not intercept input, while browser surfaces retain pointer events.

Pointer capture retains the originating grid for dragging outside its rectangle.
Release, lost capture, cancellation and window blur end the gesture. Shift,
Control, Alt and Meta are forwarded. High-resolution wheel deltas accumulate into
bounded discrete steps in all four directions. Touch and hover are not synthesized
as clicks. External cmdline, popup menu, history and pager visibility block new
grid gestures; their own handling remains separate.

The preload exposes a typed mouse request through sender-checked shell-only IPC.
The session validates the event and current window/grid/tab ownership immediately,
including during partial redraw frames. Closed, hidden and replaced targets are
rejected. A root-grid gesture accepted before a tab switch may finish after that
switch: otherwise the click itself could invalidate its release or tab drag.
No new stale-tab press is accepted. Browser documents receive no Neovim IPC.
Browser click-to-text mapping remains in the shared browser interaction layer.

The host leaves ext_tabline disabled and renders Neovim's cells. In Neovim 0.11.4,
the built-in tabline reduces label widths and truncates excess tabs; it does not
scroll to an active tab beyond the visible range. Custom tabline fitting belongs
to its provider. Host-side CSS scrolling would separate rendered cells from
Neovim's click targets and is not part of this decision.

References:
- https://neovim.io/doc/user/api/#nvim_input_mouse()
- https://neovim.io/doc/user/api-ui-events/#ui-multigrid
- https://github.com/neovim/neovim/blob/v0.11.4/src/nvim/os/input.c (click counting)
- https://github.com/neovim/neovim/blob/v0.11.4/src/nvim/statusline.c (native tab fitting)
