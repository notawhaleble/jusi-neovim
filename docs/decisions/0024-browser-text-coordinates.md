# ADR 0024: Browser text coordinate units

Status: accepted for code-point mapping and inclusive character selections.

BufferCursorPosition uses zero-based Unicode code-point columns, counting composing
marks. Lua already reports that unit with strchars. Mirror indices and DOM Range
offsets use UTF-16 code units. These units must not be added or compared directly.

The shared web text-mapping module converts between them for cursor projection,
link/scroll anchors and click results. A hit inside a surrogate pair resolves to
the start of that code point. Neovim cursor writes use byteidxcomp, the inverse of
the bridge's counting convention; byteidx skips composing marks and is unsuitable.

Inclusive selections normalize endpoint order before extending the upper boundary.
The endpoint includes the complete code point and following combining marks. Cursor
geometry likewise uses a complete code point and following marks. DOM indices remain
UTF-16; extraction and its bounded validator do not change coordinate units. Both
adapters use these functions and the same geometry acceptance fixture.

Real guest mouse input does not bubble into a DOM webview element's mousedown
listener. DOM transport now receives host-observed WebContents mouse events through
the trusted shell preload, tagged with exact ownership and document revision. Native
transport already observes these events directly. Neither transport exposes a guest
IPC API; both still use shared hit testing and ticket-checked Neovim cursor commits.

This decision does not establish all grapheme or selection semantics. ZWJ sequences,
exclusive/block selections, complex bidirectional selections, transformed text and
cross-node combining sequences require further acceptance. Do not infer completion
of M3 from the verified emoji/accent/CJK/Hebrew cases.
