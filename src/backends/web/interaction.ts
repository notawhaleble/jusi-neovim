import { columnOffset, offsetColumn } from './text-mapping.js';
import type { BufferCursorPosition, MirrorDocument } from '../../core/types.js';

export interface BrowserActionTarget {
  bufferId: number; windowId: number; sessionId: string; incarnation?: number;
  cursor?: BufferCursorPosition | null; documentRevision?: number;
}
export interface BrowserInteractionState extends BrowserActionTarget {
  mirror?: MirrorDocument; cursor?: BufferCursorPosition | null;
}
export type BrowserAction = { kind: 'scroll'; lines: number } | { kind: 'link' }
  | { kind: 'region'; direction: number } | { kind: 'hit'; x: number; y: number } | { kind: 'retry' };
export interface BrowserInteractionPort {
  read(): BrowserInteractionState | undefined;
  scroll(lines: number, index: number | null): Promise<unknown>;
  region(index: number | null, direction: number): Promise<unknown>;
  activateLink(index: number): Promise<void>;
  hitTest(x: number, y: number): Promise<unknown>;
  rebuildText(): Promise<void>;
  projectCursor(mirror: MirrorDocument | undefined, cursor: BufferCursorPosition | null, autoScroll: boolean, force: boolean): Promise<void>;
}
export function sameBrowserTarget(a: BrowserActionTarget, b: BrowserActionTarget): boolean {
  return a.bufferId === b.bufferId && a.windowId === b.windowId
    && a.sessionId === b.sessionId && a.incarnation === b.incarnation;
}
export function browserIndex(mirror: MirrorDocument | undefined, cursor: BufferCursorPosition | null | undefined): number | null {
  const line = cursor && mirror?.lines[cursor.row];
  return line && cursor ? line.startIndex + columnOffset(line.text, cursor.col) : null;
}
export function browserPosition(mirror: MirrorDocument, index: number): BufferCursorPosition | null {
  if (!Number.isSafeInteger(index) || index < 0 || index > mirror.totalTextLength || !mirror.lines.length) return null;
  const line = mirror.lines.find(line => index <= line.endIndex) ?? mirror.lines[mirror.lines.length - 1];
  return { row: line.lineNumber, col: offsetColumn(line.text, Math.min(line.text.length, index - line.startIndex)) };
}
/** Shared orchestration; adapters supply current ownership, coordinates and focus. */
export async function browserInteraction(port: BrowserInteractionPort, target: BrowserActionTarget, action: BrowserAction): Promise<BufferCursorPosition | null> {
  const state = port.read();
  if (!state || !sameBrowserTarget(state, target)
    || (target.documentRevision !== undefined && target.documentRevision !== state.mirror?.version)) return null;
  const current = () => {
    const now = port.read();
    return now && sameBrowserTarget(now, target) && now.mirror?.version === state.mirror?.version;
  };
  if (action.kind === 'retry') { await port.rebuildText(); return null; }
  const cursor = target.cursor === undefined ? state.cursor : target.cursor;
  const index = browserIndex(state.mirror, cursor);
  if (action.kind === 'region') {
    if (!state.mirror || ![1, -1].includes(action.direction)) return null;
    const value = await port.region(index, action.direction);
    return current() && typeof value === 'number' ? browserPosition(state.mirror, value) : null;
  } else if (action.kind === 'link') {
    if (index !== null) await port.activateLink(index);
  } else if (action.kind === 'scroll') {
    if (!Number.isFinite(action.lines)) return null;
    await port.scroll(action.lines, index);
    if (current()) await port.projectCursor(state.mirror, cursor ?? null, false, true);
  } else if (state.mirror && Number.isFinite(action.x) && Number.isFinite(action.y)) {
    const value = await port.hitTest(action.x, action.y);
    if (current() && typeof value === 'number') return browserPosition(state.mirror, value);
  }
  return null;
}

/** Region keys execute serially, resolving the cursor again from Neovim after each commit. */
export class BrowserRegionNavigator {
  private tail: Promise<void> = Promise.resolve();
  navigate(port: BrowserInteractionPort, target: BrowserActionTarget, direction: number,
    readAuthoritative: () => Promise<BrowserInteractionState | undefined>,
    commit: (position: BufferCursorPosition) => Promise<void>): Promise<void> {
    const next = this.tail.catch(() => {}).then(async () => {
      const state = await readAuthoritative();
      if (!state || !sameBrowserTarget(state, target)
        || state.mirror?.version !== target.documentRevision) return;
      const position = await browserInteraction(port, { ...target, cursor: state.cursor }, { kind: 'region', direction });
      if (position) await commit(position);
    });
    this.tail = next;
    return next;
  }
}
