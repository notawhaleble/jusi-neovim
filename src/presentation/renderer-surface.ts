import type { BufferCursorPosition, BufferSelectionRange } from "../core/types.js";
import type { DocumentTicket } from "./document-revisions.js";
import type { TextLayerStatus } from "./contracts.js";
import type { AttachedPresentation, PresentationMode, TextDocument } from "./contracts.js";

export interface TextPublication<TDocument> {
  invalidate(): Promise<unknown>;
  acquire(): Promise<DocumentTicket | null>;
  publish(ticket: DocumentTicket, document: TDocument): Promise<boolean>;
}

export interface SurfaceEvents {
  textStatusChanged?(status: TextLayerStatus): void;
  invalidated(): void;
  textChanged?(): Promise<void>;
  ready(): void;
  crashed(): void;
  loaded(): void;
  focused?(): void;
  blurred?(): void;
  scrolled(): void;
  pointerVisible(): void;
}

/** Pixel bounds come from resolved Neovim grids. Backends never infer ownership. */
export interface RendererSurface<TDocument extends TextDocument = TextDocument> {
  readonly element: HTMLElement;
  readonly ready: boolean;
  readonly crashed: boolean;
  matches(view: AttachedPresentation): boolean;
  attach(parent: HTMLElement): void;
  detach(): void;
  resize(width: number, height: number): void;
  update(view: AttachedPresentation): boolean;
  focus(): void;
  reload(): void;
  dispose(): void;
  documentHandle(): number;
  setMode(mode: PresentationMode): Promise<unknown>;
  setPointerHidden(hidden: boolean): Promise<unknown>;
  configureText(publication: TextPublication<TDocument>): void;
  rebuildText(): Promise<void>;
  extract(signal: AbortSignal): Promise<TDocument>;
  resetProjection(): void;
  projectCursor(document: TDocument | undefined, cursor: BufferCursorPosition | null, autoScroll?: boolean, force?: boolean): Promise<void>;
  projectSelection(document: TDocument | undefined, selection: BufferSelectionRange | undefined): Promise<void>;
  project(index: number, autoScroll: boolean): Promise<unknown>;
  clearProjection(): Promise<unknown>;
  select(start: number, end: number): Promise<unknown>;
  clearSelection(): Promise<unknown>;
  hitTest(x: number, y: number): Promise<unknown>;
  scroll(lines: number, index: number | null): Promise<unknown>;
  region(index: number | null, direction: number): Promise<unknown>;
  activateLink(index: number): Promise<void>;
}
