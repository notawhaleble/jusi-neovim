import type { BrowserKeyInput } from './mode-keys.js';
export type ZoomAction = 'in' | 'out' | 'reset';
export type ClipboardCommand = 'copy' | 'cut' | 'paste' | 'pasteAndMatchStyle';
type EditingCommand = ClipboardCommand | 'selectAll' | 'undo' | 'redo';
export type BrowserCommand = EditingCommand | 'toggle-pause' | 'devtools' | 'copy-url' | 'reload' | 'back' | 'forward' | `zoom-${ZoomAction}`;
export function zoomActionForInput(input: BrowserKeyInput): ZoomAction | null {
  if (input.type !== 'keyDown' || input.isComposing || input.alt || (!input.meta && !input.control)) return null;
  if (['+', '='].includes(input.key ?? '') || ['Equal', 'NumpadAdd'].includes(input.code ?? '')) return 'in';
  if (input.key === '-' || ['Minus', 'NumpadSubtract'].includes(input.code ?? '')) return 'out';
  if (input.key === '0' || ['Digit0', 'Numpad0'].includes(input.code ?? '')) return 'reset';
  return null;
}
export function browserCommandForInput(input: BrowserKeyInput, platform?: string): BrowserCommand | undefined {
  if (input.type !== 'keyDown' || input.isComposing || input.alt) return;
  const primary = platform === 'darwin' ? input.meta && !input.control : input.control && !input.meta;
  if (primary) {
    if (input.code === 'KeyA' && !input.shift) return 'selectAll';
    if (input.code === 'KeyZ') return input.shift ? 'redo' : 'undo';
    if (platform === 'linux' && input.code === 'KeyY' && !input.shift) return 'redo';
    if (input.code === 'KeyC' && !input.shift) return 'copy';
    if (input.code === 'KeyX' && !input.shift) return 'cut';
    if (input.code === 'KeyV') return input.shift ? 'pasteAndMatchStyle' : 'paste';
  }
  if (input.code === 'F12' && !input.control && !input.meta) return 'devtools';
  const zoom = zoomActionForInput(input);
  if (zoom) return `zoom-${zoom}`;
  if ((input.meta || input.control) && input.code === 'KeyR') return 'reload';
  if (!input.control || input.meta) return;
  if (input.code === 'KeyP' && !input.shift) return 'toggle-pause';
  if (input.code === 'KeyL') return 'copy-url';
  if (input.code === 'KeyO') return 'back';
  if (input.code === 'KeyI' || input.key === 'Tab') return 'forward';
}
export interface BrowserCommandPort {
  isDestroyed(): boolean;
  reload?(): void;
  selectAll?(): void;
  undo?(): void;
  redo?(): void;
  copy?(): void;
  cut?(): void;
  paste?(): void;
  pasteAndMatchStyle?(): void;
  isDevToolsOpened?(): boolean;
  openDevTools?(options: {mode: 'detach'}): void;
  closeDevTools?(): void;
  getURL?(): string;
  navigationHistory?: { canGoBack(): boolean; canGoForward(): boolean; goBack(): void; goForward(): void };
  getZoomFactor?(): number;
  setZoomFactor?(factor: number): void;
}
/** Both Electron transports supply the same WebContents capabilities. */
export function dispatchBrowserCommand(port: BrowserCommandPort, command: BrowserCommand, zoomed: () => void, copyUrl?: (url: string) => void): boolean {
  if (port.isDestroyed()) return false;
  try {
    switch (command) {
      case 'selectAll':
      case 'undo':
      case 'redo':
      case 'copy':
      case 'cut':
      case 'paste':
      case 'pasteAndMatchStyle': {
        const action = port[command];
        if (!action) return false;
        action.call(port);
        return true;
      }
    }
    if (command === 'toggle-pause') return false; // Routed through authoritative Neovim state.
    if (command === 'devtools') {
      if (!port.isDevToolsOpened || !port.openDevTools || !port.closeDevTools) return false;
      if (port.isDevToolsOpened()) port.closeDevTools();
      else port.openDevTools({mode: 'detach'});
      return true;
    }
    if (command === 'copy-url') {
      if (!port.getURL || !copyUrl) return false;
      copyUrl(port.getURL()); return true;
    }
    if (command === 'reload') {
      if (!port.reload) return false;
      port.reload(); return true;
    }
    if (command === 'back' || command === 'forward') {
      const history = port.navigationHistory;
      if (!history) return false;
      if (command === 'back' && history.canGoBack()) history.goBack();
      if (command === 'forward' && history.canGoForward()) history.goForward();
      return true; // A history boundary is a handled no-op.
    }
    if (!port.getZoomFactor || !port.setZoomFactor) return false;
    const current = port.getZoomFactor();
    const base = Number.isFinite(current) && current > 0 ? current : 1;
    const next = command === 'zoom-reset' ? 1 : command === 'zoom-in' ? base * 1.1 : base / 1.1;
    port.setZoomFactor(Math.max(0.3, Math.min(3, next)));
    zoomed(); return true;
  } catch { return false; } // Teardown may race native command delivery.
}
