# ADR 0016: Auxiliary native children use Neovim floats

Status: accepted for the internal adoption path; production native fallback unchanged.

Auxiliary popup presentations default to a bordered, centered, editor-relative float
rather than a new tab. Neovim owns its buffer, window and geometry. The initial size
is bounded to 100 columns by 30 rows and scales down with the editor. VimResized
recomputes geometry only for the matching window/buffer/token/incarnation; if too
small to provide a usable float, the window closes. The command area is reserved.

Allocation requires the source to remain visible in the current tab. Prefer the
current source window; otherwise require exactly one visible source window. Reject
missing or ambiguous context instead of selecting another tab. Opening focuses the
source then the float, letting Neovim restore that source when the float closes.
The auxiliary buffer uses bufhidden=wipe: closing its last window removes it and the
ownership controller closes the retained Chromium document. Native child closure
also deletes its buffer and float through the existing cancellation protocol.

This replaces tab creation in ADR 0015 only. No document-supplied popup dimensions
or window coordinates are trusted. The internal native-view fixture still mounts
using test rectangles; float ownership alone does not implement native composition.
Resolved grid placement, occlusion, trusted controls, focus/text integration and
routing remain gates before production adoption. Moving a popup to a tab or split
is a future explicit host action, not part of this change.
