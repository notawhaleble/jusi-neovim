import { selectionRanges } from './text-mapping.js';
import type { MirrorDocument, BufferCursorPosition, BufferSelectionRange } from '../../core/types.js';
import type { PresentationMode, TextLayerStatus } from '../../presentation/contracts.js';
import { browserIndex } from './interaction.js';
import { TextLayerJob, TextLayerLimitError } from '../../presentation/text-layer.js';
import { validateMirror } from '../../presentation/text-document.js';
import { documentChangesSource } from './document-changes.js';
import * as scripts from './document-scripts.js';

export interface BrowserDocumentTransport {
  executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>;
  isCurrent(): boolean;
  loadURL?(url: string): Promise<void>;
}
export type BrowserTextPublication = import("../../presentation/renderer-surface.js").TextPublication<MirrorDocument>;

/** Browser behavior shared by DOM and native views. No Electron or DOM host ownership. */
export class BrowserDocumentController {
  private autoRefresh = true;
  private generation = 0;
  private watchEpoch = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private counter: number | undefined;
  private live = false;
  private disposed = false;
  private cursorSignature?: string;
  private selectionSignature?: string;
  private projectionSequence = 0;
  private publication?: BrowserTextPublication;
  private readonly job: TextLayerJob;
  get ready(): boolean { return this.live && !this.disposed && this.transport.isCurrent(); }
  get status(): TextLayerStatus { return this.job.status; }
  constructor(private readonly transport: BrowserDocumentTransport, private enabled: boolean,
    private readonly changed: () => void | Promise<void> = () => {},
    statusChanged: (status: TextLayerStatus) => void = () => {}, private readonly timeoutMs = 10000) {
    this.job = new TextLayerJob(statusChanged);
    this.job.invalidate(enabled);
  }
  configureText(publication: BrowserTextPublication): void { this.publication = publication; }
  setAutoRefresh(enabled: boolean): void {
    if (this.autoRefresh === enabled) return;
    this.autoRefresh = enabled;
    if (!enabled && this.job.status === 'building') { this.generation++; this.job.invalidate(this.enabled); }
    if (enabled && this.ready && this.enabled) void this.rebuild();
  }
  setTextEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled; this.generation++; this.watchEpoch++; clearTimeout(this.timer);
    this.counter = undefined; this.job.invalidate(enabled);
    if (this.ready && enabled) void this.poll(this.watchEpoch);
  }
  invalidate(): void {
    if (this.disposed) return;
    this.live = false; this.generation++; this.watchEpoch++; clearTimeout(this.timer);
    this.counter = undefined; this.resetProjection(); this.job.invalidate(this.enabled);
    if (this.publication && this.enabled) {
      const generation = this.generation;
      void this.publication.invalidate().catch(() => { if (generation === this.generation && !this.disposed) this.job.fail(); });
    }
  }
  loaded(): void {
    if (this.disposed) return;
    this.invalidate(); this.live = true;
    if (this.enabled) void this.poll(this.watchEpoch);
  }
  crashed(): void { this.invalidate(); this.job.fail(); }
  dispose(): void { this.invalidate(); this.disposed = true; }
  private async run(code: string, signal?: AbortSignal, userGesture = false): Promise<unknown> {
    if (!this.ready || signal?.aborted) throw new Error('Document is not ready');
    const generation = this.generation;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const value = await Promise.race([this.transport.executeJavaScript(code, userGesture), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Document operation timed out')), this.timeoutMs);
      })]);
      if (!this.ready || generation !== this.generation || signal?.aborted) throw new Error('Document changed');
      return value;
    } finally { clearTimeout(timer); }
  }
  private async changeCounter(): Promise<number> {
    const value = await this.run(documentChangesSource());
    if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error('Invalid document change counter');
    return value as number;
  }
  private async poll(epoch: number): Promise<void> {
    try {
      const value = await this.changeCounter();
      if (epoch !== this.watchEpoch) return;
      const initial = this.counter === undefined;
      if (initial || value !== this.counter) {
        this.counter = value; if (!initial) this.generation++;
        this.resetProjection();
        this.job.invalidate(this.enabled);
        if (!initial && this.autoRefresh) await this.changed();
        if (this.publication && (initial || this.autoRefresh)) void this.rebuild();
      }
    } catch { if (epoch === this.watchEpoch && this.ready && this.publication) this.job.fail(); }
    finally {
      if (this.ready && this.enabled && epoch === this.watchEpoch)
        this.timer = setTimeout(() => void this.poll(epoch), 300);
    }
  }
  async rebuild(): Promise<void> {
    const publication = this.publication;
    if (!this.ready || !this.enabled || !publication || this.job.status === 'building') return;
    await this.job.run(async signal => {
      await publication.invalidate();
      const ticket = await publication.acquire();
      if (!ticket || signal.aborted) throw new Error('Document changed');
      const before = await this.changeCounter();
      const mirror = await this.extract(signal);
      if (before !== await this.changeCounter()) throw new Error('Document changed');
      mirror.version = ticket.revision;
      return { ticket, mirror };
    }, async ({ ticket, mirror }) => {
      if (!await publication.publish(ticket, mirror)) throw new Error('Document changed before commit');
    });
  }
  resetProjection(): void {
    this.cursorSignature = undefined; this.selectionSignature = undefined; this.projectionSequence++;
  }
  async projectCursor(mirror: MirrorDocument | undefined, cursor: BufferCursorPosition | null,
    autoScroll = true, force = false): Promise<void> {
    const index = browserIndex(mirror, cursor);
    const signature = index === null ? 'clear' : `${mirror!.version}:${index}:${autoScroll}`;
    if (!force && this.cursorSignature === signature) return;
    const sequence = ++this.projectionSequence;
    // The last acknowledged position is no longer safe to deduplicate against:
    // a different projection can paint before its transport promise resolves.
    this.cursorSignature = undefined;
    if (index === null) await this.clearProjection();
    else await this.project(index, autoScroll);
    if (sequence === this.projectionSequence) this.cursorSignature = signature;
  }
  async projectSelection(mirror: MirrorDocument | undefined, selection: BufferSelectionRange | undefined): Promise<void> {
    const offsets = selectionRanges(mirror, selection);
    if (!offsets) {
      if (this.selectionSignature !== 'clear') { await this.clearSelection(); this.selectionSignature = 'clear'; }
      return;
    }
    const signature = `${mirror!.version}:${JSON.stringify(offsets)}`;
    if (this.selectionSignature === signature) return;
    await this.run(scripts.mirrorSelectionRangesSource(offsets)); this.selectionSignature = signature;
  }
  setMode(mode: PresentationMode) { return this.run(scripts.webModeFrameSource(mode === 'rich')); }
  setPointerHidden(hidden: boolean) { return this.run(scripts.pointerVisibilitySource(hidden)); }
  async extract(signal: AbortSignal): Promise<MirrorDocument> {
    const value = await this.run(scripts.mirrorExtractorSource(), signal);
    if (value && typeof value === "object" && "limitExceeded" in value && value.limitExceeded === true)
      throw new TextLayerLimitError("Browser text extraction limit reached");
    validateMirror(value); return value;
  }
  project(index: number, autoScroll: boolean) { return this.run(scripts.mirrorProjectionSource(index, autoScroll)); }
  clearProjection() { return this.run(scripts.mirrorProjectionClearSource()); }
  select(start: number, end: number) { return this.run(scripts.mirrorSelectionProjectionSource(start, end)); }
  clearSelection() { return this.run(scripts.mirrorSelectionClearSource()); }
  hitTest(x: number, y: number) { return this.run(scripts.mirrorClickIndexSource(x, y)); }
  scroll(lines: number, index: number | null) { return this.run(scripts.mirrorScrollSource(lines, index)); }
  region(index: number | null, direction: number) { return this.run(scripts.mirrorRegionSource(index, direction)); }
  async activateLink(index: number): Promise<void> {
    await this.run(scripts.mirrorActivateLinkSource(index), undefined, true);
  }
}
