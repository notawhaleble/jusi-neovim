import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { open } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { Worker } from 'node:worker_threads';
import { render } from './markdown.mjs';

const file = await open(process.argv[2], 'r');
let source;
try {
  const stat = await file.stat();
  if (!stat.isFile() || stat.size > 1048576) throw new Error('Markdown must be a regular UTF-8 file no larger than 1 MiB');
  const bytes = Buffer.alloc(1048577);
  let bytesRead = 0;
  while (bytesRead < bytes.length) {
    const chunk = await file.read(bytes, bytesRead, bytes.length - bytesRead, bytesRead);
    if (!chunk.bytesRead) break;
    bytesRead += chunk.bytesRead;
  }
  if (bytesRead > 1048576) throw new Error('Markdown exceeds 1 MiB');
  source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, bytesRead));
  if (source.includes('\0')) throw new Error('Markdown contains NUL');
} finally { await file.close(); }
const token = randomUUID(), nonce = randomUUID();
const html = render(source);
let current, extraction, sequence = 0, selected = null, validAnchors = new Set();
const same = (a,b) => a && b && ['bufferId','incarnation','sessionId','revision'].every(k => a[k] === b[k]);
const key = a => JSON.stringify([a.source,a.startByte,a.endByte]);
const page = `<!doctype html><html><head><meta charset="utf-8"><title>Markdown test viewer</title>
<style>body{margin:0;background:#f6f5f1;color:#26313c;font:18px/1.65 system-ui}main{max-width:840px;margin:40px auto;padding:0 40px 100px}h1,h2,h3{line-height:1.2}h1{font-size:2.4em;border-bottom:1px solid #ccd2ce;padding-bottom:20px}h2{margin-top:1.6em}pre{overflow:auto;padding:20px;background:#e8ece9;border-radius:8px}code{font-size:.9em}blockquote{border-left:4px solid #668a7b;margin-left:0;padding-left:20px;color:#58645e}table{border-collapse:collapse;width:100%}th,td{border:1px solid #c7d0cb;padding:8px 14px}a{color:#206c98}.image-alt{color:#63746a}.active{outline:3px solid #2b896b;outline-offset:4px;background:#def0e6}</style></head><body><main>${html}</main>
<script nonce="${nonce}">let prior; async function poll(){try{const s=await fetch('./state').then(r=>r.json());const k=JSON.stringify(s.selected);if(k!==prior){document.querySelectorAll('.active').forEach(e=>e.classList.remove('active'));if(s.selected){const a=s.selected;const e=document.querySelector('[data-start="'+a.startByte+'"][data-end="'+a.endByte+'"]');e?.classList.add('active');e?.scrollIntoView({block:'nearest'});}prior=k;}}finally{setTimeout(poll,80);}}poll();</script></body></html>`;
const server = createServer((req,res) => {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
  if (req.method !== 'GET') { res.writeHead(405).end(); return; }
  if (req.url === `/${token}/`) { res.setHeader('Content-Type','text/html; charset=utf-8'); res.end(page); }
  else if (req.url === `/${token}/state`) { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({selected,sequence})); }
  else res.writeHead(404).end();
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const send = frame => process.stdout.write(JSON.stringify(frame)+'\n');
const stop = () => { extraction?.worker.terminate(); server.close(); process.exit(0); };
createInterface({input:process.stdin}).on('close',stop).on('line',line => {
  const f = JSON.parse(line);
  if (f.type === 'shutdown') return stop();
  if (f.type === 'hello') send({type:'ready',version:1,capabilities:['surface.web','text.extract','source.navigate'],surface:{backend:'web',url:`http://127.0.0.1:${server.address().port}/${token}/`}});
  if (f.type === 'cancel' && extraction?.id === f.id) { extraction.worker.terminate(); extraction = undefined; }
  if (f.type === 'extract') {
    extraction?.worker.terminate(); current = f.ticket; selected = null; validAnchors.clear();
    const worker = new Worker(new URL('./extract.mjs',import.meta.url), {workerData:source});
    const job = extraction = {worker,id:f.id};
    const finish = result => {
      if (extraction !== job) return;
      extraction = undefined;
      if (result.document) validAnchors = new Set(result.document.lines.map(l => key(l.anchor)));
      send({type:'text-result',id:f.id,ticket:f.ticket,...result});
    };
    worker.once('message',finish);
    worker.once('error',error => finish({error:error.message.slice(0,1000)}));
    worker.once('exit',code => { if (extraction === job) finish({error:`Extraction worker exited (${code})`}); });
  }
  if (f.type === 'navigate' && same(current,f.ticket) && Number.isSafeInteger(f.sequence) && f.sequence > sequence) {
    sequence = f.sequence;
    selected = f.anchor && validAnchors.has(key(f.anchor)) ? f.anchor : null;
  }
});
