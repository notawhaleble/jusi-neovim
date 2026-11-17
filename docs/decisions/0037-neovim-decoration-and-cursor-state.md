# ADR 0037: Neovim decorations and cursor visibility

Preserve underline, undercurl, underdouble, underdotted, underdashed and
strikethrough independently in the bridge's RGB attributes. Grid and external UI
chunks share one CSS conversion, including special decoration color, reverse
colors and simultaneous underline/strike. CSS decoration styles express the
protocol intent; exact rasterization remains font/platform dependent. For malformed
multiple underline styles, use curl, double, dotted, dashed, solid precedence.
Do not approximate blend by reducing whole-element opacity.

Honor mode_info_set's cursor_style_enabled flag. When disabled, use the host's
ordinary block cursor instead of stale mode-specific shape/color. Preserve mode
identity. busy_start/stop belongs to completed screen frames and suppresses both
editor and external command-line cursors. An active external command line owns
the cursor; do not leave a second cursor on the editor grid beneath it.

This slice did not implement block-cell inversion or cursor blinking; ADR 0040
subsequently adds those. Language-map cursor attributes and platform focus styling
remain in the implementation inventory. Prompt groups and UI option negotiation
are covered separately by ADRs 0038 and 0039.

Reference: https://neovim.io/doc/user/api-ui-events/ (mode_info_set, busy_start/stop,
hl_attr_define). Installed baseline remains Neovim 0.11.4.
