# Neovim UI event inventory

Baseline: installed Neovim 0.11.4 API metadata, captured in
.local/review/nvim-c4-ui-events.json on 2026-10-16. This classifies every advertised
event, not just events observed in one scenario. Newer versions may append fields
or events; their absence here is not a compatibility claim.

Requested: rgb, ext_linegrid, ext_hlstate, ext_multigrid, ext_cmdline,
ext_popupmenu, ext_messages. ext_tabline, ext_wildmenu and legacy grid drawing are
not requested. Scalar option_set values are retained in completed snapshots
(ADR 0039). Incompatible capability changes are published as unsupportedUiOptions
and logged; detachment restores the supported configuration. There is no legacy
fallback or visible recovery surface. Secondary UIs must request compatible
capabilities. override=true is not used: on 0.11.4 it activates unrequested widgets.

| Event | Handling |
| --- | --- |
| mode_info_set | Partial |
| update_menu | Optional presentation omitted |
| busy_start | Implemented: frame-owned cursor suppression |
| busy_stop | Implemented: restores eligible cursor |
| mouse_on | Optional presentation omitted |
| mouse_off | Optional presentation omitted |
| mode_change | Partial |
| bell | Optional presentation omitted |
| visual_bell | Optional presentation omitted |
| flush | Implemented |
| suspend | Optional presentation omitted |
| set_title | Optional presentation omitted |
| set_icon | Optional presentation omitted |
| screenshot | Open conformance gap |
| option_set | Snapshot tracking and incompatible capability detection implemented; preferences classified below |
| chdir | Optional presentation omitted |
| update_fg | Inactive with requested extensions |
| update_bg | Inactive with requested extensions |
| update_sp | Inactive with requested extensions |
| resize | Inactive with requested extensions |
| clear | Inactive with requested extensions |
| eol_clear | Inactive with requested extensions |
| cursor_goto | Inactive with requested extensions |
| highlight_set | Inactive with requested extensions |
| put | Inactive with requested extensions |
| set_scroll_region | Inactive with requested extensions |
| scroll | Inactive with requested extensions |
| default_colors_set | Implemented |
| hl_attr_define | Implemented |
| hl_group_set | Invalidates prompt resolution; general host-widget mapping omitted |
| grid_resize | Implemented |
| grid_clear | Implemented |
| grid_cursor_goto | Implemented |
| grid_line | Implemented |
| grid_scroll | Implemented |
| grid_destroy | Implemented |
| win_pos | Implemented |
| win_float_pos | Implemented |
| win_external_pos | Open conformance gap |
| win_hide | Implemented |
| win_close | Implemented |
| msg_set_pos | Open conformance gap |
| win_viewport | Open conformance gap |
| win_viewport_margins | Open conformance gap |
| win_extmark | Open conformance gap |
| popupmenu_show | Implemented |
| popupmenu_hide | Implemented |
| popupmenu_select | Implemented |
| tabline_update | Inactive with requested extensions |
| cmdline_show | Implemented |
| cmdline_pos | Implemented |
| cmdline_special_char | Implemented |
| cmdline_hide | Implemented |
| cmdline_block_show | Implemented |
| cmdline_block_append | Implemented |
| cmdline_block_hide | Implemented |
| wildmenu_show | Inactive with requested extensions |
| wildmenu_select | Inactive with requested extensions |
| wildmenu_hide | Inactive with requested extensions |
| msg_show | Implemented |
| msg_clear | Implemented |
| msg_showcmd | Implemented |
| msg_showmode | Implemented |
| msg_ruler | Implemented |
| msg_history_show | Implemented |
| msg_history_clear | Implemented |
| error_exit | Open conformance gap |

## Qualifications and next slices

Implemented means a handler exists, with scoped acceptance in STATUS; it does
not establish all input/version combinations. C4a repairs cell allocation and
combining/wide text. Float anchor field compatibility, partial-scroll boundaries,
highlight blend and fallback glyph clipping still need acceptance. Underline variants
and strikethrough are preserved and share renderer conversion (ADR 0037).
Mode shape/color metadata and cursor-style enablement are handled. Busy state
suppresses editor/command cursors; an active command line suppresses the editor
cursor. Block cursors repaint the owning glyph with swapped effective cell colors
or explicit cursor attributes; blink timings and animation lifetime are implemented
(ADR 0040). Language mapping attributes and platform focus styling remain incomplete.

Prompt hl_id is a group ID; chunk hl IDs are attribute IDs. Prompt groups are resolved via nvim_get_hl with stale-reply protection (ADR 0038).
hl_group_set invalidates prompt resolution; general named host-widget styling
remains unimplemented. ext_hlstate semantic info is
currently ignored; RGB attributes are used. Decoration blend remains omitted.

win_viewport/margins/extmark do not replace grid cells; viewport mapping and
semantic use are unimplemented. External windows have no host surface. msg_set_pos
is not expected for ordinary ext_messages output but has no modeled fallback.
Screenshot and error_exit semantics are not implemented; process exit is handled
separately. Mouse events are forwarded as a GUI irrespective of mouse_on/off.
Bell/title/menu presentation is omitted; suspend is intentionally a no-op in this
embedded desktop host. Current font selection/spacing is host-owned; guifont,
guifontwide and linespace option changes are not honored.

| Platform/version | Evidence |
| --- | --- |
| macOS arm64, Neovim 0.11.4, Electron 44.5.0 | Scoped unit/live/source/package acceptance in STATUS |
| Linux | No C4 execution; original attention issue remains unverified |
| Other Neovim versions/current release | Not tested; minimum-version policy undecided |
| Real IME, complex bidi/shaping and alternate fonts | Not accepted |

Upstream reference: https://neovim.io/doc/user/api-ui-events/ . The current upstream
protocol also has connect/restart/ui_send events beyond this installed metadata;
reconnection/restart is not implemented, stdout_tty/ui_send is not enabled.

## UI option consumption (ADR 0039)

| Reported option | Host policy / remaining work |
| --- | --- |
| ext_linegrid, ext_multigrid, ext_cmdline, ext_messages, ext_popupmenu | Required event model; negotiated values retained, incompatible changes reported |
| ext_hlstate | Requested; semantic metadata mostly unused, RGB attributes remain authoritative |
| ext_tabline, ext_wildmenu | Not requested; native tabline stays on grid 1 |
| Other ext_* / future scalar options | Retained for inspection, no automatic feature enablement |
| arabicshape, ambiwidth, emoji | Neovim grid allocation remains authoritative; external overlay shaping/width parity still needs acceptance |
| showtabline | Neovim-drawn cells and geometry consumed; no duplicate host tabline policy |
| termguicolors | RGB UI attribute/default-color events consumed; no terminal palette approximation |
| guifont, guifontwide, linespace | Recorded; existing host font/zoom/line-height policy retained; Neovim preference support remains open |
| pumblend | Recorded; popup remains opaque; proper background blending remains open |
| mousehide | Recorded; existing host pointer hiding retained; following this preference remains open |
| mousefocus | Recorded; automatic focus following the pointer remains unsupported |
| mousemoveevent | Recorded; standalone Neovim mouse-move delivery remains unsupported (drag input is separate) |

Tracking an option is not equivalent to honoring it. These explicit limits do not
close overall display/input conformance. No new UI-affecting manual-review count
is added for snapshot tracking and negotiation diagnostics alone.
