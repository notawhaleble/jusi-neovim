import type { EmbeddedSessionState } from "../bridge/rpc-session.js";
import type { WebBufferSession } from "../core/types.js";
import type { NativeViewport } from './native-child-placement.js';

export interface ShellViewportReport {
  generation: number; sequence: number;
  x: number; y: number; width: number; height: number;
  cellWidth: number; cellHeight: number; blocked: boolean;
}

/** Main-owned epoch for measured shell geometry. No guest selects a native rectangle. */
export class NativeViewportExchange {
  private epoch = 1;
  private sequence = 0;
  private value: NativeViewport | null = null;
  constructor(private readonly park: () => void) {}
  get generation(): number { return this.epoch; }
  get viewport(): NativeViewport | null { return this.value; }
  invalidate(): number {
    this.value = null; this.sequence = 0; this.park(); return ++this.epoch;
  }
  accept(report: unknown, zoom: number, width: number, height: number): boolean {
    if (!report || typeof report !== 'object') return false;
    const r = report as ShellViewportReport;
    if (r.generation !== this.epoch || !Number.isSafeInteger(r.sequence) || r.sequence <= this.sequence) return false;
    // An invalid current report also revokes previous placement.
    const previous = this.value;
    this.value = null; this.sequence = r.sequence;
    if (![r.x, r.y, r.width, r.height, r.cellWidth, r.cellHeight, zoom, width, height].every(Number.isFinite)
      || typeof r.blocked !== 'boolean' || r.x < 0 || r.y < 0
      || Math.min(r.width, r.height, r.cellWidth, r.cellHeight, zoom, width, height) <= 0
      || r.cellWidth > 256 || r.cellHeight > 512 || zoom > 5
      || (r.x + r.width) * zoom > width + 1 || (r.y + r.height) * zoom > height + 1) { this.park(); return false; }
    this.sequence = r.sequence;
    if (!r.blocked) this.value = { x: r.x * zoom, y: r.y * zoom,
      width: Math.min(r.width * zoom, width - r.x * zoom),
      height: Math.min(r.height * zoom, height - r.y * zoom),
      cellWidth: r.cellWidth, cellHeight: r.cellHeight, zoom };
    if (!this.value || JSON.stringify(previous) !== JSON.stringify(this.value)) this.park();
    return true;
  }
}

/** Only composition authority revokes native placement; text/cursor paint does not. */
export function nativeLayoutKey(state: EmbeddedSessionState,
  sessionFor: (bufferId: number) => WebBufferSession | undefined): string {
  return JSON.stringify({
    tab: state.snapshot.currentTabId, tabs: state.snapshot.tabs,
    windows: state.snapshot.windows.map(({cursor: _cursor, selection: _selection, ...window}) => {
      const session = sessionFor(window.bufferId);
      return [window, session && [session.sessionId, session.incarnation, session.nativeChild, session.attachedWindowId]];
    }),
    rows: state.screen.rows, cols: state.screen.cols, options: state.screen.options,
    grids: state.grids.map(grid => [grid.gridId, grid.rows, grid.cols]),
    cmdline: state.cmdline, popupmenu: state.popupmenu, messages: state.messages,
  });
}
