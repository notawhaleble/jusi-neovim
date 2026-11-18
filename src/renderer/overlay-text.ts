import type { CmdlineState, HighlightChunk } from '../core/types.js';
import { byteOffsetToIndex, chunksText, sliceChunks } from '../core/ui-text.js';

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
export function commandText(state: CmdlineState): { chunks: HighlightChunk[]; cursorIndex: number; prefixLength: number } {
  const prefix: HighlightChunk[] = [
    { highlightId: 0, text: ' '.repeat(Math.max(0, state.indent)) + state.firstChar },
    // cmdline_show's hl_id is a group ID, not an hl_attr_define ID.
    { highlightId: 0, text: state.prompt, ...(state.promptHighlight ? {attrs: state.promptHighlight} : {}) },
  ];
  const content = state.chunks ?? [{ highlightId: 0, text: state.content }];
  const index = byteOffsetToIndex(state.content, state.position);
  let chunks = content;
  if (state.specialChar) {
    const replacedLength = state.specialShift ? 0 : segmenter.segment(state.content.slice(index))[Symbol.iterator]().next().value?.segment.length ?? 0;
    chunks = [...sliceChunks(content, 0, index), { highlightId: 0, text: state.specialChar },
      ...sliceChunks(content, index + replacedLength)];
  }
  const prefixLength = chunksText(prefix).length;
  return { chunks: [...prefix, ...chunks], cursorIndex: prefixLength + index, prefixLength };
}

/** Wrap at rendered grapheme boundaries, keeping chunk styles and explicit empty lines. */
export function wrapHighlighted(chunks: HighlightChunk[], maxWidth: number,
  measure: (text: string, width: number) => number): HighlightChunk[][] {
  const text = chunksText(chunks);
  const lines: HighlightChunk[][] = [];
  let start = 0, width = 0;
  for (const { segment, index } of segmenter.segment(text)) {
    if (segment === '\n' || segment === '\r\n') {
      lines.push(sliceChunks(chunks, start, index)); start = index + segment.length; width = 0; continue;
    }
    let size = measure(segment, width);
    if (width > 0 && width + size > maxWidth + 0.01) {
      lines.push(sliceChunks(chunks, start, index)); start = index; width = 0; size = measure(segment, 0);
    }
    width += size;
  }
  lines.push(sliceChunks(chunks, start));
  return lines;
}

/** Locate the glyph after a decoded UTF-16 offset, including at a soft wrap. */
export function renderedGlyphRect(element: HTMLElement, index: number, length: number, end: HTMLElement): DOMRect {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let remaining = index;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const size = node.textContent?.length ?? 0;
    if (remaining < size) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.setEnd(node, Math.min(size, remaining + length));
      return range.getBoundingClientRect();
    }
    remaining -= size;
  }
  return end.getBoundingClientRect();
}
