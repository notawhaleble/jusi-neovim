import { shutdownProcess } from "./process-shutdown.js";
import { MsgpackRpc } from "./msgpack-rpc.js";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { NvimRpcClient } from "./rpc-session.js";
import { RawNotification } from "./notification-router.js";
import { buildNvimLaunchSpec, NvimLaunchSpec, NvimSpawnOptions } from "./spawn-config.js";

type NotificationHandler = (notification: RawNotification) => void;
type RequestHandler = (request: RawNotification) => unknown;
type ExitHandler = () => void;

function currentDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

function projectRoot(): string {
  return resolve(currentDir(), "..", "..");
}

function runtimeRoot(): string {
  return join(projectRoot(), "runtime");
}

function formatSpawnError(error: unknown, command: string, env: Record<string, string | undefined>): Error {
  const details = error instanceof Error ? error.message : String(error);
  const pathValue = Object.entries(env).find(([key]) => key.toUpperCase() === "PATH")?.[1] ?? "";
  return new Error(`Failed to launch Neovim using "${command}": ${details}. PATH=${pathValue}`);
}

export function buildEmbeddedLaunchSpec(options: NvimSpawnOptions = {}): NvimLaunchSpec {
  const runtimePaths = [...(options.runtimePaths ?? []), runtimeRoot(), join(projectRoot(), "packages", "jusi-web.nvim")];
  return buildNvimLaunchSpec({
    ...options,
    runtimePaths,
  });
}

export class EmbeddedNvimRpcClient implements NvimRpcClient {
  private readonly listeners = new Set<NotificationHandler>();
  private readonly requestListeners = new Set<RequestHandler>();
  private readonly exitListeners = new Set<ExitHandler>();
  private rpc: MsgpackRpc | null = null;
  private disposal?: Promise<void>;
  private proc: ChildProcessWithoutNullStreams | null = null;
  private exited = false;

  static async spawn(options: NvimSpawnOptions = {}): Promise<EmbeddedNvimRpcClient> {
    const client = new EmbeddedNvimRpcClient();
    await client.connect(options);
    return client;
  }

  onNotification(listener: NotificationHandler): void {
    this.listeners.add(listener);
  }

  onRequest(listener: RequestHandler): void {
    this.requestListeners.add(listener);
  }

  onExit(listener: ExitHandler): void {
    this.exitListeners.add(listener);
  }

  request(method: string, args: unknown[] = []): Promise<unknown> {
    if (!this.rpc) return Promise.reject(new Error("Neovim client is not connected"));
    return this.rpc.request(method, args);
  }

  notify(method: string, args: unknown[] = []): void {
    if (!this.rpc) throw new Error("Neovim client is not connected");
    this.rpc.notify(method, args);
  }

  dispose(): Promise<void> {
    return this.disposal ??= this.shutdown();
  }

  private async shutdown(): Promise<void> {
    if (this.proc) await shutdownProcess(this.proc, () => this.notify("nvim_command", ["qa!"]));
    this.rpc?.close();
    this.rpc = null;
    this.proc = null;
    this.listeners.clear();
    this.requestListeners.clear();
    this.exitListeners.clear();
  }

  private async connect(options: NvimSpawnOptions): Promise<void> {
    const launch = buildEmbeddedLaunchSpec(options);
    const proc = spawn(launch.command, launch.args, {
      cwd: projectRoot(), env: launch.env, stdio: ["pipe", "pipe", "pipe"],
    });
    this.proc = proc;
    proc.stderr.resume();
    this.rpc = new MsgpackRpc(proc.stdin, proc.stdout, {
      notification: value => this.emitNotification(value),
      request: value => this.handleRequest(value),
      close: () => {
        this.emitExit();
        void this.dispose().catch(error => console.error("[nvim-shutdown]", error));
      },
    });
    proc.once("error", (error: Error) => this.rpc?.close(formatSpawnError(error, launch.command, launch.env)));
    proc.once("exit", () => { this.rpc?.close(); this.emitExit(); });
    try { await this.request("nvim_get_api_info"); }
    catch (error) { await this.dispose(); throw error; }
  }

  private emitNotification(notification: RawNotification): void {
    for (const listener of this.listeners) {
      listener(notification);
    }
  }

  private async handleRequest(request: RawNotification): Promise<unknown> {
    for (const listener of this.requestListeners) {
      const result = await listener(request);
      if (result !== undefined) {
        return result;
      }
    }
    return null;
  }

  private emitExit(): void {
    if (this.exited) {
      return;
    }
    this.exited = true;
    for (const listener of this.exitListeners) {
      listener();
    }
  }

}
