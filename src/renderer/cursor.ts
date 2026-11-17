import type { CursorStyle, HighlightAttrs, ScreenLineRun } from '../core/types.js';

/** Runs coalesce ASCII only; each non-ASCII run retains Neovim's cell allocation. */
export function cursorCell(runs: ScreenLineRun[], column: number) {
  let start = 0;
  for (const run of runs) {
    const columns = run.columns ?? run.text.length;
    if (column >= start && column < start + columns) {
      const ascii = /^[\x20-\x7e]*$/.test(run.text) && columns === run.text.length;
      return { text: ascii ? run.text[column - start]! : run.text,
        columns: ascii ? 1 : columns, offset: ascii ? 0 : column - start,
        highlightId: run.highlightId };
    }
    start += columns;
  }
  return { text: ' ', columns: 1, offset: 0, highlightId: 0 };
}

export function cursorHighlight(style: CursorStyle, source: HighlightAttrs | undefined,
  highlights: Record<number, HighlightAttrs>, defaults: { foreground: string; background: string }): HighlightAttrs {
  if (style.attrId && highlights[style.attrId]) return { ...defaults, ...highlights[style.attrId] };
  const fg = source?.foreground ?? defaults.foreground;
  const bg = source?.background ?? defaults.background;
  return { ...source, reverse: false, foreground: source?.reverse ? fg : bg,
    background: source?.reverse ? bg : fg };
}

export function cursorBlink(style: CursorStyle): { delay: number; duration: number; offFraction: number } | null {
  const { blinkWait: wait = 0, blinkOn: on = 0, blinkOff: off = 0 } = style;
  if (![wait, on, off].every(n => Number.isFinite(n) && n > 0)) return null;
  return { delay: wait, duration: on + off, offFraction: off / (on + off) };
}

const animations = new WeakMap<HTMLElement, { key: string; animation?: Animation }>();
export function hideCursor(element: HTMLElement): void {
  animations.get(element)?.animation?.cancel();
  animations.delete(element);
  element.style.display = 'none';
}
export function updateCursorBlink(element: HTMLElement, style: CursorStyle, identity: string): void {
  const timing = cursorBlink(style);
  const key = JSON.stringify([identity, style]);
  if (animations.get(element)?.key === key) return;
  animations.get(element)?.animation?.cancel();
  const animation = timing ? element.animate([
    { opacity: 0, offset: 0, easing: 'steps(1, end)' },
    { opacity: 1, offset: timing.offFraction },
    { opacity: 1, offset: 1 },
  ], { delay: timing.delay, duration: timing.duration, iterations: Infinity }) : undefined;
  animations.set(element, { key, animation });
}
export function restartCursorBlink(element: HTMLElement): void {
  const animation = animations.get(element)?.animation;
  if (animation) animation.currentTime = 0;
}
