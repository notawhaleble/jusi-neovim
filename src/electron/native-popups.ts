import { traceBrowserUrl } from './browser-trace.js';
import { isFullscreenToggleInput, toggleFullscreen } from './browser-window-input.js';
import type { BrowserDocumentEvents } from './browser-document-events.js';
import { resetBrowserInputOnFocusBoundary } from './browser-input-boundary.js';
import { observeBrowserLocation } from './browser-location.js';
import { browserCommandForInput, dispatchBrowserCommand } from '../backends/web/browser-commands.js';
import { BrowserModeKeys } from '../backends/web/mode-keys.js';
import { BrowserRegionNavigator, browserInteraction, type BrowserAction, type BrowserActionTarget, type BrowserInteractionPort } from '../backends/web/interaction.js';
import { nativeBrowserDocument } from './native-browser-document.js';
import type { BrowserDocumentController } from '../backends/web/document-controller.js';
import { WebContentsView } from 'electron';
import type { BrowserWindow } from 'electron';
import { platform } from 'node:os';
import { randomUUID } from 'node:crypto';
import { NativeChildOwner, type NativeChildBinding, type NativeOwnerIdentity } from './native-child-owner.js';
import { resolveNativeChildPlacement, type NativeViewport } from './native-child-placement.js';
import { secureGuest } from './browser-session.js';
import { PopupPermit } from './popup-policy.js';
import type { EmbeddedNvimSession, NvimRpcClient } from '../bridge/rpc-session.js';
import type { NativePopupControl } from '../renderer/contracts.js';

type Child = { view: WebContentsView; contents: any; binding?: NativeChildBinding;
  scope: string; popup?: {arm(scope: string): boolean;resetInput(): void}; pending?: NativePopupControl; visible: boolean; inputSequence: number; text?: BrowserDocumentController; ready: boolean; focusWindow?: number; mode: 'rich' | 'text' };

