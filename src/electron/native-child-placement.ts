import type { Rect, UiSnapshot, WebBufferSession } from "../core/types.js";
import type { NativeChildBinding } from "./native-child-owner.js";

export interface NativeViewport {
  /** Electron DIP coordinates; CSS cell sizes multiplied by shell zoom exactly once. */
  x: number; y: number; width: number; height: number;
  cellWidth: number; cellHeight: number; zoom: number;
}
export interface NativePlacement {
  generation: number; sessionId: string; bufferId: number; incarnation: number;
  windowId: number; gridId: number; bounds: Rect;
}
const finite = (...values: number[]) => values.every(Number.isFinite);
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width
  && a.y < b.y + b.height && b.y < a.y + a.height;

/** Internal single-border float placement. Unknown composition parks the document. */
export function resolveNativeChildPlacement(args: {
  binding: NativeChildBinding; session?: WebBufferSession; snapshot: UiSnapshot;
  viewport: NativeViewport; generation: number; trustedUiVisible: boolean; debugUi?: boolean;
}): NativePlacement | null {
  const { binding: b, session: s, snapshot, viewport: v, generation } = args;
  if (args.trustedUiVisible || !s || s.sessionId !== b.sessionId || s.incarnation !== b.incarnation
    || s.bufferId !== b.bufferId || s.nativeChild !== b.token || snapshot.currentTabId === null
    || !Number.isSafeInteger(generation) || generation < 1
    || !finite(v.x, v.y, v.width, v.height, v.cellWidth, v.cellHeight, v.zoom)
    || Math.min(v.width, v.height, v.cellWidth, v.cellHeight, v.zoom) <= 0) return null;
  const windows = snapshot.windows.filter(w => w.tabId === snapshot.currentTabId);
  const owners = windows.filter(w => w.bufferId === b.bufferId);
  if (owners.length !== 1 || owners[0].id !== s.attachedWindowId) return null;
  const w = owners[0], g = w.gridBounds;
  if (!g || w.gridId !== g.gridId || w.row !== g.row || w.col !== g.col
    || w.width === undefined || w.height === undefined || g.width !== w.width
    || g.height !== w.height || g.zIndex !== 0 || !finite(g.row, g.col, g.width, g.height, g.compIndex)
    || w.width <= 0 || w.height <= 1) return null;
  const cw = v.cellWidth * v.zoom, ch = v.cellHeight * v.zoom;
  const inset = args.debugUi ? 1 : 0;
  const left = v.x + g.col * cw, top = v.y + (g.row + inset) * ch;
  const right = left + w.width * cw, bottom = top + (w.height - inset) * ch;
  if (left < v.x || top < v.y || right > v.x + v.width || bottom > v.y + v.height) return null;
  const cells = { x: g.col, y: g.row + inset, width: w.width, height: w.height - inset };
  for (const other of windows) {
    if (other.id === w.id) continue;
    const outer = other.gridBounds;
    if (!outer) return null;
    if (!finite(outer.col, outer.row, outer.width, outer.height, outer.zIndex, outer.compIndex)) return null;
    if ((outer.zIndex > g.zIndex || (outer.zIndex === g.zIndex && outer.compIndex >= g.compIndex))
      && overlaps(cells, { x: outer.col, y: outer.row, width: outer.width, height: outer.height })) return null;
  }
  const bounds = { x: Math.ceil(left), y: Math.ceil(top),
    width: Math.floor(right) - Math.ceil(left), height: Math.floor(bottom) - Math.ceil(top) };
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  return { generation, sessionId: b.sessionId, bufferId: b.bufferId, incarnation: b.incarnation,
    windowId: w.id, gridId: g.gridId, bounds };
}

/** Each layout invalidation parks immediately. Stale asynchronous placement cannot reveal it. */
export class NativePlacementGate {
  private generation = 0;
  constructor(private readonly view: { setVisible(value: boolean): void; setBounds(bounds: Rect): void }) {}
  invalidate(): number { this.view.setVisible(false); return ++this.generation; }
  apply(placement: NativePlacement | null): boolean {
    if (!placement || placement.generation !== this.generation) return false;
    this.view.setBounds(placement.bounds);
    this.view.setVisible(true);
    return true;
  }
}
