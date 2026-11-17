import { decode, decodeMultiStream, encode, ExtensionCodec } from "@msgpack/msgpack";
import type { Readable, Writable } from "node:stream";
import type { RawNotification } from "./notification-router.js";

export const nvimExtensionCodec = new ExtensionCodec();
for (const type of [0, 1, 2]) {
  nvimExtensionCodec.register({ type, encode: () => null, decode(data) {
    const id = decode(data);
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 0) throw new Error("Invalid Neovim handle");
    return id;
  } });
}

type Pending = { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> };
type Incoming = { id: number; done: boolean; error: unknown; result: unknown };
const LIMIT = 16 * 1024 * 1024;

/** Owns framing and request lifetime, not the child process or editor state. */
export class MsgpackRpc {
  private nextId = 0;
  private pending = new Map<number, Pending>();
  private incoming: Incoming[] = [];
  private failure?: Error;
  constructor(private writer: Writable, private reader: Readable, private handlers: {
    notification(value: RawNotification): void;
    request(value: RawNotification): Promise<unknown>;
    close(error: Error): void;
  }, private timeoutMs = 30_000) {
    writer.on("error", error => this.close(error));
    reader.on("error", error => this.close(error));
    void this.read();
  }

  request(method: string, args: unknown[] = []): Promise<unknown> {
    if (this.failure) return Promise.reject(this.failure);
    if (this.pending.size >= 1024) return Promise.reject(new Error("Neovim RPC request limit exceeded"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Neovim RPC timed out: ${method}`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send([0, id, method, args]); } catch (error) { this.close(error as Error); }
    });
  }

  notify(method: string, args: unknown[] = []): void { this.send([2, method, args]); }

  close(error = new Error("Neovim RPC closed")): void {
    if (this.failure) return;
    this.failure = error;
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(error); }
    this.pending.clear();
    this.incoming = [];
    this.handlers.close(error);
  }

  private send(message: unknown[]): void {
    if (this.failure) throw this.failure;
    const bytes = encode(message);
    if (bytes.length + this.writer.writableLength > LIMIT) throw new Error("Neovim RPC write limit exceeded");
    this.writer.write(bytes, error => { if (error) this.close(error); });
  }

  private async read(): Promise<void> {
    try {
      for await (const message of decodeMultiStream(this.reader, {
        extensionCodec: nvimExtensionCodec, maxStrLength: LIMIT, maxBinLength: LIMIT,
        maxArrayLength: 1_000_000, maxMapLength: 100_000, maxExtLength: 16,
      })) {
        if (this.failure) break;
        this.receive(message);
      }
      this.close(new Error("Neovim RPC stream ended"));
    } catch (error) { this.close(error instanceof Error ? error : new Error(String(error))); }
  }

  private receive(message: unknown): void {
    if (!Array.isArray(message)) throw new Error("Invalid Neovim RPC envelope");
    const [type, id, third, fourth] = message;
    if (type === 1 && message.length === 4 && Number.isSafeInteger(id)) {
      const item = this.pending.get(id);
      if (!item) return; // A timed-out response must not resolve another request.
      this.pending.delete(id); clearTimeout(item.timer);
      if (third !== null) item.reject(new Error(`Neovim RPC error: ${JSON.stringify(third)}`));
      else item.resolve(fourth);
      return;
    }
    if (type === 2 && message.length === 3 && typeof id === "string" && Array.isArray(third)) {
      this.handlers.notification({ method: id, args: third }); return;
    }
    if (type !== 0 || message.length !== 4 || !Number.isSafeInteger(id) || id < 0 || typeof third !== "string" || !Array.isArray(fourth)) {
      throw new Error("Invalid Neovim RPC envelope");
    }
    if (this.incoming.length >= 128 || this.incoming.some(item => item.id === id)) throw new Error("Invalid Neovim RPC request stack");
    const entry: Incoming = { id, done: false, error: null, result: null };
    this.incoming.push(entry);
    // Do not await here: a handler may itself need a response from Neovim.
    void Promise.resolve().then(() => this.handlers.request({ method: third, args: fourth })).then(
      result => { entry.result = result ?? null; },
      error => { entry.error = String(error); },
    ).then(() => {
      entry.done = true;
      if (this.failure) return;
      try {
        // Neovim requires replies in reverse order for nested incoming requests.
        while (this.incoming.at(-1)?.done) {
          const ready = this.incoming.pop()!;
          this.send([1, ready.id, ready.error, ready.result]);
        }
      } catch (error) { this.close(error as Error); }
    });
  }
}
