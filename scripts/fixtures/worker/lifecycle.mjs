import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const [mode, file] = process.argv.slice(2);
const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
writeFileSync(file, JSON.stringify({ worker: process.pid, child: child.pid }));
setInterval(() => {}, 1000); // survive stdin EOF if shutdown is ignored
createInterface({ input: process.stdin }).on('line', line => {
  const frame = JSON.parse(line);
  if (frame.type === 'hello') process.stdout.write(JSON.stringify({
    type: 'ready', version: 1, capabilities: ['surface.web'], surface: { backend: 'web', url: 'about:blank' },
  }) + '\n');
  if (frame.type === 'shutdown') {
    writeFileSync(file + '.shutdown', 'requested');
    if (mode === 'graceful') process.exit(0);
  }
});
