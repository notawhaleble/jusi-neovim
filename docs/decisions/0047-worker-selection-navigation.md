# ADR 0047: Optional visual selections for worker source navigation

Status: implemented.

Workers may negotiate `source.navigate.selection`, requiring
`source.navigate.cursor` and its dependencies. Non-null navigation frames then
carry `selection`: null outside Visual mode, or an array of ranges
`{row, startByte, endByte}`. Row is a zero-based index into the published document's
lines; byte positions are zero-based, end-exclusive UTF-8 positions in that line's
text. They are never offsets in provider source. Clear frames omit selection.

Neovim resolves characterwise, linewise, reversed, exclusive and block selections
with the existing shared getregionpos resolver. Worker delivery converts its
character positions to UTF-8 bytes. Capture shares the cursor's current-document,
window, rich-mode and debounce checks. Deduplication includes the selection;
ModeChanged and selection-related option changes also schedule navigation.

Up to 512 per-line ranges fit within the existing 64 KiB input-frame budget.
Unrepresentable partial-cell selections and selections exceeding this cap are
sent as an empty array, suppressing the entire visual projection. This differs
from null, which restores cursor projection. Neovim's actual selection/yank is
unaffected. Legacy providers receive no additional field.

Providers retain their own text-to-geometry mapping and choose which exact boxes
to paint. No guest-to-Neovim channel or source offset arithmetic is introduced.

Acceptance: worker navigation tests cover Unicode byte ranges, reverse/exclusive
selection, linewise spans, clearing and rich-mode suppression. Transport tests
reject missing dependencies. External DjVu Electron coverage exercises real
character, line and block selections, exclusive endpoints, reversal and Escape.
