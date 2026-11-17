# ADR 0040: Neovim cursor glyphs and blink lifecycle

Render a block cursor as an opaque cell with its glyph, not a translucent overlay.
Resolve the glyph, allocation and highlight from the active grid's published runs.
ASCII runs permit indexing; non-ASCII runs retain the complete Neovim cell text,
including combining marks and wide-cell allocation. A continuation points back to
its owning glyph. External command-line glyphs use grapheme boundaries and their
rendered width, with the existing UTF-8-to-UTF-16 position conversion.

For attr_id zero (or absent), swap the underlying cell's effective foreground and
background, accounting for reverse. Preserve its font/decorations. A nonzero cursor
attribute supplies its own colors and font, with screen defaults for missing colors.
Bars retain percentage geometry; block glyphs use the same font metrics as the grid.

Use one Web Animation per visible cursor, with Neovim's millisecond blinkwait,
blinkoff and blinkon. Any zero disables blinking. The initial delay is visible;
each following cycle starts with blinkoff, then blinkon. Unrelated publications
retain the animation; position, text or mode/style changes restart it. Physical
shell keydown restarts the initial visible interval even without cursor movement.
Reuse the external command-line cursor element across renders. Hiding a cursor
cancels its animation and discards its identity; reappearance starts fresh. Existing
completed-frame busy suppression and external command-line ownership still apply.

This does not implement language-map cursor selection or inactive-window styling.
Exact font rasterization, colored emoji glyphs and platform focus appearance are
not claims of terminal/GUI pixel equivalence.

References: installed Neovim 0.11.4 runtime/doc/ui.txt (mode_info_set, attr_id),
runtime/doc/options.txt (guicursor, cursor-blinking). Acceptance covers run/cell
resolution, reverse and explicit highlights, zero timings, cancellation/reappearance,
real grid/command-line glyphs and deterministic Chromium animation phase sampling.
