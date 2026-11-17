# ADR 0049: Shared browser clipboard editing commands

Copy, cut, paste and paste-as-plain-text are native WebContents editing actions
in the shared browser command dispatcher. macOS uses Command-C/X/V; Linux uses
Control-C/X/V. Shift-V invokes pasteAndMatchStyle. Physical codes preserve keyboard
layout independence; composition, Alt, mixed Control/Command, and key releases
are not dispatched. Shift-C/X remain available to the page.

Both adapters dispatch against the WebContents receiving the key. Successful
dispatch prevents the original event (and duplicate native menu handling).
Missing actions, destroyed contents and teardown exceptions return unhandled.
DOM dispatch precedes the shell's Command accelerator blocker, which previously
swallowed clipboard shortcuts. Native visibility and Neovim focus/mode ownership
remain in the adapter. Text-mode clipboard handling remains Neovim's responsibility.

Chromium handles selected text, editable fields, rich clipboard formats, and page
copy/cut/paste events. No clipboard data travels through guest IPC, no clipboard
permission is granted to page scripts, and no document value is added to extraction.
This does not implement site-triggered asynchronous navigator.clipboard access.

Acceptance uses the same real-key fixture for both transports: page selection to
system clipboard, Unicode multiline text into a textarea, cut and paste back,
plain paste into contenteditable, and absence of the shell bridge in the page.
Contract tests cover platform interpretation and missing/destroyed/throwing
actions. Verification and platform limits are recorded in STATUS.
