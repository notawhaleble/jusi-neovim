import type { HighlightChunk } from './types.js';

const encoder = new TextEncoder();
export const textBytes = (text: string): number => encoder.encode(text).length;

/** Clamp to a Unicode scalar boundary; protocol positions are UTF-8 byte offsets. */
export function byteOffsetToIndex(text: string, byteOffset: number): number {
  let bytes = 0, index = 0;
  for (const char of text) {
    const size = textBytes(char);
    if (bytes + size > byteOffset) break;
    bytes += size; index += char.length;
  }
  return index;
}

export function decodeChunks(value: unknown): HighlightChunk[] {
  if (!Array.isArray(value)) return [];
  return value.filter(chunk => Array.isArray(chunk) && chunk.length >= 2)
    .map(chunk => ({ highlightId: Number(chunk[0]) || 0, text: String(chunk[1] ?? '') }))
    .filter(chunk => chunk.text !== '');
}

export function chunksText(chunks: HighlightChunk[]): string {
  return chunks.map(chunk => chunk.text).join('');
}

export function sliceChunks(chunks: HighlightChunk[], start: number, end = Infinity): HighlightChunk[] {
  const result: HighlightChunk[] = [];
  let offset = 0;
  for (const chunk of chunks) {
    const text = chunk.text.slice(Math.max(0, start - offset), Math.max(0, end - offset));
    if (text) result.push({ ...chunk, text });
    offset += chunk.text.length;
    if (offset >= end) break;
  }
  return result;
}

/** Retain the newest UTF-8 suffix, preserving highlights and scalar boundaries. */
export function boundChunks(chunks: HighlightChunk[], limit: number): { chunks: HighlightChunk[]; truncated: boolean } {
  const kept: HighlightChunk[] = [];
  let remaining = limit, truncated = false;
  for (let i = chunks.length - 1; i >= 0; i--) {
    if (kept.length >= 4096) { truncated = true; break; }
    const chunk = chunks[i];
    const bytes = textBytes(chunk.text);
    if (bytes <= remaining) {
      if (chunk.text) kept.push(chunk);
      remaining -= bytes;
    } else {
      let start = chunk.text.length, size = 0;
      while (start > 0) {
        const low = chunk.text.charCodeAt(start - 1);
        const width = low >= 0xdc00 && low <= 0xdfff && start > 1 ? 2 : 1;
        const next = textBytes(chunk.text.slice(start - width, start));
        if (size + next > remaining) break;
        size += next; start -= width;
      }
      if (start < chunk.text.length) kept.push({ ...chunk, text: chunk.text.slice(start) });
      truncated = true; break;
    }
  }
  kept.reverse();
  // Coalesce append streams instead of accumulating one object per write.
  const merged: HighlightChunk[] = [];
  for (const chunk of kept) {
    const last = merged.at(-1);
    if (last?.highlightId === chunk.highlightId) last.text += chunk.text;
    else merged.push({ ...chunk });
  }
  return { chunks: merged, truncated };
}
