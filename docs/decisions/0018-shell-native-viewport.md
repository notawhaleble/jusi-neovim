# ADR 0018: Measure native viewport in the trusted shell

Status: production transport installed; native views remain gated.

Main owns a viewport generation. Every published Neovim state carries that generation;
the shell reports measured stage origin/size and cell-ruler dimensions after rendering
that state. Reports include a monotonically increasing shell sequence. Main accepts only
the current generation and newer sequences from the trusted shell sender. Invalid current
reports revoke previous measurements. Resize, shell loading/crash, Neovim state changes
and explicit shell invalidation clear the accepted viewport.

The shell supplies CSS measurements; main reads its own WebContents zoom factor and
content size, validates containment, and converts stage bounds to DIPs. Cell sizes remain
CSS values with the zoom factor explicit so the placement resolver scales them once.
A blocked report (command line, completion, messages/history or command block) keeps the
viewport unavailable. No document gets an IPC endpoint or a rectangle-selection API.

This installs and tests the measurement transport in the real application. Main has no
production native-view placement subscriber yet; its parking callback is deliberately
empty until ownership and controls are integrated. This is not atomic native composition:
renderer-only CSS changes still cross IPC asynchronously. Before enabling views, wire
parking and placement, coordinate UI changes and acknowledgements, and test shell zoom,
DPI, transient UI and actual controls end to end. Production popup routing is unchanged.
