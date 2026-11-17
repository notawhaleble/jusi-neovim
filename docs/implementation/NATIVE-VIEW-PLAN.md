# Native-view integration gates

2026-10-14 routing update: ADR 0031 makes native popup integration the default,
using horizontal splits. Earlier references below to opt-in floats or auxiliary
window fallback are historical; the remaining acceptance gates still apply.

The engine capability gate lives in scripts/adoption-cases.mjs and ADR 0014. Passing
it does not authorize declaring R1/R2/R5/R6/R7 complete. Keep the existing webview and
native-popup paths until the following integration gates pass together.

Scope distinction: native-view composition and focus are transport integration;
text/navigation/mapping are shared browser capabilities tracked in PLAN.md M3.
Only new-window authorization, actual child adoption, opener/exact Session semantics
and parent/child lifetime are intrinsically child-window work. Current native views
are reached through child creation, but that does not make browser behavior specific
to popups. Existing historical filenames and feature flags retain their names.

## 1. Neovim owner and native document lifecycle

Implemented in the internal integration gate (ADR 0015): NativeChildOwner plus
jusi.native-child bind real Neovim state before fixture mounting. Default routing remains unchanged; ADR 0019 adds opt-in production integration. Fixed fixture bounds do not satisfy gate 2.

Main allocates the actual child synchronously in createWindow using the supplied
WebContents; it must not substitute loadURL or duplicate a POST. Keep it unmounted
while a bounded request creates the Neovim float/buffer (ADR 0016). The pending record retains
source session/incarnation, child WebContents, inherited Session and an opaque nonce.
No provider/document may select another presentation's WebContents or partition.

Lua validates the source incarnation and allocates the child presentation. Main binds
that exact buffer/session/incarnation to the pending document only after observing
the Neovim state update. Publish the attachment descriptor only after binding. On
failure, timeout, source invalidation or Neovim exit, close the pending document and
remove only the explicitly allocated child buffer. Late acknowledgements must not
revive it. Child window.close must idempotently close the bound Neovim presentation;
Neovim close must close the child even when parked. Source-close policy must be
explicit and preserve the current auxiliary behavior until changed deliberately.

Private adopted children retain the source's exact Session through a main-owned
relationship. Do not expose an arbitrary partition override in the provider API.
Existing fresh-private link tabs keep their disclosed semantics. Test parent/child
close order, buffer reuse, private source disappearance, revoked reservations,
multiple popups and allocation failure. Rate/quantity limits belong to the host.

## 2. Grid composition and trusted controls

The internal runtime now allocates/resizes a bordered Neovim float (ADR 0016).
The fixture now resolves native rectangles from actual Neovim grids with declared
test cell metrics (ADR 0017), including occlusion and generation rejection. Production
metric transport (ADR 0018) now drives the opt-in native subscriber and trusted
controls (ADR 0019). Tab retention, resize, overlap and close pass in the production
shell on macOS. Atomic UI coordination, full zoom/DPI coverage and performance
remain open. Gate 2 is partial.

Extend the surface transport with resolved placement containing session, window,
grid identity and layout generation. Main rejects stale placement and hides views
whose ownership or clipping cannot be resolved. Bounds come from the existing
Neovim compositor, including app zoom/DPI; fixture rectangles are not implementation.

Native views paint outside the DOM webview stacking model. Reserve visible trusted
controls without allowing a document to cover Neovim chrome, command/message areas,
floating windows or menus. Solve overlaps, clipping and split/tab reattachment before
enabling the path. Cursor/selection projection now runs inside either document through
the shared controller; trusted shell chrome still needs explicit native composition.

Acceptance: split reassignment, hidden tab, floats/menus, resize/DPI/zoom, stale grid,
text buffer replacement, host resize while parked and fail-closed placement. Preserve
browser state across park/reattach, with exactly one visible owner per document.

## 3. Input and optional text

Bound focus and Ctrl-\/Ctrl-N, `i`, Ctrl-Q routing are implemented for the opt-in
path (ADR 0020). Lua rejects stale reservations and hidden-tab focus requests.
Optional popup extraction, mutation refresh and revision-checked publication are
implemented (ADR 0021), with inherited off policy and toolbar status. ADR 0022 shares
the browser controller with ordinary pages, including basic cursor/selection projection.
Shared browser interaction in PLAN.md M3 implements link/scroll/hit-test dispatch and
trusted retry across both adapters (ADR 0023). Shared desktop and packaged fixtures
cover command delivery, click-to-cursor and rebuild; native event delivery/focus
remain transport acceptance, not a separate browser behavior implementation. Broad Unicode mapping is also shared browser work;
native composition acceptance remains here.

Use the same source-identified action dispatcher for close and rich/text modes.
Native focus events must name the bound presentation, not the last active tab. Reject
stale focus callbacks, preserve IME and text entry, and ensure host shortcuts survive
page handlers. Text navigation returns to the authoritative Neovim window.

Main executes fixed backend operations for extraction/projection against the bound
document, with generation/cancellation checks; add no generic renderer or document
JavaScript execution endpoint. Treat results as untrusted and reuse bounded validation
and atomic Neovim publication. Rich rendering stays independent of text readiness.
Test text off, mutation/nav during extraction, mapping after resize, crashes, close,
late replies and common shortcuts in development and packaged builds.

## 4. New-window routing and release evidence

Only after the above gates, classify supported new-window requests without treating
document-supplied userActivation/features/frame names as authorization. Preserve
GET/POST/referrer/opener/noopener semantics and make unsupported cases visible.
Unsolicited opens stay blocked. Explicit foreground/background policy needs focus
and loading tests; it must not silently replay a request into another profile.

Run macOS/Linux desktop and packaged sandbox checks plus real OAuth compatibility
with user-controlled accounts. Signed release, independent security review, updates,
OS media and certificate acceptance remain separate. No browser safety parity claim.
