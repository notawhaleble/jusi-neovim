import { mkdirSync } from 'node:fs';
import { appendFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHmac, randomBytes } from 'node:crypto';

type Fields = Record<string, unknown>;
/** Opt-in diagnostics: bounded queue and rotating files; no renderer IPC or input capture. */
export class BrowserTrace {
  readonly directory: string;
  private queue: string[] = [];
  private pending: Promise<void> = Promise.resolve();
  private timer?: ReturnType<typeof setTimeout>;
  private bytes = 0;
  private slot = 0;
  private sequence = 0;
  private dropped = 0;
  private failed = false;
  private salt = randomBytes(32);
  constructor(root: string, private readonly maxBytes = 2 * 1024 * 1024, private readonly maxQueue = 512) {
    this.directory = join(root, `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}-${randomBytes(4).toString('hex')}`);
    mkdirSync(this.directory, {recursive:true, mode:0o700});
  }
  url(value: unknown): string | undefined {
    if (typeof value !== 'string') return;
    // Run-local correlation only: no hostname, path, credentials, query or fragment.
    return createHmac('sha256', this.salt).update(value).digest('hex').slice(0,20);
  }
  record(event: string, fields: Fields = {}): void {
    if (this.failed) return;
    if (this.queue.length >= this.maxQueue) { this.dropped++; return; }
    this.queue.push(JSON.stringify({...fields, event, sequence:++this.sequence, time:new Date().toISOString()}));
    if (!this.timer) {
      this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, 100);
      this.timer.unref();
    }
  }
  flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    // Only one batch may be in flight; arrivals remain in the bounded queue.
    if (this.writing) return this.pending.then(() => this.flush());
    if (this.failed || (!this.queue.length && !this.dropped)) return this.pending;
    const lines = this.queue.splice(0);
    if (this.dropped) lines.push(JSON.stringify({event:'trace.dropped',count:this.dropped,time:new Date().toISOString()}));
    this.dropped = 0;
    this.writing = true;
    this.pending = (async () => {
      for (const line of lines) {
        const data = line + '\n', size = Buffer.byteLength(data);
        if (size > this.maxBytes) continue;
        if (this.bytes + size > this.maxBytes) {
          this.slot = (this.slot + 1) % 3; this.bytes = 0;
          await writeFile(join(this.directory, `events-${this.slot}.jsonl`), '', {mode:0o600});
        }
        await appendFile(join(this.directory, `events-${this.slot}.jsonl`), data, {mode:0o600});
        this.bytes += size;
      }
    })().catch(() => {
      this.failed = true; this.queue = [];
      console.error('[browser-trace] Logging stopped: cannot write diagnostic files.');
    }).finally(() => { this.writing = false; });
    return this.pending;
  }
  private writing = false;
  get healthy(): boolean { return !this.failed; }
}
let active: BrowserTrace | undefined;
export function startBrowserTrace(root: string): void {
  if (active) return;
  try {
    active = new BrowserTrace(root);
    console.log(`[browser-trace] ${active.directory}`);
    traceBrowser('trace.start', {versions:process.versions,platform:process.platform,pid:process.pid});
  } catch { console.error('[browser-trace] Cannot create diagnostic directory; logging disabled.'); }
}
export function traceBrowser(event: string, fields: Fields = {}): void { active?.record(event, fields); }
export function traceBrowserUrl(value: unknown): string | undefined { return active?.url(value); }
export function browserTraceEnabled(): boolean { return !!active?.healthy; }
export async function browserTraceMark(fields: Fields): Promise<string | undefined> {
  if (!active?.healthy) return;
  active.record('user.mark', fields);
  await active.flush();
  return active.healthy ? active.directory : undefined;
}
/** Record only named control keys. Ordinary keys are deliberately indistinguishable. */
export function traceBrowserKey(input: {key?: string;code?: string}): string {
  const allowed = ['Control','Meta','Shift','Alt','Escape','F11','F12'];
  if (allowed.includes(input.key ?? '')) return input.key!;
  return 'other';
}
