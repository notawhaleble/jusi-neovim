import { existsSync } from "node:fs";

export interface NvimSpawnOptions {
  command?: string;
  args?: string[];
  runtimePaths?: string[];
  clean?: boolean;
}

export interface NvimLaunchSpec {
  command: string;
  args: string[];
  env: Record<string, string | undefined>;
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function escapeVimOptionPathSegment(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/ /g, "\\ ")
    .replace(/,/g, "\\,")
    .replace(/\|/g, "\\|");
}

export function buildRuntimePathArg(runtimePaths: string[]): string | null {
  const normalized = unique(runtimePaths);
  if (normalized.length === 0) {
    return null;
  }
  return "set runtimepath^=" + normalized.map(escapeVimOptionPathSegment).join(",");
}

function pathKey(env: Record<string, string | undefined>): string {
  return Object.keys(env).find((key) => key.toUpperCase() === "PATH") ?? "PATH";
}

function pathSeparator(): string {
  return process.platform === "win32" ? ";" : ":";
}

function commonExecutableDirs(): string[] {
  return unique([
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/opt/local/bin",
    "/snap/bin",
    "/var/lib/flatpak/exports/bin",
    process.env.HOME ? `${process.env.HOME}/.local/bin` : "",
  ]);
}

function buildLaunchEnv(baseEnv: Record<string, string | undefined> = process.env): Record<string, string | undefined> {
  const env = { ...baseEnv };
  const key = pathKey(env);
  const current = env[key] ?? "";
  const entries = unique([
    ...current.split(pathSeparator()).filter(Boolean),
    ...commonExecutableDirs(),
  ]);
  env[key] = entries.join(pathSeparator());
  return env;
}

function resolveFromPath(command: string, env: Record<string, string | undefined>): string | null {
  const key = pathKey(env);
  const entries = (env[key] ?? "").split(pathSeparator()).filter(Boolean);
  for (const entry of entries) {
    const candidate = `${entry}/${command}`;
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function resolveExecutable(command: string, env: Record<string, string | undefined> = process.env): string {
  if (command.includes("/")) {
    return command;
  }
  const resolved = resolveFromPath(command, buildLaunchEnv(env));
  return resolved ?? command;
}

export function buildNvimLaunchSpec(options: NvimSpawnOptions = {}): NvimLaunchSpec {
  const env = buildLaunchEnv();
  const command = resolveExecutable(options.command ?? process.env.JUSI_NVIM ?? "nvim", env);
  const runtimePaths = unique(options.runtimePaths ?? []);
  const args: string[] = ["--embed"];

  if (options.clean) {
    args.push("--clean");
  }

  if (runtimePaths.length > 0) {
    const runtimePathCommand = buildRuntimePathArg(runtimePaths);
    if (runtimePathCommand) {
      args.push("--cmd", runtimePathCommand);
    }
  }

  for (const arg of options.args ?? []) {
    args.push(arg);
  }

  return {
    command,
    args,
    env,
  };
}
