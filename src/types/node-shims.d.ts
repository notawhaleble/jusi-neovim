declare module "node:child_process" {
  export interface ChildProcessWithoutNullStreams {
    stdin: any;
    stdout: any;
    stderr: any;
    pid?: number;
    kill(signal?: string): boolean;
    on(event: string, listener: (...args: any[]) => void): this;
  }

  export function spawn(
    command: string,
    args?: string[],
    options?: {
      cwd?: string;
      stdio?: any;
    },
  ): ChildProcessWithoutNullStreams;
}

declare module "node:path" {
  export function dirname(path: string): string;
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
}

declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
}

declare module "node:module" {
  export function createRequire(filename: string | URL): {
    (id: string): any;
    resolve(id: string): string;
  };
}

declare module "node:events" {
  export class EventEmitter {
    on(event: string, listener: (...args: any[]) => void): this;
    once(event: string, listener: (...args: any[]) => void): this;
    emit(event: string, ...args: any[]): boolean;
    removeListener(event: string, listener: (...args: any[]) => void): this;
  }

  export function once(
    emitter: EventEmitter | { once(event: string, listener: (...args: any[]) => void): any },
    event: string,
  ): Promise<any[]>;
}

declare const process: {
  exitCode?: number;
};
