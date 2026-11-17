# ADR 0025: Authoritative selection spans

Status: accepted for character, linewise and ordinary rectangular selections.

Neovim resolves selection semantics through getregionpos, with the active mode and
selection option. The runtime converts its per-line inclusive byte regions into
half-open code-point spans. This preserves exclusive and reversed selections,
composing characters, linewise regions and the differing text ranges of a visual
block. Consumers do not reconstruct editor selection semantics from two corners.
See the [Neovim region contract](https://neovim.io/doc/user/vimfn/#getregionpos()).

BufferSelectionRange carries optional spans alongside legacy endpoints. The bridge
validates nonnegative integer coordinates and bounds the list. When spans are present,
including an empty list, they supersede legacy endpoints. Older producers retain the
inclusive endpoint fallback. The shared browser mapper converts spans to UTF-16;
one shared script clears the old overlay and paints all mapped ranges. DOM and native
adapters have no selection-specific behavior.

Virtual space beyond a short line contributes no text. A partial terminal cell cannot
be represented faithfully by a DOM Range, so any region cutting a tab or wide
character suppresses the whole selection projection. Regions exceeding 10,000 lines,
failed region resolution and stale/out-of-range mirror rows also produce no guessed
highlight. Neovim editing/yanking still works. Selection/virtualedit/tabstop option
changes refresh the authoritative snapshot.

This is not complete selection parity: visual-block dollar-motion semantics,
partial cells, complex grapheme/bidi/cross-node and transformed-layout cases remain
outside acceptance. The normal rectangular block, Unicode exclusive/reverse,
short/empty line and clear-on-Escape cases are covered by Neovim tests and/or the
same desktop geometry fixture in both adapters.
