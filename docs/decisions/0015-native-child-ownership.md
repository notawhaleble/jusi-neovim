# ADR 0015: Bind retained native children to Neovim ownership

Status: accepted for the internal integration gate; production routing unchanged.

A native child must retain the Chromium document supplied to createWindow. A URL
replay would lose POST/opener/session semantics. NativeChildOwner reserves that
actual document while a trusted Lua request creates its Neovim buffer and tab.
The child remains unmounted until both the RPC reply and bridge state agree on
buffer incarnation and reservation token. The bridge supplies the session identity.
Reserved buffers are excluded from DOM guest attachments, preventing duplicate loads.

Reservations require a live web source with exact buffer/session/incarnation and the
same Electron Session object for opener and child. The trusted caller supplies the
source-to-document mapping. There is one child per source and at most sixteen per
controller. Binding times out after five seconds. Source full navigation, destruction,
crash, replacement or Neovim exit closes children; same-document navigation does not.
Native close cancels the Neovim presentation; Neovim close closes the native document,
including when parked. These retain the existing auxiliary-popup lifetime policy.

Lua uses a host epoch and monotonically increasing sequence high-water mark to reject
late allocations after cancellation without accumulating tombstones. A late reply
triggers cancellation again. Cleanup deletes only the explicitly allocated buffer
whose token and incarnation still match; replacement buffers survive. New host epochs
clear previous owned reservations. Profile/private/text settings inherit from source;
private children retain the source Session through main ownership, not a public
partition override. Fresh-private context-menu links keep their existing semantics.

The controller is exercised with real Neovim and Chromium in adoption-cases.mjs,
including packaged smoke. Production popup creation still uses ADR 0012. No renderer
attachment endpoint, native layout, focus/text dispatcher or automatic routing is
introduced here. NATIVE-VIEW-PLAN gates 2–4 remain prerequisites for enabling adoption.
