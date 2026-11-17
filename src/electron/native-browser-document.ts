import { traceBrowser } from './browser-trace.js';
import { BrowserDocumentController } from '../backends/web/document-controller.js';
import { DocumentRevisions } from '../presentation/document-revisions.js';
import type { EmbeddedNvimSession } from '../bridge/rpc-session.js';
import type { NativeChildBinding } from './native-child-owner.js';

/** Native transport/publication adapter; browser behavior lives in the shared controller. */
export function nativeBrowserDocument(binding: NativeChildBinding,
  contents: { executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>; isDestroyed(): boolean; loadURL?(url: string): Promise<void> },
  session: EmbeddedNvimSession, enabled: boolean, changed: () => void, timeoutMs = 10000) {
  const identity = { bufferId: binding.bufferId, sessionId: binding.sessionId, incarnation: binding.incarnation };
  const revisions = new DocumentRevisions(ticket => session.invalidateWebDocument(ticket));
  const document = new BrowserDocumentController({
    executeJavaScript: (code, userGesture) => contents.executeJavaScript(code, userGesture),
    loadURL: contents.loadURL ? url => contents.loadURL!(url) : undefined,
    isCurrent: () => {
      const current = session.getWebSession(binding.bufferId);
      return !contents.isDestroyed() && current?.sessionId === binding.sessionId && current.incarnation === binding.incarnation;
    },
  }, enabled, () => {}, status => {
    traceBrowser('text.status', {...identity,status,transport:'native'});
    void session.setBrowserTextStatus(identity, status).catch(() => {});
    changed();
  }, timeoutMs);
  document.configureText({
    invalidate: () => revisions.advance(identity),
    acquire: () => revisions.current(binding.sessionId),
    publish: async (ticket, mirror) => {
      const accepted = await revisions.commit(ticket, () => session.writeWebMirror(ticket, mirror));
      if (accepted) session.publishWebMirror(ticket, mirror);
      return accepted;
    },
  });
  return document;
}
