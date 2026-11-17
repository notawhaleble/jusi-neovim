# ADR 0046: Optional cursor positions for worker source navigation

Status: implemented.

ADR 0007 deliberately sends a whole-line source anchor. A source range need not
have a one-to-one relationship with the returned text. Adding a byte column to
that range would invent source positions, and using one buffer line per word
would break normal reading, search and Neovim motions.

Workers can now negotiate `source.navigate.cursor`, requiring both
`source.navigate` and `text.extract`. The guardian advertises it in hello. For
these workers only, a non-null navigate frame includes `cursorByte`: the zero-based
UTF-8 byte column in the **returned text line**, clamped to that line's byte length.
The original source anchor is unchanged. Empty lines and end-of-line/virtual-space
positions can produce the byte length. It is neither a display-cell column nor a
Unicode character index. Providers resolve it using their own extraction mapping.

Neovim remains authoritative. Cursor position, window, ticket and line are captured
together after the existing debounce/current-document checks. Deduplication includes
the byte column only when negotiated. Clear frames carry a null anchor and omit
cursorByte. Rich-mode suppression, restored projection, cancellation, stale-ticket
rejection, explicit window identity and process lifetime remain those of ADR 0007.
Legacy workers keep their line-level behavior and receive no additional field.

No geometry, executable source names or new guest-to-Neovim channel is introduced.
The external DjVu provider uses actual OCR word/line zones to resolve the cursor;
geometry remains provider-owned and scales with its raster. This extension does
not implement selection ranges or reverse click-to-text delivery.

Acceptance: scripts/test-worker-navigation.lua covers legacy deduplication and
opt-in same-line Unicode byte columns, rich/text restore and clearing. Worker
transport tests reject missing capability dependencies. The independent DjVu
Electron test exercises actual w/search motions across words, UTF-8 and zoom.
