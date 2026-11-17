# ADR 0038: Resolve command prompt highlight groups in the bridge

cmdline_show's prompt highlight ID identifies a Neovim highlight group, not an
entry in the UI attribute table. Resolve positive IDs with nvim_get_hl in global
namespace 0, link=false and create=false. Decode the returned effective RGB
attributes through the same conversion as hl_attr_define. Keep the numeric group
ID and the resolved attributes separate; never synthesize a UI attribute ID.

A visible prompt initially uses default styling. One lookup may be in flight;
newer completed prompt identity replaces the desired request. Replies may enrich
only the current completed prompt, identified by level, prompt text, group ID and
highlight epoch. Hide and highlight-definition/default-color/group events advance
that epoch. Nested restoration resolves the restored prompt again. Failures retain
default styling without retry loops; disposal and process exit discard replies.
Enrichment publishes a new immutable snapshot without sampling pending redraws.
Command content/position changes alone do not require another group lookup.

Resolved attributes travel only on the prompt chunk. Other command/message/grid
chunks retain protocol attribute IDs. This uses Neovim's global echohl prompt
semantics; it does not implement arbitrary window highlight namespaces or general
hl_group_set-based styling for host widgets.

References:
- https://neovim.io/doc/user/api-ui-events/ (cmdline_show)
- https://neovim.io/doc/user/api/#nvim_get_hl()

Baseline acceptance: Neovim 0.11.4; other versions remain in the conformance matrix.
