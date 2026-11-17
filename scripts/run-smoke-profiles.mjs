// Stable loopback origin and disposable profile shared by two sequential app processes.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const root = mkdtempSync(join(tmpdir(), 'jusi-profile-smoke-'));
const server = createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.url === '/login') {
    res.setHeader('Set-Cookie', 'fixture_login=yes; HttpOnly; SameSite=Strict; Max-Age=3600; Path=/');
    res.end('ok');
  } else if (req.url === '/whoami') {
    res.end((req.headers.cookie ?? '').split(';').some(value => value.trim() === 'fixture_login=yes') ? 'fixture-user' : 'anonymous');
  } else {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><h1>Profile fixture</h1><p>Disposable local login test</p>');
  }
});
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  for (const phase of ['seed', 'restart', 'cleared']) {
    await new Promise((resolve, reject) => {
      const child = spawn(createRequire(import.meta.url)('electron'), ['scripts/smoke-profiles.mjs'], {
        stdio: 'inherit', env: {...process.env, JUSI_TEST_PROFILE_ROOT: root,
          JUSI_TEST_PROFILE_URL: `http://127.0.0.1:${server.address().port}/`, JUSI_TEST_PROFILE_PHASE: phase},
      });
      const timeout = setTimeout(() => child.kill('SIGKILL'), 40000);
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', (code, signal) => {
        clearTimeout(timeout);
        code === 0 ? resolve() : reject(new Error(`Profile ${phase} exited ${code ?? signal}`));
      });
    });
  }
  console.log('Browser profile restart smoke passed');
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  rmSync(root, {recursive: true, force: true});
}
