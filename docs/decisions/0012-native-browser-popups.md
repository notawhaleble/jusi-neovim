# ADR 0012: One-use native popup fallback

Status: implemented first integration gate; Neovim-tab adoption remains open.

A URL-only replacement breaks browser opener relationships. Electron's synchronous
[window-open handler](https://www.electronjs.org/docs/latest/api/web-contents#contentssetwindowopenhandlerhandler)
supports createWindow returning WebContents. The integration fixture demonstrates
that a native BrowserWindow created there retains cross-origin window.opener,
postMessage source identity, redirect, shared session and window.close semantics.
Its existing DOM webview surface has no implemented adoption path for these created
WebContents; that requires a separate renderer/backend lifecycle milestone.

For this increment a popup is an auxiliary native child owned by an explicit source
guest, not a new Neovim presentation. The source buffer remains Neovim-owned. Source
navigation, crash, destruction and host close destroy the child. It has no text layer.
Ctrl-Q closes; Ctrl-backslash Ctrl-N returns to the current Neovim text navigation.

The handler details do not supply a userGesture flag. Do not infer user intent from
frameName, feature strings or a document-supplied navigator.userActivation check.
The trusted shell offers Allow next popup: a source-scoped permit lasting 15 seconds
and consumed on one attempt. Main checks shell sender, session/buffer identity and
guest partition. No standing origin allowlist is introduced. Blocking produces
rate-limited host feedback. This explicit grant permits the next request by that
page; it does not claim to distinguish trusted from unsolicited document scripts.

Only HTTP(S)/about:blank are admitted; local guests cannot arm. Nested children
are denied. The child reuses the exact source Session, including private partitions.
Web preferences retain sandbox/context isolation, disable Node and webview nesting,
and supply no preload. Host IPC still accepts only the original shell.
Native frame, dimensions and title are host controlled; title identifies scope and
current origin without URL path/query credentials. Page resize/title requests cannot
remove that identity. Existing navigation and permission checks apply.

See Electron's [window.open documentation](https://www.electronjs.org/docs/latest/api/window-open)
for opener/inherited preference behavior, including about:blank inheritance. Tests
cover these behaviors in the actual sandboxed guest rather than simulating the
browser protocol. No TLS bypass, credential import or browser safety parity claim.

Open work: Neovim tab adoption and ordinary-link routing, native popup text mapping,
OAuth provider compatibility, external protocol handling, popup policy ergonomics
and supported-platform/release evidence.

Background-tab dispositions are currently rejected with feedback; retry a foreground
open action. Automatic Neovim tab routing remains a separate milestone.
