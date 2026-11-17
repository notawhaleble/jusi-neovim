interface ManagedProcess {
  exitCode?: number | null;
  signalCode?: string | null;
  once(event: string, listener: () => void): unknown;
  removeListener(event: string, listener: () => void): unknown;
  kill(signal: "SIGTERM" | "SIGKILL"): unknown;
}

/** Wait for graceful Neovim/provider callbacks, then escalate with bounded waits. */
export async function shutdownProcess(proc: ManagedProcess, quit: () => void, graceMs = 1000): Promise<void> {
  if (proc.exitCode != null || proc.signalCode != null) return;
  let exited = false;
  let notifyExit: (() => void) | undefined;
  const onExit = () => { exited = true; notifyExit?.(); };
  proc.once("exit", onExit);
  const wait = (ms: number) => new Promise<void>(resolve => {
    if (exited) { resolve(); return; }
    const timer = setTimeout(() => { notifyExit = undefined; resolve(); }, ms);
    notifyExit = () => { clearTimeout(timer); notifyExit = undefined; resolve(); };
  });
  try {
    try { quit(); } catch { /* A disconnected RPC pipe still needs process cleanup. */ }
    await wait(graceMs);
    if (!exited) { proc.kill("SIGTERM"); await wait(graceMs); }
    if (!exited) { proc.kill("SIGKILL"); await wait(graceMs); }
    if (!exited) throw new Error("Neovim did not exit after SIGKILL");
  } finally { proc.removeListener("exit", onExit); }
}
