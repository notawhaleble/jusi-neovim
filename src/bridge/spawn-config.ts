export interface NvimSpawnOptions {
  command?: string;
  args?: string[];
  runtimePaths?: string[];
  clean?: boolean;
}

export interface NvimLaunchSpec {
  command: string;
  args: string[];
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

export function buildRuntimePathArg(runtimePaths: string[]): string | null {
  const normalized = unique(runtimePaths);
  if (normalized.length === 0) {
    return null;
  }
  return "set runtimepath^=" + normalized.join(",");
}

export function buildNvimLaunchSpec(options: NvimSpawnOptions = {}): NvimLaunchSpec {
  const command = options.command ?? "nvim";
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
  };
}
