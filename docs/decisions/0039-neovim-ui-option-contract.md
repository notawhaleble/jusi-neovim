# ADR 0039: Neovim UI options and capability negotiation

Retain scalar option_set values by name in completed screen snapshots. Subsequent
updates replace the value without mutating a published frame. Ignore malformed,
non-scalar and excessively large values; retain future scalar options for inspection.
Reported values describe Neovim's state, not a claim the host applies every preference.
The implementation inventory classifies consumption.

The host requires linegrid/multigrid and external command-line, messages and
completion, with tabline/wildmenu externalization disabled. Compare reported values
against that contract and publish unsupportedUiOptions. Log incompatible transitions
once; recompute and clear the condition when negotiation recovers. Missing/not-yet-
reported values are not guessed. A capability downgrade is not a supported rendering
fallback: secondary UIs must request compatible capabilities. A visible recovery
surface and full multi-UI operation remain unimplemented.

Keep Neovim's normal negotiation, without override=true. The attempted override
in Neovim 0.11.4 set all global widgets active, including ext_tabline/ext_wildmenu,
although this host had not requested them. A real tabline regression caught this;
upstream ui_refresh sets each global capability using (ui_ext[j] || inclusive).
Do not sacrifice the host's existing native/custom tabline to avoid downgrades.

This slice leaves font selection, spacing, blend and mouse-preference behavior
unchanged. Those have separate rendering/input consequences and must not be
approximated by whole-popup opacity or mismatched font metrics. No new preference
controls or document-facing API are introduced.

References:
- https://neovim.io/doc/user/api-ui-events/ (ui-override, ui-ext-options, option_set)
- https://github.com/neovim/neovim/blob/v0.11.4/src/nvim/ui.c (ui_refresh)

Acceptance includes a real second RPC UI with fewer capabilities, detection,
detachment/recovery and completed-frame immutability on Neovim 0.11.4.
