import assert from 'node:assert/strict';
import { workerDocument } from '../../dist/presentation/worker-document.js';
import { EmbeddedNvimSession } from '../../dist/bridge/rpc-session.js';
const document = {offsetEncoding:'utf-8',lines:[{text:'é 文 😀',anchor:{source:'chapter',startByte:0,endByte:12},ignored:'unsafe'}],ignored:true};
assert.deepEqual(Object.keys(workerDocument(document)), ['offsetEncoding','lines']);
assert.equal(workerDocument(document).lines[0].ignored, undefined);
for (const text of ['bad\nline', '\0', '\ud800', 'x'.repeat(524289)]) {
  assert.throws(() => workerDocument({...document,lines:[{...document.lines[0],text}]}));
}
assert.throws(() => workerDocument({...document,lines:[{text:'x',anchor:{source:'x',startByte:2,endByte:1}}]}));
const client = {
  calls: [],
  onNotification(fn) { this.listener = fn; },
  onExit(fn) { this.exit = fn; },
  async request(method,args) { this.calls.push({method,args}); return method === 'nvim_get_api_info' ? [7,{}] : true; },
  dispose() {},
};
const session = new EmbeddedNvimSession(client);
session.start();
session.route({method:'jusi:web-session',args:[{bufferId:2,incarnation:1,url:'about:blank',textSource:'worker'}]});
const registered = session.getWebSession(2);
const ticket = {bufferId:2,incarnation:1,sessionId:registered.sessionId,revision:1};
const pending = session.extractWorkerText(ticket);
await new Promise(resolve => setImmediate(resolve));
const request = client.calls.at(-1);
assert.equal(request.args[1][2],7,'reply channel comes from this RPC client');
const id = request.args[1][0];
client.listener({method:'jusi:worker-text',args:[{id:id+1,document}]});
client.listener({method:'jusi:worker-text',args:[{id,document}]});
assert.deepEqual(await pending,workerDocument(document));
assert.equal(await session.writeWorkerText({...ticket,sessionId:'stale'},document),false);
assert.equal(await session.writeWorkerText(ticket,document),true);
session.publishWorkerText(ticket,workerDocument(document));
assert.equal(session.getWebSession(2).workerText.lines[0].anchor.source,'chapter');
assert.equal(session.getWebSession(2).mirror,undefined);
await session.invalidateWebDocument({...ticket,revision:2});
assert.equal(session.getWebSession(2).workerText,undefined);
const bad = session.extractWorkerText(ticket);
const rejected = assert.rejects(bad,/Invalid/);
await new Promise(resolve => setImmediate(resolve));
client.listener({method:'jusi:worker-text',args:[{id:client.calls.at(-1).args[1][0],document:{}}]});
await rejected;
const closing = session.extractWorkerText(ticket);
const closed = assert.rejects(closing,/closed/);
await new Promise(resolve => setImmediate(resolve));
client.exit();
await closed;
await session.dispose();
console.log('worker document bridge tests passed');