/** Browser child integration. Native documents never receive the shell preload. */
export class NativePopupCoordinator {
  private readonly owner: NativeChildOwner;
  private readonly children = new Set<Child>();
  constructor(private readonly host: BrowserWindow, private readonly client: NvimRpcClient,
    private readonly session: EmbeddedNvimSession, private readonly refresh: (invalidate?: boolean) => void,
    private readonly events: BrowserDocumentEvents, private readonly feedback: (message: string) => void, private readonly debugUi = false) {
    this.owner = new NativeChildOwner(client, session, error => feedback(String(error)));
  }
  start(): Promise<void> { return this.owner.start(); }
  installOpener(source: any, identity: () => NativeOwnerIdentity | undefined, local: boolean,
    trace: (event: string, fields?: Record<string, unknown>) => void) {
    const permit = new PopupPermit();
    let active: Child | undefined, scope = '';
    const reset = () => { permit.reset(); if (active && !active.contents.isDestroyed()) active.contents.close(); };
    source.on('destroyed', reset);
    source.on('render-process-gone', reset);
    source.on('did-start-navigation', (_e: unknown, _url: string, inPlace: boolean, main: boolean) => { if (main && !inPlace) reset(); });
    source.setWindowOpenHandler((details: any) => {
      const parent = identity();
      trace('popup.request', {url:traceBrowserUrl(details.url),disposition:details.disposition});
      if (local || !parent || active || !permit.take(details.url)) {
        trace('popup.denied');
        permit.reset(); this.feedback('Popup blocked. Use :JusiWebAllowPopup and repeat the page action.');
        return { action: 'deny' };
      }
      trace('popup.allowed');
      return { action: 'allow',
        overrideBrowserWindowOptions: { webPreferences: { session: source.session, sandbox: true,
          disableHtmlFullscreenWindowResize: true,
          contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: false,
          nodeIntegrationInWorker: false, webSecurity: true, allowRunningInsecureContent: false, webviewTag: false } },
        createWindow: (options: any) => {
          const view = new WebContentsView({ webContents: options.webContents, webPreferences: options.webPreferences });
          const contents = view.webContents;
          secureGuest(contents, false);
          view.setVisible(false);
          const child: Child = { view, contents, scope, visible: false, inputSequence: 0, ready: false, mode: 'rich' };
          const publishLocation = observeBrowserLocation(contents, () => child.binding,
            (identity, url) => this.session.setBrowserLocation(identity, url), error => this.feedback(`Browser URL update failed: ${String(error)}`));
          active = child;
          this.children.add(child);
          contents.on('content-bounds-updated', (event: any) => event.preventDefault());
          const modeKeys = new BrowserModeKeys();
          contents.on('focus', () => {
            if (child.visible) { child.focusWindow = undefined; void this.setMode(child, 'rich'); }
          });
          resetBrowserInputOnFocusBoundary(contents, this.host, () => modeKeys.reset());
          contents.on('did-start-navigation', (_event: unknown, _url: string, inPlace: boolean, main: boolean) => {
            if (main && !inPlace) modeKeys.reset();
          });
          contents.on('before-input-event', (event: any, input: any) => {
            if (!child.visible && child.focusWindow === undefined) { modeKeys.reset(); return; }
            if (isFullscreenToggleInput(input)) {
              event.preventDefault();
              toggleFullscreen(this.host, input.isAutoRepeat);
              return;
            }
            const action = modeKeys.accept(input);
            if (!action) {
              const command = browserCommandForInput(input, platform());
              if (command && dispatchBrowserCommand(contents, command, () => {
                child.text?.resetProjection();
                void this.project(child);
              }, url => { void this.session.setRegister("*", url); })) event.preventDefault();
              return;
            }
            event.preventDefault();
            if (action === 'close') contents.close();
            else if (action === 'text') void this.setMode(child, 'text');
          });
          contents.on('before-mouse-event', (_event: unknown, mouse: { type: string; button?: string; x: number; y: number }) => {
            if (!child.visible || mouse.type !== 'mouseDown' || mouse.button !== 'left') return;
            const port = this.interactionPort(child), target = port?.read();
            if (!port || !target) return;
            void browserInteraction(port, target, { kind: 'hit', x: mouse.x, y: mouse.y }).then(position => {
              if (position && port.read() && target.mirror && target.incarnation !== undefined)
                return this.session.setCursor(target.windowId, position.row, position.col,
                  { bufferId: target.bufferId, sessionId: target.sessionId, incarnation: target.incarnation, revision: target.mirror.version });
            }).catch(() => {});
          });
          const changed = () => this.refresh();
          contents.on('did-start-navigation', (_event: unknown, _url: string, inPlace: boolean, main: boolean) => {
            if (main && !inPlace) { child.ready = false; child.text?.invalidate(); }
            changed();
          });
          contents.on('dom-ready', () => { child.ready = true; child.text?.loaded(); });
          contents.on('did-navigate', changed);
          contents.on('did-navigate-in-page', changed);
          contents.once('destroyed', () => {
            child.text?.dispose();
            this.children.delete(child); if (active === child) active = undefined;
            if (!this.host.isDestroyed()) { this.host.contentView.removeChildView(view); this.host.webContents.focus(); this.refresh(); }
          });
          void this.owner.reserve(parent, source, contents, details.url).then(binding => {
            if (contents.isDestroyed() || this.host.isDestroyed()) return;
            child.binding = binding;
            publishLocation();
            // Nested opens use the same policy and exact bound source identity.
            const events = this.events.install(contents, () => child.binding, false);
            child.popup = { resetInput: events.resetInput, arm: this.installOpener(contents, () => child.binding, false, events.trace) };
            child.text = nativeBrowserDocument(binding, contents, this.session,
              this.session.getWebSession(binding.bufferId)?.textLayer !== 'off', () => this.refresh(false));
            if (child.ready) child.text.loaded();
            this.host.contentView.addChildView(view);
            this.refresh();
          }, error => this.feedback(`Popup could not open: ${String(error)}`));
          return contents;
        } };
    });
    return (label: string) => {
      if (local || active || source.isDestroyed() || !identity()) return false;
      scope = label; permit.arm(); return true;
    };
  }
  contentsFor(bufferId: number): any | undefined { return [...this.children].find(child => child.binding?.bufferId === bufferId)?.contents; }
  browserAction(bufferId: number, action: string): boolean {
    const child = [...this.children].find(child => child.binding?.bufferId === bufferId);
    if (!child || !child.binding) return false;
    if (action === 'refresh') void child.text?.rebuild();
    if (action === 'pause' || action === 'resume') child.text?.setAutoRefresh(action === 'resume');
    if (action === 'allow-popup') return child.popup?.arm(child.scope) ?? false;
    return true;
  }
  private async setMode(child: Child, mode: 'rich' | 'text', focus = false): Promise<void> {
    if (!child.binding || child.contents.isDestroyed()) return;
    const sequence = ++child.inputSequence;
    try {
      if (!await this.owner.setMode(child.binding, mode) || sequence !== child.inputSequence
        || child.contents.isDestroyed() || this.host.isDestroyed()) return;
      child.mode = mode;
      void this.project(child);
      if (focus) {
        child.focusWindow = this.session.getWebSession(child.binding.bufferId)?.attachedWindowId ?? undefined;
        if (child.visible) this.restoreFocus(child);
      }
      if (mode === 'text') {
        this.events.fullscreen.exit(child.contents);
        child.popup?.resetInput();
        child.focusWindow = undefined;
        this.host.webContents.focus();
        this.host.webContents.send('jusi:leave-web-mode');
      }
    } catch (error) { this.feedback(`Popup mode change failed: ${String(error)}`); }
  }
  enter(bufferId: number, windowId: number): boolean {
    for (const child of this.children) {
      if (child.binding?.bufferId !== bufferId) continue;
      const current = this.session.getWebSession(bufferId);
      if (child.contents.isDestroyed() || current?.attachedWindowId !== windowId
        || current.sessionId !== child.binding.sessionId || current.incarnation !== child.binding.incarnation) return true;
      void this.setMode(child, 'rich', true);
      return true;
    }
    return false;
  }
  private interactionPort(child: Child): BrowserInteractionPort | undefined {
    const document = child.text;
    if (!document || !child.binding) return;
    return {
      read: () => {
        // Native views briefly park during shell redraw. Document commands depend on
        // authoritative tab/window ownership, not the compositor acknowledgement.
        if (!document.ready || !child.binding) return;
        const current = this.session.getWebSession(child.binding.bufferId);
        const snapshot = this.session.getSnapshot();
        const window = snapshot.windows.find(window => window.id === current?.attachedWindowId
          && window.bufferId === child.binding?.bufferId && window.tabId === snapshot.currentTabId);
        if (!window || current?.sessionId !== child.binding.sessionId || current.incarnation !== child.binding.incarnation) return;
        return { ...child.binding, windowId: window.id, mirror: current.mirror, cursor: window.cursor };
      },
      scroll: (lines, index) => document.scroll(lines, index),
      region: (index, direction) => document.region(index, direction),
      activateLink: index => document.activateLink(index),
      hitTest: (x, y) => document.hitTest(x, y),
      rebuildText: () => document.rebuild(),
      projectCursor: (mirror, cursor, auto, force) => document.projectCursor(mirror, cursor, auto, force),
    };
  }
  /** Claim owned targets even when hidden/stale, so they cannot fall through to another transport. */
  private readonly regionNavigator = new BrowserRegionNavigator();
  interact(target: BrowserActionTarget, action: BrowserAction): boolean {
    for (const child of this.children) {
      if (child.binding?.bufferId !== target.bufferId) continue;
      const port = this.interactionPort(child);
      if (port && action.kind === 'region') {
        void this.regionNavigator.navigate(port, target, action.direction, async () => port.read(), async position => {
          if (target.documentRevision !== undefined && target.incarnation !== undefined)
            await this.session.setCursor(target.windowId, position.row, position.col,
              { bufferId: target.bufferId, sessionId: target.sessionId, incarnation: target.incarnation, revision: target.documentRevision });
        }).catch(() => {});
      } else if (port) void browserInteraction(port, target, action).catch(() => {});
      return true;
    }
    return false;
  }
  retryText(token: string): boolean {
    for (const child of this.children) {
      if (child.pending?.token !== token) continue;
      const port = this.interactionPort(child), target = port?.read();
      if (!target || !port) return false;
      void browserInteraction(port, target, { kind: 'retry' }).catch(() => {});
      return true;
    }
    return false;
  }
  private async project(child: Child): Promise<void> {
    if (!child.visible || !child.text?.ready || !child.binding) return;
    const current = this.session.getWebSession(child.binding.bufferId);
    const snapshot = this.session.getSnapshot();
    const window = snapshot.windows.find(window => window.id === current?.attachedWindowId
      && window.bufferId === child.binding?.bufferId && window.tabId === snapshot.currentTabId);
    if (!window || current?.sessionId !== child.binding.sessionId || current.incarnation !== child.binding.incarnation) return;
    try {
      await child.text.projectCursor(current.mirror, child.mode === 'text' ? window.cursor ?? null : null);
      await child.text.projectSelection(current.mirror, child.mode === 'text' ? window.selection : undefined);
    } catch { /* Navigation and mutation revoke shared document operations. */ }
  }
  private restoreFocus(child: Child): void {
    const windowId = child.focusWindow;
    const snapshot = this.session.getSnapshot();
    const active = snapshot.tabs.find(tab => tab.id === snapshot.currentTabId)?.currentWindowId;
    const current = child.binding && this.session.getWebSession(child.binding.bufferId);
    if (windowId !== undefined && windowId === active && current?.attachedWindowId === windowId
      && current.sessionId === child.binding?.sessionId && current.incarnation === child.binding?.incarnation
      && !child.contents.isDestroyed()) {
      // Electron focus delivery can be interrupted by a new placement. Keep the
      // request until the focus event confirms delivery, or ownership revokes it.
      if (child.contents.isFocused()) child.focusWindow = undefined;
      else child.contents.focus();
    } else child.focusWindow = undefined;
  }
  private placeFullscreen(child: Child): void {
    const [width, height] = this.host.getContentSize();
    child.pending = undefined;
    child.view.setBounds({x: 0, y: 0, width, height});
    child.view.setVisible(true); child.visible = true;
    // Native views do not acquire the webview fullscreen top layer automatically.
    if (this.host.isFocused() && !child.contents.isFocused()) child.contents.focus();
  }
  park(): void {
    this.events.fullscreen.sync();
    const snapshot = this.session.getSnapshot();
    const active = snapshot.tabs.find(tab => tab.id === snapshot.currentTabId)?.currentWindowId;
    for (const child of this.children) {
      if (this.events.fullscreen.isActive(child.contents)) { this.placeFullscreen(child); continue; }
      if (child.visible && !child.contents.isDestroyed() && child.contents.isFocused()
        && child.binding && this.session.getWebSession(child.binding.bufferId)?.attachedWindowId === active) {
        child.focusWindow = active ?? undefined;
      }
      if (child.focusWindow !== active) child.focusWindow = undefined;
      child.pending = undefined; child.visible = false;
      if (!child.contents.isDestroyed()) child.view.setVisible(false);
    }
    if (!this.host.webContents.isDestroyed()) this.host.webContents.send('jusi:native-popup-controls', []);
  }
  place(viewport: NativeViewport | null, generation: number): void {
    if (!viewport || this.events.fullscreen.active) return;
    const controls: NativePopupControl[] = [];
    for (const child of this.children) {
      if (!child.binding || child.contents.isDestroyed()) continue;
      if (this.events.fullscreen.isActive(child.contents)) { this.placeFullscreen(child); continue; }
      const placement = resolveNativeChildPlacement({ binding: child.binding,
        session: this.session.getWebSession(child.binding.bufferId), snapshot: this.session.getSnapshot(),
        viewport, generation, trustedUiVisible: false, debugUi: this.debugUi });
      if (!placement) continue;
      child.view.setBounds(placement.bounds);
      let origin = 'Blank page';
      try { const value = new URL(child.contents.getURL()).origin; if (value !== 'null') origin = value; } catch {}
      const control: NativePopupControl = { token: randomUUID(), generation,
        origin, scope: child.scope, textStatus: child.text?.status ?? 'idle', bufferId: child.binding.bufferId,
        x: placement.bounds.x / viewport.zoom,
        y: placement.bounds.y / viewport.zoom - viewport.cellHeight,
        width: placement.bounds.width / viewport.zoom, height: viewport.cellHeight };
      child.pending = control; controls.push(control);
    }
    this.host.webContents.send('jusi:native-popup-controls', controls);
  }
  acknowledge(token: string, generation: number): boolean {
    for (const child of this.children) {
      if (child.pending?.token !== token || child.pending.generation !== generation || child.contents.isDestroyed()) continue;
      child.view.setVisible(true); child.visible = true; this.restoreFocus(child); void this.project(child); return true;
    }
    return false;
  }
  close(token: string): boolean {
    for (const child of this.children) {
      if (child.pending?.token !== token || child.contents.isDestroyed()) continue;
      child.contents.close(); return true;
    }
    return false;
  }
  dispose(): void { this.owner.dispose(); this.park(); }
}
