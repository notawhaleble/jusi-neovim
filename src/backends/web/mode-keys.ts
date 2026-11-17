export interface BrowserKeyInput {
  type?: string; key?: string; code?: string;
  control?: boolean; shift?: boolean; meta?: boolean; alt?: boolean; isComposing?: boolean;
}
export type BrowserModeAction = 'close' | 'text' | 'prefix';

/** Per-document mode chord. No pending input survives a focus/document boundary. */
export class BrowserModeKeys {
  private until = 0;
  reset(): void { this.until = 0; }
  accept(input: BrowserKeyInput, now = Date.now()): BrowserModeAction | undefined {
    if (input.isComposing) { this.reset(); return; }
    if (input.type !== 'keyDown') return;
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(input.key ?? '')) return;
    const pending = now < this.until;
    this.reset();
    if (input.meta || input.alt || !input.control) return;
    if (input.code === 'KeyQ') return 'close';
    if (pending && input.code === 'KeyN') return 'text';
    if (input.code === 'Backslash' || input.key === '\\' || input.key === 'Backslash') {
      this.until = now + 1200;
      return 'prefix';
    }
  }
}
