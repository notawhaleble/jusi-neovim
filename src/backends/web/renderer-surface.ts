import type { AttachedPresentation, PresentationMode } from "../../presentation/contracts.js";
import type { RendererSurface, SurfaceEvents } from "../../presentation/renderer-surface.js";
import type { MirrorDocument, BufferCursorPosition, BufferSelectionRange } from "../../core/types.js";
import { browserPartition } from "./partition.js";
import { webBackend } from "./definition.js";
import { BrowserDocumentController, type BrowserTextPublication } from "./document-controller.js";

type GuestElement = HTMLElement & {
  partition: string; src: string;
  executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>;
  getWebContentsId(): number;
  reload(): void;
  loadURL(url: string): Promise<void>;
};

/** Owns the guest element and rejects operations completed for an obsolete document. */
export class WebRendererSurface implements RendererSurface<MirrorDocument> {
  readonly element: GuestElement;
  readonly document: BrowserDocumentController;
  private readonly events: SurfaceEvents;
  private disposed = false;
  private attached = false;
  private listeners: Array<[string, EventListener]> = [];
  private readonly sessionId: string;
  private readonly partition: string;
  get ready(): boolean { return !this.disposed && this.element.dataset.domReady === "1"; }
  get crashed(): boolean { return this.element.dataset.crashed === "1"; }

  constructor(view: AttachedPresentation, events: SurfaceEvents,
    createElement: () => GuestElement = () => document.createElement("webview") as GuestElement) {
    webBackend.validateSurface(view.surface);
    this.events = events;

    this.sessionId = view.sessionId;
    this.partition = browserPartition(view.surface.uri, view.bufferId, view.profile, view.sessionId, view.privateBrowsing);
    this.element = createElement();
    this.document = new BrowserDocumentController({
      executeJavaScript: (code, userGesture) => this.element.executeJavaScript(code, userGesture),
      isCurrent: () => !this.disposed,
      loadURL: url => this.element.loadURL(url),
    }, view.textLayer !== "off" && view.textSource !== "worker",
      () => this.events.textChanged?.(), status => this.events.textStatusChanged?.(status));
    this.element.className = "web-view-box__browser";
    this.element.partition = this.partition;
    this.element.setAttribute("allowpopups", "");
    this.element.dataset.domReady = "0";
    this.element.dataset.currentUrl = view.surface.uri;
    const on = (name: string, listener: EventListener) => {
      this.listeners.push([name, listener]); this.element.addEventListener(name, listener);
    };
    on("did-start-navigation", event => {
      const navigation = event as Event & { isMainFrame?: boolean; isInPlace?: boolean };
      if (navigation.isMainFrame === false || navigation.isInPlace) return;
      this.invalidate(); events.invalidated();
    });
    on("dom-ready", () => {
      this.element.dataset.domReady = "1";
      this.element.dataset.crashed = "0";
      this.document.loaded();
      events.ready();
    });
    on("render-process-gone", () => {
      this.invalidate(); this.document.crashed(); this.element.dataset.crashed = "1"; events.crashed();
    });
    on("did-finish-load", () => events.loaded());
    on("focus", () => events.focused?.());
    on("blur", () => events.blurred?.());
    on("wheel", () => events.scrolled());
    on("mousemove", () => events.pointerVisible());
    on("pointerdown", () => events.pointerVisible());
    this.element.src = view.surface.uri;
  }

  matches(view: AttachedPresentation): boolean {
    return !this.disposed && view.surface.backend === "web" && view.sessionId === this.sessionId
      && this.partition === browserPartition(view.surface.uri, view.bufferId, view.profile, view.sessionId, view.privateBrowsing);
  }
  attach(parent: HTMLElement): void {
    this.assertLive();
    if (this.element.parentElement !== parent) parent.appendChild(this.element);
    this.attached = true;
  }
  detach(): void { this.attached = false; } // Parked documents retain their browsing session.
  resize(width: number, height: number): void {
    this.assertLive();
    if (![width, height].every(n => Number.isFinite(n) && n >= 0)) throw new Error("Invalid surface size");
    this.element.style.width = `${width}px`;
    this.element.style.height = `${height}px`;
  }
  update(view: AttachedPresentation): boolean {
    this.assertLive(); webBackend.validateSurface(view.surface);
    if (!this.matches(view)) throw new Error("Surface identity changed; recreate the backend instance");
    this.document.setAutoRefresh(view.autoRefresh !== false);
    this.document.setTextEnabled(view.textLayer !== "off" && view.textSource !== "worker");
    if (this.element.dataset.currentUrl === view.surface.uri) return false;
    this.invalidate();
    this.element.dataset.currentUrl = view.surface.uri;
    this.element.src = view.surface.uri;
    return true;
  }
  focus(): void { this.assertLive(); if (this.attached) this.element.focus(); }
  reload(): void { this.assertLive(); this.invalidate(); this.element.reload(); }
  documentHandle(): number { this.assertLive(); return this.element.getWebContentsId(); }
  dispose(): void {
    if (this.disposed) return;
    this.document.dispose(); this.invalidate(); this.disposed = true; this.attached = false;
    for (const [name, listener] of this.listeners) this.element.removeEventListener(name, listener);
    this.listeners = [];
    this.element.remove();
  }
  private assertLive(): void { if (this.disposed) throw new Error("Surface is disposed"); }
  private invalidate(): void { this.document.invalidate(); this.element.dataset.domReady = "0"; }
  configureText(publication: BrowserTextPublication): void { this.document.configureText(publication); }
  rebuildText(): Promise<void> { return this.document.rebuild(); }
  setMode(mode: PresentationMode) { return this.document.setMode(mode); }
  setPointerHidden(hidden: boolean) { return this.document.setPointerHidden(hidden); }
  extract(signal: AbortSignal) { return this.document.extract(signal); }
  resetProjection() { this.document.resetProjection(); }
  projectCursor(mirror: MirrorDocument | undefined, cursor: BufferCursorPosition | null, autoScroll = true, force = false) {
    return this.document.projectCursor(mirror, cursor, autoScroll, force);
  }
  projectSelection(mirror: MirrorDocument | undefined, selection: BufferSelectionRange | undefined) {
    return this.document.projectSelection(mirror, selection);
  }
  project(index: number, autoScroll: boolean) { return this.document.project(index, autoScroll); }
  clearProjection() { return this.document.clearProjection(); }
  select(start: number, end: number) { return this.document.select(start, end); }
  clearSelection() { return this.document.clearSelection(); }
  hitTest(x: number, y: number) { return this.document.hitTest(x, y); }
  scroll(lines: number, index: number | null) { return this.document.scroll(lines, index); }
  region(index: number | null, direction: number) { return this.document.region(index, direction); }
  activateLink(index: number) { return this.document.activateLink(index); }
}
