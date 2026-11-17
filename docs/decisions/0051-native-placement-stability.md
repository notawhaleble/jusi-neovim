# ADR 0051: Preserve native placement across text-only updates

Accepted 2026-11-01.

A native browser document must not lose visibility or focus merely because its
text mirror or status changes. The reported game playtest issued 42 native hide
requests in four seconds without navigation: text publication invalidated the
entire native viewport, then shell acknowledgement restored the view.

Main compares explicit Neovim composition inputs before revoking placement:
tab/window/grid identities and bounds, session/incarnation/native-child ownership,
screen/grid dimensions and UI options, and command/menu/message overlay state.
Cursor, selection and text paint do not change that composition key. Explicit
shell resize, zoom, renderer failure/loading and lifecycle invalidation still
revoke placement. Unchanged, validated shell measurements retain placement;
changed, blocked or malformed current measurements park it. Old generations and
out-of-order sequences remain rejected.

Native text status requests a shell publication without revoking geometry.
Control tokens are still renewed and acknowledged against the current generation;
new or moved views still wait for acknowledgement. Full navigation, close and
fullscreen lifecycle retain their existing invalidation. The DOM adapter does
not use native placement; shared extraction behavior and popup permission policy
are unchanged. This is a native composition constraint, not game-specific logic.
