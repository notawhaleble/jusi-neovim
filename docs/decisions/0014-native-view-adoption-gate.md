# ADR 0014: Gate opener adoption before replacing the web surface

Status: capability gate implemented; production adoption is not enabled.

## Decision

Keep production link tabs and native auxiliary popups on ADRs 0012–0013 until a
native-view backend meets the host's layout, input and text contracts. The first
executable gate uses real sandboxed Chromium documents, not reconstructed URLs.

Electron's [WebContentsView constructor](https://www.electronjs.org/docs/latest/api/web-contents-view)
accepts an existing WebContents. The window-open handler supplies that object through
its createWindow options. The fixture must pass both options.webContents and
options.webPreferences to WebContentsView. Passing only preferences allocates a new,
unrelated blank document and loses the intended popup. Treat the supplied preferences
as already constrained by the opener and the host's explicit security overrides.

The gate creates an initially unmounted child in the callback. It then attaches,
parks, resizes and moves that same view across fixture hosts. Its identity, JS state,
input value, sessionStorage and opener remain intact without another document request.
The existing extraction script also runs against the retained document and excludes
input values. Cross-origin redirects, postMessage source identity, script close,
about:blank inheritance, POST/redirect and source destruction are acceptance cases.

Removing a native view is not disposal. Store the WebContents reference separately:
a destroyed view may no longer expose it. Every error/teardown path closes documents
explicitly. Production ownership must be tied to Neovim presentation lifetimes, not
window focus, URL equality or native-view reachability.

## Boundary

scripts/adoption-cases.mjs is a test-only fixture, run independently with
npm run smoke:adoption and included in desktop/packaged smoke. It uses fixed fixture
bounds and does not prove Neovim grid composition, text publication, input routing,
common shortcuts, real OAuth compatibility or release safety. It creates no production
backend and adds no guest IPC. No current guest is converted or reloaded to imitate
adoption. Production behavior remains documented in ADRs 0012–0013.

The production integration gates and ownership protocol are in
[the adoption implementation plan](../implementation/NATIVE-VIEW-PLAN.md).
