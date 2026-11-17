# ADR 0013: Native link menu to Neovim tabs

Status: implemented; automatic target/middle-click routing and opener adoption remain open.

A native context-menu selection authorizes an ordinary HTTP(S) link open. This is
separate from the one-use native popup fallback in ADR 0012: a new tab has no opener,
performs a fresh GET, and does not emulate a form submission or authentication popup.
Electron's [context-menu event](https://www.electronjs.org/docs/latest/api/web-contents#event-context-menu)
provides the link URL; the [native menu](https://www.electronjs.org/docs/latest/api/menu)
provides the explicit selection. Page content receives no host bridge.

Main holds the URL behind a single-use, five-second token scoped to the source guest.
Navigation (including same-document navigation), crash, destruction and another menu
invalidate the selection. The trusted shell maps the guest to its explicit buffer
and session IDs. Main verifies that session, provider, partition and source readiness;
Lua checks the source incarnation before allocating a tab and presentation buffer.
URLs travel as RPC data, never as Ex commands. Closing the new presentation uses the
existing common lifecycle. The original buffer and any edits remain intact.

The new presentation inherits the source profile and text policy, regardless of the
profile selected for future command-driven opens. Named profiles share browser data.
Private tabs deliberately follow the existing per-presentation isolation contract:
the menu says “fresh session”; a new private partition is allocated. They do not
inherit the private source's login. Native authentication popups still share the
source's exact Session. No source referrer or opener is forwarded by this action.

Local documents and unsupported protocols do not offer the action. Native auxiliary
popups do not have this menu because they have no Neovim presentation identity yet.
Menus whose source disappears are ignored. UI launch failures are reported through
the trusted Neovim feedback path. Background tabs and automatic target=_blank routing
are not implemented by this decision; these require separate lifecycle work.
