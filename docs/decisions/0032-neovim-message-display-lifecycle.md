# ADR 0032: Message display revisions and pager acknowledgement

Status: implemented, scoped to the external message pager.

Neovim owns message events and editor prompts. The bridge assigns each displayed
message a monotonically increasing revision, using the message state's version
at insertion/replacement/append. History publication also receives revisions.
Optional Neovim message IDs remain separate from these display revisions.

A local pager dismissal records a revision watermark. Unchanged earlier entries
cannot reappear because an unrelated message changes the global version. New
messages, including identical text and updates to an existing message, remain
eligible for display. This is presentation state; it does not delete Neovim's
message history or claim a command has completed.

The viewport initially follows the output tail. It continues following while at
the tail and preserves a user's scrolled-back position when more output arrives.
Enter and Escape/q dismissal of a real return_prompt also forward input to Neovim.
Only the protocol kind identifies return_prompt; message text is not a control
signal. Synthetic pagers continue to dismiss locally.

Handle msg_history_clear and accept the six-field cmdline_show shape used by older
supported Neovim versions. This does not establish full command-line/dialog
conformance: nested levels, highlighted chunks, Unicode byte positions and prompt
variants remain in the integration review backlog.
