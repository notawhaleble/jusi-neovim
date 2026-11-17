# ADR 0021: Optional text for retained popup documents

Status: accepted for the experimental popup path. Controller ownership and projection
are superseded by ADR 0022; the publication and safety decisions remain applicable.

NativePopupText owns text work for one exact bound native document. It inherits the
source's text policy at allocation. Off means no extractor or mutation watcher is
installed. Rich attachment does not await extraction. The trusted toolbar displays
pending/building/ready/off/error independently of native visibility.

Main executes only the existing fixed browser extractor and change-counter scripts.
Results pass the existing bounded mirror validator and revision-checked Lua commit.
Navigation synchronously revokes the previous revision; document epochs and buffer
incarnations reject late work. Destruction disposes polling and publication authority.
No generic execution endpoint or document-to-host IPC is introduced.

The existing DOM observer is polled every 300 ms, serially. A changed counter clears
the prior mirror before extraction; a post-extraction counter check rejects intervening
mutation. Each document operation has a ten-second deadline. An error does not retry
extraction continuously: a later observed change or navigation can rebuild. There is
currently no explicit retry button. Timeout rejects the result, not arbitrary page CPU
execution. Extraction cooperatively yields in the guest renderer, not a parallel worker.

Publication makes text available in the bound Neovim buffer. Rich content stays
visible in editor mode; cursor/selection projection onto the popup is not implemented.
Shadow/frame coverage, performance/cap reporting and atomic mutation/publication timing
retain existing browser text limitations. Status readiness is not release acceptance.

Text refresh can temporarily park native views. A validated return-to-rich focus
request survives that interval and is applied only after placement acknowledgement
for the same active Neovim window/incarnation. Parking with a different active window
clears the request. A focused native view also retains focus through temporary hiding for refresh.
Hiding a view alone no longer discards the mode completion.

Focus delivery is acknowledged by Electron's child focus event, not by calling
WebContents.focus(). A same-owner restoration request remains pending if placement
interrupts delivery; the next acknowledged placement retries it. Actual focus,
text-mode entry, invalid identity or a changed active Neovim window clears it.
The focused desktop fixture interrupts one focus delivery and invalidates the
viewport before requiring restoration, then exercises repeated text refreshes.
