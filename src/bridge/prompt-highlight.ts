import type { CmdlineState, HighlightAttrs } from '../core/types.js';
import { decodeHighlightAttrs } from './highlight-attrs.js';

/** One active lookup; late replies cannot style a different completed prompt. */
export class PromptHighlightResolver {
  private key = '';
  private group = 0;
  private attrs?: HighlightAttrs;
  private pending = false;
  private attempted = '';
  private closed = false;
  constructor(private readonly request: (id: number) => Promise<unknown>, private readonly changed: () => void) {}
  update(command: CmdlineState, epoch: number): CmdlineState {
    const group = command.promptHighlightId ?? 0;
    const key = command.visible && command.prompt && Number.isSafeInteger(group) && group > 0
      ? JSON.stringify([epoch,command.level,command.prompt,group]) : '';
    if (key !== this.key) { this.key = key; this.group = group; this.attrs = undefined; }
    this.resolve();
    return this.attrs ? {...command,promptHighlight:this.attrs} : command;
  }
  dispose(): void { this.closed = true; this.key = ''; this.attrs = undefined; }
  private resolve(): void {
    if (this.closed || this.pending || !this.key || this.attempted === this.key) return;
    const key = this.key;
    this.attempted = key; this.pending = true;
    void this.request(this.group).then(value => {
      if (this.closed || this.key !== key) return;
      this.attrs = decodeHighlightAttrs(value);
      this.changed();
    }).catch(() => { /* Unresolvable groups retain default styling, without retry loops. */ })
      .finally(() => { this.pending = false; this.resolve(); });
  }
}
