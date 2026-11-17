import { browserTraceEnabled, traceBrowser } from './browser-trace.js';
/** Fullscreen is a temporary presentation of one exact, current browser window.
 * Chromium still enforces user activation and frame Permissions Policy. */
const permissions = new WeakMap<object, (request: boolean) => boolean>();
export function allowBrowserFullscreen(contents: object | null, request = false): boolean {
  return !!contents && (permissions.get(contents)?.(request) ?? false);
}

const hosts = new WeakMap<object, BrowserFullscreen>();
/** A window shortcut first leaves the document presentation, including its
 * pending exit, before a later explicit press can toggle the host window. */
export function exitBrowserFullscreenForHost(host: object): boolean {
  return hosts.get(host)?.exitForWindowShortcut() ?? false;
}

type Entry = { contents: any; owner: () => string | undefined; grant?: { owner: string; wasFullscreen: boolean }; wasFullscreen?: boolean; exitSequence: number };
export class BrowserFullscreen {
  private current?: { entry: Entry; owner: string };
  private readonly entries = new Set<Entry>();
  private restorePending = false;
  private escapePending = false;
  private exitReleasePending = false;
  private readonly exiting = new Set<Entry>();
  constructor(private readonly host: any, private readonly changed: () => void) {
    hosts.set(host, this);
    host.webContents.on('before-input-event', (event: {preventDefault(): void}, input: {type: string;key: string}) => this.escape(event, input));
    host.on('blur', () => { this.escapePending = false; });
    host.on('enter-full-screen', () => {
      this.trace('host-enter');
      if (this.restorePending && !this.current) { this.trace('host-set-windowed-late'); host.setFullScreen(false); }
    });
    host.on('leave-full-screen', () => { this.trace('host-leave'); this.restorePending = false; });
  }
  register(contents: any, owner: () => string | undefined): () => void {
    const entry: Entry = { contents, owner, exitSequence: 0 };
    this.entries.add(entry);
    permissions.set(contents, request => {
      const identity = owner();
      if (this.restorePending || this.exiting.size > 0 || !identity || contents.isDestroyed() || !contents.isFocused() || !this.host.isFocused()
        || (this.current && this.current.entry !== entry)) { this.trace(request?'request-denied':'check-denied', entry); return false; }
      // Capability probes must not capture window state or authorize a later entry.
      if (request && !this.current) {
        entry.grant = { owner: identity, wasFullscreen: this.host.isFullScreen() };
      }
      this.trace(request?'request-allowed':'check-allowed', entry);
      return true;
    });
    contents.on('before-input-event', (event: {preventDefault(): void}, input: {type: string;key: string}) => {
      if (this.isActive(contents) || this.escapePending || this.exitReleasePending) this.escape(event, input);
    });
    contents.on('enter-html-full-screen', () => {
      this.trace('document-enter', entry);
      const identity = owner();
      if (this.current?.entry === entry && this.current.owner === identity) return;
      const grant = entry.grant;
      entry.grant = undefined;
      if (!identity || !grant || identity !== grant.owner || (this.current && this.current.entry !== entry)) { this.leaveDocument(contents); return; }
      this.restorePending = false;
      entry.wasFullscreen = grant.wasFullscreen;
      this.current = { entry, owner: identity };
      // HTML fullscreen cannot resize any host/guest window implicitly. Electron
      // forwards exit to sibling webviews, whose native-fullscreen snapshot may
      // be false. Only this exact authorized presentation owns window changes.
      if (!this.host.isFullScreen()) {
        this.trace('host-set-fullscreen', entry);
        this.host.setFullScreen(true);
      }
      this.changed();
    });
    contents.on('leave-html-full-screen', () => {
      this.trace('document-leave', entry);
      this.exitReleasePending = true;
      entry.grant = undefined;
      this.restoreWindow(entry);
      if (this.current?.entry === entry) { this.current = undefined; this.changed(); }
    });
    const revoke = () => {
      this.trace('revoke', entry);
      entry.grant = undefined;
      this.exit(contents);
    };
    contents.on('did-start-navigation', (_e: unknown, _url: string, inPlace: boolean, main: boolean) => {
      if (main && !inPlace) revoke();
    });
    contents.on('render-process-gone', () => { revoke(); this.restoreWindow(entry); });
    return () => { revoke(); this.restoreWindow(entry); permissions.delete(contents); this.entries.delete(entry); };
  }
  private trace(event: string, entry?: Entry): void {
    if (!browserTraceEnabled()) return;
    traceBrowser('fullscreen.'+event, {contents:entry?.contents.id,owner:entry?.owner(),authorized:entry?.grant?.owner,
      wasFullscreen:entry?.wasFullscreen,activeOwner:this.current?.owner,activeContents:this.current?.entry.contents.id,
      hostFullscreen:!this.host.isDestroyed() && this.host.isFullScreen(),hostFocused:!this.host.isDestroyed() && this.host.isFocused(),
      guestFocused:entry && !entry.contents.isDestroyed() && entry.contents.isFocused(),
      restorePending:this.restorePending,exiting:this.exiting.size,exitSequence:entry?.exitSequence});
  }
  private escape(event: {preventDefault(): void}, input: {type: string;key: string}): void {
    if (input.type === 'keyDown') this.exitReleasePending = false;
    if (input.key === 'Escape' && input.type === 'keyUp' && this.exitReleasePending) {
      event.preventDefault(); this.exitReleasePending = false; this.escapePending = false; return;
    }
    if (input.key !== 'Escape' || (!this.current && !this.escapePending)) return;
    // A webview's unhandled Escape key-up can be forwarded repeatedly to its
    // embedder while Chromium leaves fullscreen (Electron/macOS). Consume the
    // whole exit gesture, even if focus has already moved back to the shell.
    event.preventDefault();
    if (input.type === 'keyDown') { this.escapePending = true; this.exit(); }
    else if (input.type === 'keyUp') this.escapePending = false;
  }
  exitForWindowShortcut(): boolean {
    if (!this.current && !this.exiting.size && !this.restorePending) return false;
    this.trace('window-shortcut-document-exit', this.current?.entry);
    this.exit();
    return true;
  }
  get active(): boolean { return !!this.current; }
  isActive(contents: any): boolean { return this.current?.entry.contents === contents; }
  sync(): void {
    if (this.current && this.current.entry.owner() !== this.current.owner) this.exit();
  }
  exit(contents?: any): void {
    if (!this.current || (contents && !this.isActive(contents))) return;
    const entry = this.current.entry;
    this.trace('exit', entry);
    this.current = undefined; entry.grant = undefined;
    this.exiting.add(entry);
    const sequence = ++entry.exitSequence;
    void this.leaveDocument(entry.contents).then(() => {
      if (entry.exitSequence === sequence) this.restoreWindow(entry);
    });
    this.changed();
  }
  private restoreWindow(entry: Entry): void {
    this.trace('restore', entry);
    entry.exitSequence++; this.exiting.delete(entry);
    if (entry.wasFullscreen === false && !this.host.isDestroyed()) {
      this.restorePending = true;
      setTimeout(() => { if (this.restorePending && !this.current && !this.host.isDestroyed()) { this.trace('host-set-windowed', entry); this.host.setFullScreen(false); } }, 0);
    }
    entry.wasFullscreen = undefined;
  }
  private async leaveDocument(contents: any): Promise<void> {
    if (!contents.isDestroyed()) await contents.executeJavaScript(
      'if (document.fullscreenElement) document.exitFullscreen().catch(() => {})').catch(() => {});
  }
  dispose(): void {
    if (hosts.get(this.host) === this) hosts.delete(this.host);
    this.exit();
    for (const entry of this.entries) { entry.grant = undefined; permissions.delete(entry.contents); }
    this.entries.clear();
  }
}
