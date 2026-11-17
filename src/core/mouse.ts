/** Grid-relative input. Window/tab identities prevent delivery into replaced grids. */
export interface NvimMouseInput {
  button: 'left' | 'middle' | 'right' | 'x1' | 'x2' | 'wheel';
  action: 'press' | 'drag' | 'release' | 'up' | 'down' | 'left' | 'right';
  modifier: string;
  grid: number;
  row: number;
  col: number;
  tabId: number;
  windowId?: number;
}

export function validMouseInput(value: unknown): value is NvimMouseInput {
  if (!value || typeof value !== 'object') return false;
  const v = value as NvimMouseInput;
  return ['left', 'middle', 'right', 'x1', 'x2', 'wheel'].includes(v.button)
    && (v.button === 'wheel' ? ['up', 'down', 'left', 'right'] : ['press', 'drag', 'release']).includes(v.action)
    && typeof v.modifier === 'string' && /^[SCAM]*$/.test(v.modifier) && v.modifier.length <= 4
    && Number.isSafeInteger(v.grid) && v.grid >= 1
    && Number.isSafeInteger(v.tabId) && v.tabId >= 1
    && (v.windowId === undefined || (Number.isSafeInteger(v.windowId) && v.windowId >= 1))
    && Number.isSafeInteger(v.row) && Math.abs(v.row) < 100000
    && Number.isSafeInteger(v.col) && Math.abs(v.col) < 100000;
}
