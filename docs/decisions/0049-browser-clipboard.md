# ADR 0049: Shared browser clipboard editing commands

Select all, undo, redo, copy, cut, paste and paste-as-plain-text are native WebContents editing actions
in the shared browser command dispatcher. macOS uses Command-C/X/V; Linux uses
Control-C/X/V. The same platform modifier with A selects all, Z undoes, and
Shift-Z redoes. Linux also accepts Control-Y for redo. Shift-V with the
platform modifier invokes pasteAndMatchStyle. Physical codes preserve keyboard
layout independence; composition, Alt, mixed Control/Command, and key releases
are not dispatched. Shift-C/X remain available to the page.

Both adapters dispatch against the WebContents receiving the key. Successful
dispatch prevents the original event (and duplicate native menu handling).
Missing actions, destroyed contents and teardown exceptions return unhandled.
DOM dispatch precedes the shell's Command accelerator blocker, which previously
swallowed clipboard shortcuts. Native visibility and Neovim focus/mode ownership
remain in the adapter. Text-mode clipboard handling remains Neovim's responsibility.

Chromium handles selected text, editable fields, rich clipboard formats, and page
copy/cut/paste events. A page copy button uses Chromium's asynchronous
clipboard API. The network session grants a clipboard-sanitized-write request
only for the focused top-level document with a matching request origin.
An isolated world checks secure context, document visibility, focus and transient
user activation. Blur, document replacement and main-frame navigation invalidate
an outstanding decision. Clipboard contents stay within Chromium's clipboard
path. This permission covers Chromium's sanitized formats and is evaluated per
request. Clipboard reads, local-document requests and standing grants are denied.

Acceptance uses the same real-key fixture for both transports: page selection to
system clipboard, Unicode multiline text into a textarea, cut and paste back,
plain paste into contenteditable, and absence of the shell bridge in the page.
After a rich-to-Neovim-to-rich focus round trip, select-all and paste replace
the contents of a single-line input, textarea and contenteditable. Undo and
redo traverse each field's native editing history.
Contract tests cover platform interpretation and missing/destroyed/throwing
actions. Verification and platform limits are recorded in STATUS.
