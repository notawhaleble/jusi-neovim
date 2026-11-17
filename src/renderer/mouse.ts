import type { NvimMouseInput } from '../core/mouse.js';

type Target = Pick<NvimMouseInput, 'grid' | 'tabId' | 'windowId'> & { element: HTMLElement };
interface MousePort {
  target(element: EventTarget | null): Target | null;
  metrics(): { width: number; height: number };
  blocked(): boolean;
  activate(): void;
  send(input: NvimMouseInput): Promise<boolean>;
}

export function mouseModifiers(event: Pick<MouseEvent, 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey'>): string {
  return (event.shiftKey ? 'S' : '') + (event.ctrlKey ? 'C' : '')
    + (event.altKey ? 'A' : '') + (event.metaKey ? 'M' : '');
}

/** Capture only gestures that start on editor cells; guests/overlays own theirs. */
export function installGridMouse(stage: HTMLElement, port: MousePort): void {
  let gesture: { target: Target; button: NvimMouseInput['button']; pointer: number; last: NvimMouseInput } | null = null;
  const position = (target: Target, event: MouseEvent) => {
    const rect = target.element.getBoundingClientRect();
    const cell = port.metrics();
    return { row: Math.floor((event.clientY - rect.top) / cell.height),
      col: Math.floor((event.clientX - rect.left) / cell.width) };
  };
  const input = (target: Target, event: MouseEvent, button: NvimMouseInput['button'], action: NvimMouseInput['action']): NvimMouseInput => ({
    grid: target.grid, tabId: target.tabId, windowId: target.windowId,
    ...position(target, event), button, action, modifier: mouseModifiers(event),
  });
  const send = (value: NvimMouseInput) => { void port.send(value).catch(error => console.error('Neovim mouse input failed', error)); };
  const cancel = () => {
    if (!gesture) return;
    const old = gesture; gesture = null;
    send({ ...old.last, action: 'release' });
    if (stage.hasPointerCapture(old.pointer)) stage.releasePointerCapture(old.pointer);
  };
  stage.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || gesture || port.blocked()) return;
    const target = port.target(event.target);
    const button = (['left', 'middle', 'right', 'x1', 'x2'] as const)[event.button];
    if (!target || !button) return;
    const value = input(target, event, button, 'press');
    gesture = { target, button, pointer: event.pointerId, last: value };
    stage.setPointerCapture(event.pointerId);
    port.activate();
    send(value); // Neovim detects multi-clicks using its own mousetime setting.
    event.preventDefault(); event.stopPropagation();
  }, true);
  stage.addEventListener('pointermove', event => {
    if (!gesture || gesture.pointer !== event.pointerId) return;
    if (!gesture.target.element.isConnected || port.blocked()) { cancel(); return; }
    const value = input(gesture.target, event, gesture.button, 'drag');
    if (value.row !== gesture.last.row || value.col !== gesture.last.col || value.modifier !== gesture.last.modifier) {
      gesture.last = value; send(value);
    }
    event.preventDefault(); event.stopPropagation();
  }, true);
  stage.addEventListener('pointerup', event => {
    if (!gesture || gesture.pointer !== event.pointerId) return;
    gesture.last = input(gesture.target, event, gesture.button, 'release');
    cancel(); event.preventDefault(); event.stopPropagation();
  }, true);
  stage.addEventListener('pointercancel', cancel);
  stage.addEventListener('lostpointercapture', cancel);
  window.addEventListener('blur', cancel);
  stage.addEventListener('contextmenu', event => {
    if (port.target(event.target) && !port.blocked()) event.preventDefault();
  });
  let wheelX = 0, wheelY = 0, wheelTarget = '', wheelTime = 0;
  stage.addEventListener('wheel', event => {
    if (port.blocked()) return;
    const target = port.target(event.target);
    if (!target) return;
    const key = `${target.tabId}:${target.grid}`;
    if (key !== wheelTarget || event.timeStamp - wheelTime > 200) { wheelX = 0; wheelY = 0; }
    wheelTarget = key; wheelTime = event.timeStamp;
    const cell = port.metrics();
    const factor = event.deltaMode === 1 ? cell.height : event.deltaMode === 2 ? stage.clientHeight : 1;
    // One wheel step per three text rows; retain high-resolution trackpad remainder.
    const step = cell.height * 3;
    if (Math.sign(event.deltaX) !== Math.sign(wheelX)) wheelX = 0;
    if (Math.sign(event.deltaY) !== Math.sign(wheelY)) wheelY = 0;
    wheelX += event.deltaX * factor; wheelY += event.deltaY * factor;
    for (const axis of ['x', 'y'] as const) {
      let delta = axis === 'x' ? wheelX : wheelY;
      const count = Math.min(10, Math.floor(Math.abs(delta) / step));
      for (let n = 0; n < count; n++) send(input(target, event, 'wheel', axis === 'x'
        ? (delta > 0 ? 'right' : 'left') : (delta > 0 ? 'down' : 'up')));
      delta = Math.sign(delta) * (Math.abs(delta) % step);
      if (axis === 'x') wheelX = delta; else wheelY = delta;
    }
    event.preventDefault(); event.stopPropagation();
  }, { capture: true, passive: false });
}
