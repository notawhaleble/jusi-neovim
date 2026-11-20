# ADR 0053 — Page-scoped popup approval

Electron’s synchronous window-open callback supplies a disposition and URL. It
does not identify a trusted input event responsible for the open. A recent
mouse event on the same WebContents cannot establish that causal link.

The user can opt into repeated foreground opens with `:JusiWebAllowPopup!`.
This includes scripted opens while the host and initiating document have focus.
The permit lives on the opener, covers one active child at a time and ends on
cross-document navigation, reload, crash or destruction. A new child needs its
own approval to open another child. Existing allowed schemes, exact Session,
and parent/child lifetime apply. The plain command selects one-use approval.
