# ADR 0036: Preserve Neovim grid cell allocation

Status: implemented; scoped acceptance in STATUS.

A grid_line item represents one cell. Its text may contain multiple Unicode code
points, including combining sequences; empty text denotes continuation of a wide
character. Repetition repeats cells, not individual code points. Preserve these
values in the bridge instead of splitting strings and substituting spaces.

Published text runs carry their Neovim column allocation. A wide leading cell and
its continuation occupy two columns. Combining/Unicode cells stay separate from
adjacent text runs; contiguous ordinary ASCII cells with the same highlight may
coalesce. The renderer assigns run widths from columns times measured cell width,
so fallback font metrics and UTF-16 length cannot shift following cells. Direction
is isolated per run to prevent browser bidi reordering across Neovim allocations.
Rendered text remains textContent. Redraw snapshots remain immutable.

This does not establish full font shaping or bidi parity. The font still supplies
the glyph; oversized glyph ink can exceed its allocation. Prompt/message raw text
has a different, measured layout contract (ADR 0035). Neovim controls the grid's
ambiwidth/emoji decisions before the host receives the cells.

Reference: https://neovim.io/doc/user/api-ui-events/#ui-linegrid
