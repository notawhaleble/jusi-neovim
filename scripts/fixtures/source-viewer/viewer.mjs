// Conformance viewer: two immutable source paragraphs, not a format-complete viewer.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
const token = randomUUID();
const lines = ['First source paragraph: é 文 😀', 'Second source paragraph'];
const anchors = lines.map((text, index) => ({ source: `paragraph-${index + 1}`, startByte: 0, endByte: Buffer.byteLength(text) }));
let ticket, sequence = 0, selected = null;
const page = `<!doctype html><meta charset="utf-8"><title>Source viewer fixture</title>
<style>body{font:24px system-ui;padding:32px;background:#f5f3ef;color:#232932}p{padding:24px;border:3px solid transparent;border-radius:8px}p.active{border-color:#26745d;background:#d9eee4}</style>
<h1>Independent source viewer</h1><p id="paragraph-1">${lines[0]}</p><p id="paragraph-2">${lines[1]}</p>
<script>let prior; setInterval(async()=>{const s=await fetch('./state').then(r=>r.json());
for(const p of document.querySelectorAll('p'))p.classList.toggle('active',p.id===s.selected);
if(s.selected&&s.selected!==prior)document.getElementById(s.selected)?.scrollIntoView({block:'nearest'});prior=s.selected;},50);</script>`;
const server = createServer((request,response) => {
  response.setHeader('Cache-Control','no-store');
  if(request.method !== 'GET') { response.writeHead(405).end(); return; }
  if(request.url === `/${token}/state`) { response.setHeader('Content-Type','application/json'); response.end(JSON.stringify({selected,sequence})); }
  else if(request.url === `/${token}/`) { response.setHeader('Content-Type','text/html; charset=utf-8'); response.end(page); }
  else response.writeHead(404).end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url = `http://127.0.0.1:${server.address().port}/${token}/`;
const sameTicket = value => ticket && ['bufferId','sessionId','incarnation','revision'].every(key=>value?.[key]===ticket[key]);
createInterface({input:process.stdin}).on('line',line=>{
  const f=JSON.parse(line);
  if(f.type==='shutdown') { server.close(); process.exit(0); }
  if(f.type==='hello') process.stdout.write(JSON.stringify({type:'ready',version:1,capabilities:['surface.web','text.extract','source.navigate'],surface:{backend:'web',url}})+'\n');
  if(f.type==='extract') {
    ticket=f.ticket; selected=null;
    process.stdout.write(JSON.stringify({type:'text-result',id:f.id,ticket,document:{offsetEncoding:'utf-8',lines:lines.map((text,i)=>({text,anchor:anchors[i]}))}})+'\n');
  }
  if(f.type==='navigate' && sameTicket(f.ticket) && Number.isSafeInteger(f.sequence) && f.sequence>sequence) {
    sequence=f.sequence;
    selected=f.anchor && anchors.some(a=>a.source===f.anchor.source&&a.startByte===f.anchor.startByte&&a.endByte===f.anchor.endByte) ? f.anchor.source : null;
  }
});
