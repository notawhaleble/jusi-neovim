import type { BrowserWindow } from 'electron';
import { platform } from 'node:os';
import type { EmbeddedNvimSession, NvimRpcClient } from '../bridge/rpc-session.js';
import { browserClickWorld, installBrowserClicks, takeBrowserClick } from '../backends/web/link-clicks.js';
import { browserCommandForInput } from '../backends/web/browser-commands.js';
import type { BrowserKeyInput } from '../backends/web/mode-keys.js';
import { browserTraceEnabled, traceBrowser, traceBrowserKey, traceBrowserUrl } from './browser-trace.js';
import { BrowserLinkModifiers, resetBrowserInputOnFocusBoundary } from './browser-input-boundary.js';
import { BrowserFullscreen } from './browser-fullscreen.js';
import { browserLinkUrl } from './browser-links.js';

export interface BrowserDocumentIdentity { bufferId: number; sessionId: string; incarnation: number }

export class BrowserDocumentEvents {
  constructor(private readonly host: BrowserWindow, private readonly client: NvimRpcClient,
    private readonly session: EmbeddedNvimSession, readonly fullscreen: BrowserFullscreen,
    private readonly feedback: (message: string) => void) {}

  activeTarget(identity: BrowserDocumentIdentity | undefined) {
    if (!identity) return;
    const current = this.session.getWebSession(identity.bufferId);
    const snapshot = this.session.getSnapshot();
    const active = snapshot.tabs.find(tab => tab.id === snapshot.currentTabId)?.currentWindowId;
    const window = snapshot.windows.find(w => w.id === active && w.id === current?.attachedWindowId
      && w.tabId === snapshot.currentTabId && w.bufferId === identity.bufferId);
    if (!window?.gridBounds || current?.sessionId !== identity.sessionId || current.incarnation !== identity.incarnation) return;
    return { bufferId: identity.bufferId, incarnation: identity.incarnation, sessionId: identity.sessionId,
      windowId: window.id, tabId: window.tabId, gridId: window.gridId };
  }

