import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const [mode, file] = process.argv.slice(2);
if (mode === 'tree' || mode === 'tree-exit') {
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  writeFileSync(file, String(child.pid));
}
createInterface({ input: process.stdin }).once('line', line => {
  const hello = JSON.parse(line);
  if (hello.version !== 1 || hello.type !== 'hello') process.exit(2);
  const frame = {type:'ready',version:1,capabilities:['surface.web'],surface:{backend:'web',url:'about:blank'}};
  if (mode === 'timeout') return;
  if (mode === 'exit') { process.stderr.write('fixture failure'); process.exit(3); }
  if (mode === 'invalid') { process.stdout.write('not json\n'); return; }
  if (mode === 'flood') { process.stdout.write('x'.repeat(70000)); return; }
  if (mode === 'version') frame.version = 99;
  if (mode === 'capability') frame.capabilities = ['neovim.rpc'];
  if (mode === 'cursor-without-navigation') frame.capabilities = ['surface.web', 'text.extract', 'source.navigate.cursor'];
  if (mode === 'cursor-without-text') frame.capabilities = ['surface.web', 'source.navigate', 'source.navigate.cursor'];
  if (mode === 'selection-without-cursor') frame.capabilities = ['surface.web', 'text.extract', 'source.navigate', 'source.navigate.selection'];
  if (mode === 'viewport-without-cursor') frame.capabilities = ['surface.web', 'text.extract', 'source.navigate', 'source.navigate.viewport'];
  if (mode === 'missing') frame.capabilities = [];
  if (mode === 'surface') frame.surface.url = 'file:///etc/passwd';
  if (mode === 'stderr') process.stderr.write('e'.repeat(20000));
  const encoded = JSON.stringify(frame) + '\n';
  // Force framing across chunks.
  process.stdout.write(encoded.slice(0, 10));
  setTimeout(() => {
    process.stdout.write(encoded.slice(10));
    if (mode === 'duplicate') process.stdout.write(encoded);
    if (mode === 'after-exit' || mode === 'tree-exit') setTimeout(() => process.exit(7), 100);
  }, 10);
});
