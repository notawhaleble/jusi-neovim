import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { NvimRpcClient } from "./rpc-session.js";
import { RawNotification } from "./notification-router.js";
import { buildNvimLaunchSpec, NvimLaunchSpec, NvimSpawnOptions } from "./spawn-config.js";

type NotificationHandler = (notification: RawNotification) => void;

type PromisedAttach = (writer: any, reader: any) => Promise<any>;

function currentDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

function projectRoot(): string {
  return resolve(currentDir(), "..", "..");
}

function runtimeRoot(): string {
  return join(projectRoot(), "runtime");
}

function promisedClientCandidates(): string[] {
  return [
    "promised-neovim-client",
  ];
}

function loadPromisedAttach(): PromisedAttach {
  const require = createRequire(import.meta.url);
  for (const candidate of promisedClientCandidates()) {
    try {
      const mod = require(candidate);
      if (mod && typeof mod.attach === "function") {
        return mod.attach as PromisedAttach;
      }
    } catch (_error) {
      continue;
    }
  }
  throw new Error(
    "Could not load promised-neovim-client from this repository.",
  );
}

export function buildEmbeddedLaunchSpec(options: NvimSpawnOptions = {}): NvimLaunchSpec {
  const runtimePaths = [...(options.runtimePaths ?? []), runtimeRoot()];
  return buildNvimLaunchSpec({
    ...options,
    runtimePaths,
  });
}

export class PromisedNvimRpcClient implements NvimRpcClient {
  private readonly listeners = new Set<NotificationHandler>();
  private nvim: any | null = null;
  private proc: any | null = null;

  static async spawn(options: NvimSpawnOptions = {}): Promise<PromisedNvimRpcClient> {
    const client = new PromisedNvimRpcClient();
    await client.connect(options);
    return client;
  }

  onNotification(listener: NotificationHandler): void {
    this.listeners.add(listener);
  }

  async request(method: string, args: unknown[] = []): Promise<unknown> {
    if (!this.nvim) {
      throw new Error("Neovim client is not connected");
    }

    const session = this.nvim._session;
    if (!session || typeof session.request !== "function") {
      throw new Error("Underlying Neovim session does not support generic requests");
    }

    return await new Promise((resolvePromise, rejectPromise) => {
      session.request(method, args, (error: unknown, result: unknown) => {
        if (error) {
          rejectPromise(error);
          return;
        }
        resolvePromise(result);
      });
    });
  }

  notify(method: string, args: unknown[] = []): void {
    if (!this.nvim) {
      throw new Error("Neovim client is not connected");
    }

    const session = this.nvim._session;
    if (!session || typeof session.notify !== "function") {
      throw new Error("Underlying Neovim session does not support notifications");
    }

    session.notify(method, args);
  }

  async dispose(): Promise<void> {
    try {
      if (this.nvim && typeof this.nvim.quit === "function") {
        await this.nvim.quit();
      }
    } catch (_error) {
      // Ignore quit errors on shutdown.
    }

    if (this.proc) {
      this.proc.kill();
    }

    this.nvim = null;
    this.proc = null;
    this.listeners.clear();
  }

  private async connect(options: NvimSpawnOptions): Promise<void> {
    const attach = loadPromisedAttach();
    const launch = buildEmbeddedLaunchSpec(options);
    const proc = spawn(launch.command, launch.args, {
      cwd: projectRoot(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.proc = proc;
    this.nvim = await attach(proc.stdin, proc.stdout);
    const session = this.nvim._session;

    if (session && typeof session.on === "function") {
      session.on("notification", (method: unknown, args: unknown[]) => {
        const name = this.normalizeMethod(method);
        if (name !== "redraw") {
          return;
        }
        this.emitNotification({
          method: name,
          args,
        });
      });
    }

    this.nvim.on("notification", (method: string, args: unknown[]) => {
      if (method === "redraw") {
        return;
      }
      this.emitNotification({ method, args });
    });
  }

  private emitNotification(notification: RawNotification): void {
    for (const listener of this.listeners) {
      listener(notification);
    }
  }

  private normalizeMethod(method: unknown): string {
    if (typeof method === "string") {
      return method;
    }
    if (method && typeof (method as { toString?: () => string }).toString === "function") {
      return (method as { toString: () => string }).toString();
    }
    return String(method);
  }
}
