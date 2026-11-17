import type { BufferSelectionRange, MirrorDocument } from '../../core/types.js';

/** Bridge columns count Unicode code points; DOM/mirror offsets count UTF-16 units. */
export function columnOffset(text: string, column: number): number {
  let offset = 0, count = 0;
  for (const point of text) {
    if (count >= Math.max(0, column)) break;
    offset += point.length; count++;
  }
  return offset;
}
export function offsetColumn(text: string, offset: number): number {
  let units = 0, column = 0;
  for (const point of text) {
    if (units + point.length > Math.max(0, offset)) break;
    units += point.length; column++;
  }
  return column;
}
/** Inclusive Neovim character selection includes following composing marks. */
export function characterEnd(text: string, offset: number): number {
  const point = text.codePointAt(offset);
  if (point === undefined) return text.length;
  let end = offset + (point > 0xffff ? 2 : 1);
  while (end < text.length) {
    const next = String.fromCodePoint(text.codePointAt(end)!);
    if (!/\p{Mark}/u.test(next)) break;
    end += next.length;
  }
  return end;
}
export function selectionOffsets(mirror: MirrorDocument | undefined, selection: BufferSelectionRange | undefined): { from: number; to: number } | null {
  if (!mirror || !selection) return null;
  let { start, end } = selection;
  if (start.row > end.row || (start.row === end.row && start.col > end.col)) [start, end] = [end, start];
  const first = mirror.lines[start.row], last = mirror.lines[end.row];
  if (!first || !last) return null;
  if (selection.linewise) return { from: first.startIndex, to: last.endIndex };
  const offset = columnOffset(last.text, end.col);
  return { from: first.startIndex + columnOffset(first.text, start.col),
    to: last.startIndex + characterEnd(last.text, offset) };
}

/** Resolved Neovim regions supersede legacy inclusive endpoints. */
export function selectionRanges(mirror: MirrorDocument | undefined, selection: BufferSelectionRange | undefined): { from: number; to: number }[] | null {
  if (!mirror || !selection) return null;
  if (selection.spans === undefined) {
    const range = selectionOffsets(mirror, selection);
    return range ? [range] : null;
  }
  const ranges = [];
  for (const span of selection.spans) {
    const line = mirror.lines[span.row];
    if (!line || span.endCol > [...line.text].length) return null;
    ranges.push({ from: line.startIndex + columnOffset(line.text, span.startCol),
      to: line.startIndex + columnOffset(line.text, span.endCol) });
  }
  return ranges;
}
