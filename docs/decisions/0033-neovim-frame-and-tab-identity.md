# ADR 0033: Completed redraw frames and stable tab identity

Status: implemented; acceptance recorded in STATUS.

Neovim's redraw stream can span several notifications. Apply events to working
bridge state in order, but capture a renderer-facing snapshot only at flush.
Capture each completed frame immediately, even if the same notification begins
another incomplete frame. Delivery can coalesce completed snapshots; a timer
cannot choose a partially redrawn state. Screen, highlight, cursor, overlay and
window/grid geometry all participate in the same snapshot.

Float geometry belongs to the grid allocation, including its border. For the
eight-field win_float_pos event, resolve the specified corner against the
anchor grid's origin and the float's allocated width and height. Recompute
dependent positions when an anchor moves or resizes. Missing or cyclic anchor
chains have no visible geometry. A hidden grid retains its allocation. Closing
or destroying the anchor invalidates its former children's relative placement.
When Neovim supplies explicit screen coordinates, use them directly.

Authoritative provider and ownership metadata continues to advance immediately.
Closing/replacing a buffer must revoke its identity and reject stale work without
waiting for a UI flush. Metadata-only presentation updates remain coalesced when
no redraw is pending; during a redraw they join the next completed snapshot.
Direct publication paths obey the same gate. Internal live getters are for
ownership/control, not initial renderer reconstruction. Initial-state IPC returns
the main process's last published frame (and its matching native generation), or
the session's completed snapshot before first publication. Session exit cancels
queued publication. Browser region navigation uses a separate shell-only,
identity/window/revision-checked live interaction read. It must not use the cached
initial presentation frame as a cursor query; rapid commands can advance Neovim
between completed frames. The native adapter already reads live ownership state.
This does not make Chromium/native surface composition atomic;
the existing viewport generation and acknowledgement rules still apply.

TabClosed's event argument is a tab page number, not an API Tabpage handle. The
runtime tracks handles it has published and reconciles them against
nvim_list_tabpages during scheduled snapshots. Close events contain only missing
known handles. Never infer identity from tab order or reuse a closed tab's number.
A tab created and closed before publication need not generate a close notification.

Acceptance: split redraws and interleaved lifetime metadata; multiple flushes and a
trailing partial frame; explicit provider publication; exit before completion;
stale native viewport acknowledgements; live nonconsecutive/reordered tabs and
surviving provider identity. Other Neovim conformance work remains in the plan.
