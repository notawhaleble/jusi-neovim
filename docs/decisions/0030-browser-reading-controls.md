# ADR 0030: Browser reading controls and refresh anchors

Status: implemented; scoped verification in STATUS.

Browser document interaction remains shared across DOM and native adapters.
Ctrl-J dispatches DOM activation on the mapped text's closest semantic control,
inline click handler, tab stop, or pointer-cursor element. Links use their DOM
activation semantics, including page handlers and target policy, rather than a
host loadURL shortcut. Disabled/inert controls are rejected. This cannot identify
every delegated JavaScript listener or textless/canvas control, and synthetic click
is not equivalent to trusted user activation for restricted browser APIs.

Tab/Shift-Tab in Neovim navigation mode cycle distinct scroll owners represented
in the text map, in document order, including the document root. Each jump prefers
text currently visible within the destination's viewport. Shared region navigation
serializes requests and reads authoritative Neovim state before each execution;
results still require matching window, session, incarnation and document revision.
Adapters retain transport and commit responsibilities. Rich-mode Tab remains native
form navigation. Both shell keyboard paths preserve Shift-Tab.

Neovim saves each window's view and current line before document invalidation.
Repeated invalidations retain the original anchor until a matching commit. Commit
restores the nearest identical line, byte column and relative top line; absent an
identical line it clamps the old row/column. Anchors are scoped to buffer/session/
incarnation, cleaned on wipeout, and do not permit old tickets to publish. They are
text anchors, not durable DOM identities: duplicate/rewrapped/edited lines and
navigation within the same session may fall back to the old numerical position.

The mutation observer clears stale maps/jobs immediately for relevant changes,
then coalesces revision notifications with 400 ms quiet time and a 1500 ms maximum
batch interval. Thumbnail src/href changes and resource load events alone do not
rebuild text; current projection geometry is read from live DOM ranges. Empty-node
paint changes and extracted elements' unchanged typography/visibility/width styles
are ignored. Text insertion/removal, character changes, text-affecting styles,
visibility, resize and font changes still refresh. Cached style signatures are
built during extraction, avoiding a separate full-document scan per mutation.

This is filtered, batched full extraction, not incremental parsing. Continuous real
text changes can still cancel long extraction, and unsupported CSSOM/shadow/frame
changes remain. Resource reflow can leave text line wrapping stale until another
refresh; live projection still uses current ranges. No YouTube-specific selector,
document-facing IPC, permission bypass or browser-safety claim is introduced.
