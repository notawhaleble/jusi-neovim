# ADR 0048: Worker surface actions and text viewport navigation

Status: implemented.

Trusted provider mappings can call `jusi_neovim.worker_action(action, count)` for
the current buffer/window. Workers negotiate `surface.actions` and receive
`{type:"action", sequence, windowId, action, count}`. Action names are opaque to
core (64 bounded identifier characters); count is an integer from 1 to 10,000.
Actions have a separate monotonic sequence and require a ready, active worker in
text mode. They do not require extraction or a document ticket, so navigation
continues to work when text is disabled or pending. Closed and rich-mode owners
cannot dispatch. Installed providers own their mappings and action meanings.

A surface-changing action is an intention, not a host revision or text commit.
Providers must use their existing real surface navigation/lifecycle to publish a
new document. The external DjVu worker queues a page request; its sandboxed viewer
submits the existing same-origin form. Acknowledged action sequences preserve
newer requests that arrive while an older navigation is in flight. Core neither
knows page counts nor runs provider JavaScript.

Workers may additionally negotiate `source.navigate.viewport`, requiring cursor
navigation and its dependencies. Non-null navigation frames carry a viewport:
`{topRow, bottomRow, skipColumns}`. Rows index the returned document; topRow is
inclusive and bottomRow exclusive. skipColumns is Neovim's winsaveview skipcol
(wrapped display columns), not a byte offset. These values describe Neovim's view,
not image geometry. WinScrolled/WinResized schedule navigation; viewport changes
participate in the existing ticket/window checks and deduplication. Clear frames
omit viewport. Legacy workers keep their original frames and behavior.

Providers can use viewport changes to coordinate their rich representation with
Neovim scrolling. The external DjVu implementation reveals only beyond the image
edge; when Neovim scrolls first, it follows actual cursor-box progression. No
source offsets, source row heights or image word widths are guessed. Reverse
rich-to-text cursor/scroll delivery remains outside this contract.

Acceptance includes runtime actions before text publication, rich/close rejection,
viewport-only changes, dependency rejection, and real DjVu key input, text-off
pages, boundary clamping, in-flight actions and both scroll boundaries.
