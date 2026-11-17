import type { WorkerTextDocument } from "./worker-document.js";
/** Versioned host contract. Providers are trusted Neovim packages; documents are not. */
export const PRESENTATION_API_VERSION = 1;
export type TextLayerPolicy = "auto" | "off";
export type TextLayerStatus = "disabled" | "idle" | "building" | "ready" | "error" | "limited";
export type PresentationMode = "rich" | "text";

export interface PresentationOptions {
  /** Main-owned reservation; excluded from DOM attachments until native integration. */
  nativeChild?: string;
  autoRefresh?: boolean;
  providerId?: string;
  textLayer?: TextLayerPolicy;
  textSource?: "dom" | "worker";
  profile?: string;
  privateBrowsing?: boolean;
}

/** These actions belong to the host and cannot be captured by document content. */
export type PresentationAction = "close" | "rich" | "text";

/** Normalized internal descriptor. Provider wire formats are adapted at the boundary. */
export interface PresentationSurface {
  backend: string;
  uri: string;
}

/** Backend-independent text; specialized lines may carry DOM/page/ebook mappings. */
export interface TextLine {
  lineNumber: number;
  text: string;
  startIndex: number;
  endIndex: number;
}
export interface TextDocument<TLine extends TextLine = TextLine> {
  version: number;
  lines: TLine[];
  totalTextLength: number;
}

export interface PresentationSession<TDocument extends TextDocument = TextDocument> extends PresentationOptions {
  sessionId: string;
  incarnation?: number;
  bufferId: number;
  surface: PresentationSurface;
  title?: string;
  mirror?: TDocument;
  workerText?: WorkerTextDocument;
  attachedWindowId: number | null;
  lastKnownTabId: number | null;
}

export interface AttachedPresentation<TDocument extends TextDocument = TextDocument> extends PresentationOptions {
  sessionId: string;
  incarnation?: number;
  bufferId: number;
  windowId: number;
  tabId: number | null;
  surface: PresentationSurface;
  title?: string;
  mirror?: TDocument;
  workerText?: WorkerTextDocument;
}
