# ADR 0035: Neovim external command and message UI

Status: implemented with scoped acceptance and limits in STATUS.

Keep external command lines by Neovim level. Hiding a nested line restores its
parent, including position and special-character state. Block show/append events
carry one lines/line argument; preserve their highlighted chunks separately from
the active command line. Published snapshots are not mutated by later events.

Command positions and external completion columns are UTF-8 byte offsets. Convert
them at Unicode scalar boundaries, then measure the rendered styled text for the
caret and completion anchor. Horizontal command scrolling uses the same measured
position. A completion with missing grid ownership or missing command anchor is
hidden rather than placed on a guessed grid. Completion rows retain kind/menu and
the selected item's info. Special-character overwrite operates on a grapheme.

Preserve attribute IDs on command, block, message, history and status chunks.
Render text through textContent. Wrap message text on grapheme boundaries using
font measurements, retaining chunk attributes and explicit newlines. Prompt hl_id
is a highlight *group* ID in Neovim 0.11.4, unlike the chunk attribute IDs; retain
it in bridge state and resolve it separately as specified in ADR 0038.

The local output pager must not consume answers to Neovim dialogs. Active command
lines and confirm/confirm_sub/number_prompt messages bypass its input interception
and synthetic hit-enter prompt. Neovim owns answer handling, cancellation and
completion selection. Display-revision dismissal remains as specified in ADR 0032.

Retain at most 128 KiB of UTF-8 text per message and 512 KiB per live/history list,
with at most 200 entries and 4096 chunks per entry. Keep newest suffixes at Unicode
scalar boundaries and mark truncation visibly. Append/replacement keeps the
existing message identity and advances display revisions. These are retained
presentation limits, not RPC decoding or Neovim history limits.

References:
- https://neovim.io/doc/user/api-ui-events/
- https://github.com/neovim/neovim/blob/v0.11.4/src/nvim/ex_getln.c
- https://github.com/neovim/neovim/blob/v0.11.4/src/nvim/message.c
