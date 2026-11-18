# ADR 0032: Message display revisions and pager acknowledgement

Status: implemented, scoped to the external message pager.

Neovim owns message events and editor prompts. The bridge assigns each displayed
message a monotonically increasing revision, using the message state's version
at insertion/replacement/append. History publication also receives revisions.
Optional Neovim message IDs remain separate from these display revisions.

Only a Neovim `return_prompt` event requests hit-enter acknowledgement. A
command can pause between writes even when no UI busy event is active, as
Fugitive does with `:echon`. Output length determines the viewport and wrapping.
It cannot establish whether the editor is waiting for a key.

The viewport follows the tail until the user scrolls back. The renderer handles
viewport navigation locally and routes ordinary input to Neovim. Enter at the
tail reaches Neovim, which clears the acknowledged output via `msg_clear`.
Display each independent live entry on its own row in a block. Apply append and
replace requests in the bridge before wrapping entries.

Neovim 0.11.4 can send a mode or command status without clearing a preceding
echo. A nonempty showmode or showcmd takes over the output row, unless a dialog
or return prompt owns it. Message history has a separate lifecycle.