  install(source: any, identity: () => BrowserDocumentIdentity | undefined, local: boolean) {
    const transport = source.getType();
    const trace = (event: string, fields: Record<string, unknown> = {}) => {
      if (!browserTraceEnabled()) return;
      const parent = identity(), snapshot = this.session.getSnapshot();
      traceBrowser(event, {contents:source.id,transport,bufferId:parent?.bufferId,sessionId:parent?.sessionId,incarnation:parent?.incarnation,tab:snapshot.currentTabId,
        focused:!source.isDestroyed() && source.isFocused(),hostFocused:!this.host.isDestroyed() && this.host.isFocused(),...fields});
    };
    if (browserTraceEnabled()) {
      trace('document.attach');
      for (const event of ['focus','blur','dom-ready','destroyed','render-process-gone']) source.on(event, () => trace('document.'+event));
      source.on('did-start-navigation', (_event: unknown, url: string, inPlace: boolean, main: boolean) => {
        if (main) trace('navigation.start', {url:traceBrowserUrl(url),inPlace});
      });
      source.on('did-navigate', (_event: unknown, url: string) => trace('navigation.commit', {url:traceBrowserUrl(url)}));
      source.on('did-navigate-in-page', (_event: unknown, url: string, main: boolean) => {
        if (main) trace('navigation.in-page', {url:traceBrowserUrl(url)});
      });
    }
    const unregisterFullscreen = this.fullscreen.register(source, () => {
      const target = this.activeTarget(identity());
      return target && JSON.stringify([target.bufferId, target.sessionId, target.incarnation, target.tabId, target.windowId, target.gridId]);
    });
    let interactionEpoch = 0;
    let press: {button: string; epoch: number; since: number} | undefined;
    let clickWorldReady = false, clickDocument = 0;
    const installClicks = () => {
      clickWorldReady = false;
      const document = ++clickDocument;
      if (local || !source.executeJavaScriptInIsolatedWorld) return;
      void source.executeJavaScriptInIsolatedWorld(browserClickWorld, [{code:installBrowserClicks}])
        .then(() => { if (document === clickDocument) clickWorldReady = !source.isDestroyed(); }).catch(() => trace('link.collector-unavailable'));
    };
    source.on('dom-ready', installClicks);
    source.on('did-start-navigation', (_event: unknown, _url: string, inPlace: boolean, main: boolean) => {
      if (main && !inPlace) { clickDocument++; clickWorldReady = false; }
    });
    const modifiers = new BrowserLinkModifiers();
    source.on('before-input-event', (event: {preventDefault(): void}, input: BrowserKeyInput & {type: string; isAutoRepeat?: boolean}) => {
      const before = browserTraceEnabled() ? modifiers.snapshot().join(',') : '';
      modifiers.accept(input);
      if (browserTraceEnabled() && (before !== modifiers.snapshot().join(',') || traceBrowserKey(input) !== 'other' || browserCommandForInput(input, platform()) === 'toggle-pause')) {
        trace('input.key', {type:input.type,key:traceBrowserKey(input),control:input.control,meta:input.meta,shift:input.shift,
          held:modifiers.snapshot(),epoch:interactionEpoch});
      }
      if (browserCommandForInput(input, platform()) !== 'toggle-pause') return;
      const parent = identity();
      const current = parent && this.session.getWebSession(parent.bufferId);
      if (!parent || current?.providerId !== 'web' || current.sessionId !== parent.sessionId
        || current.incarnation !== parent.incarnation) return;
      event.preventDefault();
      if (input.isAutoRepeat) return;
      trace('text.toggle-request');
      void this.client.request('nvim_exec_lua', [
        'local id=...; if vim.api.nvim_get_current_buf()==id.bufferId and vim.b.jusi_incarnation==id.incarnation then require("jusi_neovim.browser").command("toggle-pause") end',
        [{bufferId: parent.bufferId, incarnation: parent.incarnation}],
      ]).catch((error: unknown) => this.feedback(`Text toggle failed: ${String(error)}`));
    });
    const resetInput = () => { trace('input.reset', {held:modifiers.snapshot(),epoch:interactionEpoch}); interactionEpoch++; modifiers.reset(); press = undefined; };
    source.on('enter-html-full-screen', resetInput);
    source.on('leave-html-full-screen', resetInput);
    resetBrowserInputOnFocusBoundary(source, this.host, resetInput);
    source.on('before-mouse-event', (_event: unknown, input: {type: string;button?: string;x: number;y: number;modifiers?: string[]}) => {
      if (input.type === 'mouseDown' || input.type === 'mouseUp') trace('input.mouse', {type:input.type,button:input.button,x:input.x,y:input.y,held:modifiers.snapshot(),modifiers:input.modifiers,epoch:interactionEpoch,route:local?'local':'trusted-click'});
      if (local || !clickWorldReady || !['left','middle'].includes(input.button ?? '')) return;
      if (input.type === 'mouseDown') { press = {button:input.button!,epoch:interactionEpoch,since:Date.now()}; return; }
      if (input.type !== 'mouseUp') return;
      const started = press; press = undefined;
      const parent = this.activeTarget(identity()), epoch = interactionEpoch;
      if (!started || started.button !== input.button || started.epoch !== epoch || !parent) return;
      // The pull may arrive before or after Chromium dispatches click. The isolated
      // collector waits briefly, matches coordinates/button, and consumes once.
      void source.executeJavaScriptInIsolatedWorld(browserClickWorld, [{code:takeBrowserClick(input.x,input.y,input.button!,started.since)}])
        .then(async (click: {url?: unknown;control?: boolean;meta?: boolean;shift?: boolean} | null) => {
          trace('link.click', {epoch,currentEpoch:interactionEpoch,control:click?.control,meta:click?.meta,shift:click?.shift,url:traceBrowserUrl(click?.url)});
          const url=click?.url;
          if (!browserLinkUrl(url)) return;
          if (source.isDestroyed() || identity()?.sessionId !== parent.sessionId || identity()?.incarnation !== parent.incarnation || epoch !== interactionEpoch
            || this.activeTarget(identity())?.windowId !== parent.windowId) { trace('link.cancelled', {epoch}); return; }
          trace('link.dispatch', {route:'modified-mouse',epoch,url:traceBrowserUrl(url)});
          let opened;
          try { opened = await this.client.request('nvim_exec_lua', ['return require("jusi_web").open_link_tab(...)', [{bufferId: parent.bufferId, incarnation: parent.incarnation, windowId: parent.windowId, tabId: parent.tabId, url}]]); }
          catch(error) { trace('link.error', {epoch}); this.feedback(`Link could not open: ${String(error)}`); return; }
          trace('link.result', {route:'modified-mouse',epoch,opened});
          if (!opened) return;
          this.host.webContents.focus(); this.host.webContents.send('jusi:leave-web-mode');
        }).catch(() => { trace('link.cancelled', {epoch}); });
    });
    source.on('destroyed', unregisterFullscreen);
    source.on('render-process-gone', resetInput);
    source.on('did-start-navigation', (_event: unknown, _url: string, inPlace: boolean, main: boolean) => {
      if (main && !inPlace) resetInput();
    });
    return { resetInput, trace };
  }
}
