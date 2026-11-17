# ADR 0017: Resolve native child rectangles from authoritative grids

Status: internal placement gate; production routing remains unchanged.

The placement resolver consumes the bound session/token/incarnation, Neovim snapshot,
explicit visible window/grid identities, layout generation and trusted viewport metrics.
It supports the runtime's single-border zindex=50 popup floats only. Grid dimensions
must match content dimensions plus that border; other shapes remain hidden until their
insets are represented explicitly. The retained native document is never reconstructed.

Convert cells to Electron DIPs using cell metrics and shell zoom once. Round inward
and reject content outside the viewport rather than distort its layout by clipping a
partial rectangle. Leave the border and one interior row clear for trusted controls.
Hide when multiple windows own the buffer, ownership/grid data is unresolved, another
higher/equal-order grid overlaps, or trusted transient UI is visible. This intentionally
parks the entire native view rather than painting over menus or floating windows.

Every placement invalidation hides immediately and advances a generation. Late results
cannot show a view again. Caller integration must invalidate on ownership, layout,
viewport/zoom and trusted UI changes before computing a new placement. These inputs
are host data, never guest-authorized rectangles.

The real-Neovim adoption fixture now mounts using this resolver, with declared test
cell metrics. It exercises occlusion, resizing, hidden tabs, stale generation rejection
and retained document state. Production shell metric transport and atomic invalidation
wiring are not installed yet. The reserved control row has no controls yet. Split
promotion, actual shell zoom/DPI, messages/menus and native composition still require
integration acceptance before enabling the backend.
