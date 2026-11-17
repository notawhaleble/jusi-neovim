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

/** Pixel offset in the rendered styled text, using UTF-16 only after protocol decoding. */
export function renderedTextOffset(element: HTMLElement, index: number): number {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node: Node | null, remaining = index;
  const range = document.createRange();
  range.setStart(element, 0);
  while ((node = walker.nextNode())) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) {
      range.setEnd(node, remaining);
      return range.getBoundingClientRect().width;
    }
    remaining -= length;
  }
  range.selectNodeContents(element);
  return range.getBoundingClientRect().width;
}
