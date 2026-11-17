import { createInterface } from 'node:readline';
const mode = process.argv[2];
createInterface({ input: process.stdin }).on('line', line => {
  const frame = JSON.parse(line);
  if (frame.type === 'hello') process.stdout.write(JSON.stringify({ type:'ready',version:1,
    capabilities:['surface.web','text.extract'],surface:{backend:'web',url:'about:blank'} })+'\n');
  if (frame.type === 'shutdown') process.exit(0);
  if (frame.type !== 'extract') return; // cancellation deliberately ignored to test late replies
  if (mode === 'timeout') return;
  const text = 'é 文 😀';
  const result = { type:'text-result',id:frame.id,ticket:frame.ticket,document:{
    offsetEncoding:'utf-8',lines:[{text,anchor:{source:'chapter-1',startByte:0,endByte:Buffer.byteLength(text)}}] } };
  if (mode === 'ticket') result.ticket.revision++;
  if (mode === 'invalid') result.document.lines[0].anchor.endByte = -1;
  if (mode === 'error') { delete result.document; result.error = 'fixture extraction failed'; }
  if (mode === 'large') result.document.lines = Array.from({length:3000}, (_, i) => ({text:'x'.repeat(80),anchor:{source:'body',startByte:i*80,endByte:(i+1)*80}}));
  setTimeout(() => process.stdout.write(JSON.stringify(result)+'\n'), mode === 'late' ? 100 : 5);
});
