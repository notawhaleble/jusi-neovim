# ADR 0042: Browser buffer names follow committed URLs

The trusted main process observes committed top-level WebContents navigation and
same-document navigation through one helper shared by DOM guests and native
children. Initial binding publishes the current URL, including redirects that
finished before binding. Subframe events do not rename the buffer. Bridge session
and incarnation checks precede a structured Lua request containing only scalar
identity fields, never the native binding's live document object.

The runtime initializes the name on open and stores the exact current URL in
`b:jusi_browser_url`. Only the web provider is renamed; the backend's requested
surface URI remains unchanged so a name update cannot reload the guest. Neovim
keeps authoritative buffer identity and nofile behavior.

A free URL becomes the buffer name. Collisions use the first available ` [2]`,
` [3]`, etc.; independent buffers/sessions are never merged. Repeated publication
of an unchanged URL retains its assigned name. Existing names, including ordinary
buffers, are respected. Scheme-only names such as `about:blank` need the display
prefix `jusi-web://` because Neovim otherwise resolves them against the filesystem;
the exact URL remains metadata. URL characters are data passed to the buffer API,
not Ex command interpolation. Control characters and oversized/empty input are
rejected. Rename failures retain the exact metadata and expose
`b:jusi_browser_name_error`, allowing a later publication to retry.

Neovim's rename API allocates an unloaded alternate buffer holding the old name.
After a successful rename, cleanup removes only a newly allocated, unlisted,
unloaded, unmodified buffer with that exact old name. Existing or loaded buffers
are never removed. This prevents navigation history from reserving stale names or
accumulating empty buffers. The focused tests cover history and rename failure.

Acceptance covers both adapters with initial navigation, hash changes, history,
ordinary navigation, reload, redirect and independent duplicate-URL buffers;
Lua tests cover literal URL characters, collisions, stale identity and other
providers. This is naming behavior, not browser security or guest lifetime parity.
