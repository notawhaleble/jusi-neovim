# ADR 0023: Shared browser interaction and command identity

Status: accepted.

Browser interaction is independent of document placement. The web backend's
interaction module owns cursor/index conversion, link activation, scroll followed
by projection, hit-result validation and text retry dispatch. Both DOM and native
adapters provide the same operation port and a read of current ownership. They
retain coordinate acquisition, event delivery and focus responsibilities.

Commands carry buffer, window, session and incarnation, plus the authoritative
cursor and mirror revision captured in main. The renderer may receive a command
before rendering the latest state snapshot; it must not substitute its previous
cursor. Main flushes pending state before delivering a command, and the renderer
interaction port reads pending authoritative state without waiting for painting.
A mismatched mirror revision or target is rejected. Late hit results are
discarded after ownership or mirror changes. Cursor commits also carry a document
ticket; Lua checks buffer, incarnation, revision, session and current tab atomically
before moving the cursor. No new document-facing API is introduced.

Native documents temporarily park during compositor acknowledgement. This does
not revoke commands for their authoritative Neovim window in the current tab.
Pointer events still require the native view to be visible. Hidden-tab, replaced
and closed targets cannot resolve an interaction port. A native-owned target is
claimed even when rejected, preventing fallback to a different transport.

The native trusted text status is a rebuild button using an opaque current control
token. The shell sender is checked in main, and both adapters dispatch retry to the
same text job. Disabled/building states cannot request a new native job. A document
cannot mint a control token or access the shell preload.

Both adapters run shared conformance cases and the same desktop command fixture.
This establishes basic link, scroll, click-to-cursor and retry integration, not
complete browser parity. Character mapping, zoom/DPI coordinates, IME, performance
and wider focus/concurrency acceptance remain explicit implementation gates.

Cursor projection deduplication refers only to the last acknowledged state when
no different projection has been dispatched since. Dispatch clears that cache:
an A→B→A sequence must send its final A even while B's transport acknowledgement
is pending. Only the latest sequence may commit the completed signature. This
contract is shared by DOM and native adapters and is tested with delayed replies.
