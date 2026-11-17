# ADR 0041: Browser statusline ownership across window and buffer changes

Updated 2026-10-17 after `tabe` followed by `buffer {existing-web-buffer}`
reproduced duplication despite the initial split/tab-split fix.

Neovim copies and remembers window-local options when displaying existing buffers,
including copies from another window showing the buffer. Window-creation events
alone cannot account for this. Restoring on BufLeave did not prevent the observed
copy from the other window; the event trace is in STATUS.

Each installed browser status expression contains an internal numeric format ID.
The runtime stores the exact installed string and its original local option for
that ID. On attachment it recognizes only an exact registered format, recovers
its original option, and installs one decoration. Non-browser attachment restores
the original when a copied decoration is present. User replacements are treated as
new input, including an explicitly empty option. No window-ownership inference or
cross-window source tracking is needed. Both browser adapters share this Lua code.

An empty original retains global inheritance; an explicit local format equal to
the global text remains explicit. Resolve the global option explicitly when
constructing an inherited format. Newly displayed buffers retain Neovim's own
option policy rather than receiving the departed buffer's custom format.

Records are interned by original option and resolved base for the Neovim process
lifetime. They cannot be discarded when a window closes because Neovim may retain
and later copy the installed string. Repeated attachment does not allocate new
records; distinct user format/global-base combinations do. Arbitrary custom
statusline-plugin interoperability and runtime hot-reloading are not acceptance
claims of this change.

Headless and shared desktop workflows cover repeated new tabs followed by existing
buffer selection and plain/browser revisits. Tests also retain split/tab-split
coverage and distinguish custom formats, global inheritance and explicit clearing.
This change makes no guest lifetime, URL naming or browser safety parity claim.
