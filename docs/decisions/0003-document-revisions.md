# ADR 0003: Document identity and commit ordering

Status: implemented; platform release validation tracked separately.

The bridge allocates a UUID each time a provider registers a buffer session.
Neovim also assigns a monotonically increasing incarnation when a buffer becomes a
presentation. Reusing a buffer number, including changing provider in place, does
not reuse identity. Local file partitions use the UUID, so a previous root grant
cannot leak into a replacement session.

Electron main binds a guest WebContents to that session. The shell can acquire a
ticket only for an attached, ready guest owned by its window. Native navigation
and renderer-crash events revoke the current revision synchronously in main.
Reloading the same URL creates a new revision; in-page navigation does not.
Moving the same live guest between Neovim windows/tabs retains identity.

A ticket carries buffer ID, session UUID, incarnation and revision. Main serializes
Neovim invalidations and commits per session. Neovim's `jusi.document` module checks
the incarnation and revision immediately before changing lines and restores buffer
options on failure. Main checks identity again after the RPC response before
publishing a mirror. The shell shows ready only when main accepts the commit.

An RPC already sent before navigation cannot be retroactively cancelled. Such a
write is ordered before the queued invalidation, which clears it; its response
cannot publish a stale mirror. Tests cover this ordering explicitly. This is a
serialized commit protocol, not a claim of simultaneous atomicity across Electron
and Neovim processes.

Closing/replacing a session revokes its tickets; obsolete guests are closed. A
crashed guest shows a reload action. Neovim shutdown first sends `qa!`, allowing
VimLeavePre/provider disposal, then waits up to one second each before SIGTERM and
SIGKILL. External worker process-tree ownership remains part of the provider SDK
milestone; this mechanism owns the embedded Neovim process only.
