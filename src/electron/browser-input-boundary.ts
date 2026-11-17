interface Events {
  on(event: string, listener: () => void): unknown;
  removeListener(event: string, listener: () => void): unknown;
}
type HostBoundary = { resets: Set<() => void>; changed: () => void };
const hostEvents = ['blur', 'focus', 'enter-full-screen', 'leave-full-screen'] as const;
const hosts = new WeakMap<Events, HostBoundary>();

/** App deactivation/fullscreen transitions need not blur the guest or deliver key-up.
 * One listener per host boundary serves all hosted documents.
 * This discards transient input only, never changes Neovim mode or guest focus.
 */
export function resetBrowserInputOnFocusBoundary(source: Events, host: Events, reset: () => void): () => void {
  let boundary = hosts.get(host);
  if (!boundary) {
    const resets = new Set<() => void>();
    boundary = { resets, changed: () => { for (const callback of resets) callback(); } };
    hosts.set(host, boundary);
    for (const event of hostEvents) host.on(event, boundary.changed);
  }
  const entry = boundary;
  // A unique registration supports independent input state owned by one guest.
  const callback = () => reset();
  entry.resets.add(callback);
  source.on('blur', callback);
  let live = true;
  const dispose = () => {
    if (!live) return;
    live = false;
    reset();
    source.removeListener('blur', callback);
    source.removeListener('destroyed', dispose);
    entry.resets.delete(callback);
    if (!entry.resets.size) {
      for (const event of hostEvents) host.removeListener(event, entry.changed);
      hosts.delete(host);
    }
  };
  source.on('destroyed', dispose);
  return dispose;
}

/** Mouse callbacks omit flags in Electron 44. Reconcile held transitions against
 * every keyboard snapshot, including ordinary keys after a lost release. */
export class BrowserLinkModifiers {
  private held = new Set<string>();
  reset(): void { this.held.clear(); }
  snapshot(): string[] { return [...this.held]; }
  accept(input: {type: string; key?: string; control?: boolean; meta?: boolean; shift?: boolean}): void {
    for (const [key, flag] of [['Control', input.control], ['Meta', input.meta], ['Shift', input.shift]] as const) {
      if (flag === false) this.held.delete(key);
      if (input.key === key) {
        if (input.type === 'keyDown') this.held.add(key);
        if (input.type === 'keyUp') this.held.delete(key);
      }
    }
  }
  active(modifiers?: string[]): boolean {
    return modifiers ? modifiers.some(m => ['control', 'meta', 'shift'].includes(m)) : this.held.size > 0;
  }
}
