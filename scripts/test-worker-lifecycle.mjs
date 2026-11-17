import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const scratch = mkdtempSync(join(tmpdir(), 'jusi-worker-lifecycle-'));
const waitFor = async fn => {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (fn()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Worker lifecycle condition timed out');
};
function running(pid) {
  const state = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' }).stdout.trim();
  return state !== '' && !state.startsWith('Z');
}
try {
  for (const action of ['close', 'exit', 'crash']) for (const mode of ['graceful', 'stubborn']) {
    const file = join(scratch, `${action}-${mode}`);
    const owner = spawn(process.env.JUSI_NVIM ?? 'nvim', ['--headless', '-u', 'NONE', '-i', 'NONE', '-n', '-l', 'scripts/fixtures/worker/owner.lua'], {
      env: { ...process.env, JUSI_WORKER_ROOT: resolve('.'), JUSI_WORKER_NODE: process.execPath,
        JUSI_WORKER_FILE: file, JUSI_WORKER_ACTION: action, JUSI_WORKER_MODE: mode },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let diagnostics = '';
    owner.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-8192); });
    let ids, guardian;
    try {
      await waitFor(() => existsSync(file + '.ready'));
      ids = JSON.parse(readFileSync(file, 'utf8'));
      guardian = Number(readFileSync(file + '.guardian', 'utf8'));
      if (action === 'crash') owner.kill('SIGKILL');
      await waitFor(() => owner.exitCode !== null || owner.signalCode !== null);
      if (action !== 'crash') assert.equal(owner.exitCode, 0, diagnostics);
      await waitFor(() => !running(ids.worker) && !running(ids.child) && !running(guardian));
      assert.ok(existsSync(file + '.shutdown'), `${action}/${mode}: shutdown request was not received`);
    } finally {
      if (owner.exitCode === null && owner.signalCode === null) owner.kill('SIGKILL');
      // Only known fixture-owned PIDs, if an assertion fails.
      if (ids && running(ids.worker)) { try { process.kill(-ids.worker, 'SIGKILL'); } catch {} }
      if (guardian && running(guardian)) { try { process.kill(guardian, 'SIGKILL'); } catch {} }
    }
  }
  console.log('worker graceful shutdown and owner-crash cleanup passed');
} finally { rmSync(scratch, { recursive: true, force: true }); }
