import { randomUUID } from "node:crypto";
import type { NvimRpcClient, EmbeddedNvimSession } from "../bridge/rpc-session.js";

import type { BrowserDocumentIdentity } from './browser-document-events.js';
export type NativeOwnerIdentity = BrowserDocumentIdentity;
export interface NativeDocument {
  readonly session: unknown;
  isDestroyed(): boolean;
  close(): void;
  on(event: string, listener: (...args: any[]) => void): void;
  removeListener(event: string, listener: (...args: any[]) => void): void;
}
export interface NativeChildBinding extends NativeOwnerIdentity { token: string; document: NativeDocument }
type Allocation = { bufferId: number; incarnation: number; token: string };
type Entry = {
  sequence: number; token: string; source: NativeOwnerIdentity; document: NativeDocument;
  allocation?: Allocation; binding?: NativeChildBinding; timer: ReturnType<typeof setTimeout>;
  cleanup: Array<() => void>; resolve(value: NativeChildBinding): void; reject(error: Error): void;
};

/** Main-owned lifecycle only. No native placement, renderer endpoint or partition override. */
export class NativeChildOwner {
  private readonly epoch = randomUUID();
  private sequence = 0;
  private closed = false;
  private rpcLive = true;
  private readonly entries = new Map<number, Entry>();
  private unsubscribe: Array<() => void> = [];
  constructor(private readonly client: Pick<NvimRpcClient, "request">,
    private readonly session: Pick<EmbeddedNvimSession, "getWebSession" | "onStateChanged" | "onExit">,
    private readonly report: (error: unknown) => void, private readonly timeoutMs = 5000) {}
  async start(): Promise<void> {
    if (this.closed || this.unsubscribe.length) throw new Error("Native owner already started or closed");
    await this.lua("connect", this.epoch);
    if (this.closed) return;
    this.unsubscribe = [this.session.onStateChanged(() => this.reconcile()), this.session.onExit(() => { this.rpcLive = false; this.dispose(); })];
  }
  get size(): number { return this.entries.size; }
  reserve(source: NativeOwnerIdentity, opener: NativeDocument, document: NativeDocument, url: string): Promise<NativeChildBinding> {
    const current = this.session.getWebSession(source.bufferId);
    if (this.closed || !this.unsubscribe.length || current?.providerId !== "web" || !this.current(source)
      || opener.isDestroyed() || document.isDestroyed() || opener.session !== document.session
      || this.entries.size >= 16 || [...this.entries.values()].some(e => e.source.sessionId === source.sessionId)) {
      if (!document.isDestroyed()) document.close();
      return Promise.reject(new Error("Native child source unavailable or capacity exceeded"));
    }
    const sequence = ++this.sequence, token = randomUUID();
    const promise = new Promise<NativeChildBinding>((resolve, reject) => {
      const entry: Entry = { sequence, token, source: { ...source }, document, resolve, reject, cleanup: [],
        timer: setTimeout(() => this.close(sequence, "Native child binding timed out"), this.timeoutMs) };
      this.entries.set(sequence, entry);
      const on = (contents: NativeDocument, event: string, listener: (...args: any[]) => void) => {
        contents.on(event, listener); entry.cleanup.push(() => contents.removeListener(event, listener));
      };
      on(document, "destroyed", () => this.close(sequence, "Child document closed"));
      on(document, "render-process-gone", () => this.close(sequence, "Child document crashed"));
      on(opener, "destroyed", () => this.close(sequence, "Source document closed"));
      on(opener, "render-process-gone", () => this.close(sequence, "Source document crashed"));
      on(opener, "did-start-navigation", (_event, _url, inPlace, mainFrame) => {
        if (mainFrame && !inPlace) this.close(sequence, "Source navigated");
      });
      void this.lua("allocate", { epoch: this.epoch, sequence, token, source, url }).then(reply => {
        if (this.entries.get(sequence) !== entry) { this.cancel(sequence); return; }
        const value = reply as Allocation;
        if (!value || value.token !== token || !Number.isSafeInteger(value.bufferId) || value.bufferId <= 0
          || !Number.isSafeInteger(value.incarnation) || value.incarnation <= 0) {
          this.close(sequence, "Native child allocation rejected"); return;
        }
        entry.allocation = value;
        this.reconcile();
      }, error => this.close(sequence, `Native child allocation failed: ${String(error)}`));
    });
    return promise;
  }
  async setMode(binding: NativeChildBinding, mode: "rich" | "text"): Promise<boolean> {
    const entry = [...this.entries.values()].find(entry => entry.binding === binding);
    if (!entry || this.closed || !this.current(binding) || binding.document.isDestroyed()) return false;
    return await this.lua("set_mode", { epoch: this.epoch, sequence: entry.sequence,
      token: binding.token, bufferId: binding.bufferId, incarnation: binding.incarnation, mode }) === true;
  }
  private current(identity: NativeOwnerIdentity): boolean {
    const current = this.session.getWebSession(identity.bufferId);
    return current?.sessionId === identity.sessionId && current.incarnation === identity.incarnation;
  }
  private reconcile(): void {
    for (const entry of this.entries.values()) {
      if (!this.current(entry.source)) { this.close(entry.sequence, "Source presentation changed"); continue; }
      if (entry.binding) {
        if (!this.current(entry.binding)) this.close(entry.sequence, "Child presentation changed");
        continue;
      }
      if (!entry.allocation) continue;
      const child = this.session.getWebSession(entry.allocation.bufferId);
      if (!child) continue; // RPC reply may precede bridge state; bounded by the binding timer.
      if (child.incarnation !== entry.allocation.incarnation || child.nativeChild !== entry.token) {
        this.close(entry.sequence, "Child incarnation changed"); continue;
      }
      entry.binding = { bufferId: child.bufferId, sessionId: child.sessionId, incarnation: child.incarnation,
        token: entry.token, document: entry.document };
      clearTimeout(entry.timer);
      entry.resolve(entry.binding);
    }
  }
  private lua(method: string, request: unknown): Promise<unknown> {
    return this.client.request("nvim_exec_lua", [`return require("jusi_neovim.native-child").${method}(...)`, [request]]);
  }
  private cancel(sequence: number): void {
    if (!this.rpcLive) return;
    void this.lua("cancel", { epoch: this.epoch, sequence }).catch(this.report);
  }
  private close(sequence: number, reason: string): void {
    const entry = this.entries.get(sequence);
    if (!entry) return;
    this.entries.delete(sequence);
    clearTimeout(entry.timer);
    for (const cleanup of entry.cleanup) cleanup();
    if (!entry.document.isDestroyed()) entry.document.close();
    this.cancel(sequence);
    entry.reject(new Error(reason));
  }
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    for (const unsubscribe of this.unsubscribe) unsubscribe();
    this.unsubscribe = [];
    for (const sequence of this.entries.keys()) this.close(sequence, "Native owner closed");
  }
}
