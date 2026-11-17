import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { mirrorExtractorSource } from '../../dist/backends/web/document-scripts.js';

async function extract(texts, { hidden = false, cancel = false, wrapped = false } = {}) {
  const parent = { tagName: hidden ? 'SCRIPT' : 'P', closest: () => false };
  const nodes = texts.map(nodeValue => ({ nodeValue, length: nodeValue.length, nodeType: 3, parentElement: parent }));
  let cursor = 0, ticks = 0, yields = 0, ranges = 0;
  const window = { getComputedStyle: () => ({ display: 'block', whiteSpace: 'pre', lineHeight: '16' }) };
  const rect = { x: 0, y: 0, top: 0, left: 0, width: 10, height: 16 };
  const document = { body: parent, documentElement: parent,
    createTreeWalker: () => ({ nextNode: () => nodes[cursor++] }),
    createRange: () => {
      let start=0,end=0;
      return {setStart(_node,value){start=value},setEnd(_node,value){end=value},detach(){},
        getClientRects:()=>{ranges++;
          if(!wrapped) return [rect];
          const first={...rect,top:Math.floor(start/80)*20},last={...rect,top:Math.floor((end-1)/80)*20};
          return first.top===last.top ? [first] : [first,last];
        }};
    } };
  const result = await runInNewContext(mirrorExtractorSource(), { window, document,
    Node: { TEXT_NODE: 3 }, NodeFilter: { SHOW_TEXT: 4 },
    performance: { now: () => ++ticks },
    setTimeout: resolve => { yields++; if (cancel) window.__jusiTextJobId++; resolve(); } });
  return { result, window, yields, ranges };
}
const exact = await extract(['a'.repeat(200000)]);
assert.equal(exact.result.totalTextLength, 200000);
assert.ok(exact.yields > 0, 'large single node normalization yields');
for (const texts of [['a'.repeat(200001)], ['a'.repeat(200000), 'b'], [' '.repeat(1000001)], Array(100001).fill('')]) {
  const { result, window } = await extract(texts);
  assert.equal(result.limitExceeded, true);
  assert.equal(window.__jusiMirrorIndexMap.length, 0, 'no partial mapping on limit');
}
assert.equal((await extract(Array(100001).fill('ignored'), { hidden: true })).result.limitExceeded, true);
assert.equal((await extract(['\n'.repeat(200000)])).result.lines.length, 200000);
assert.equal((await extract(['\n'.repeat(200001)])).result.limitExceeded, true);
assert.equal((await extract([''])).result.lines.length, 0);
await assert.rejects(extract(['a'.repeat(200000)], { cancel: true }), /superseded/);
const wrapped = await extract(['a'.repeat(2048)], { wrapped: true });
assert.equal(wrapped.result.totalTextLength, 2048 + 25);
assert.ok(wrapped.yields > 2, 'wrapped single word yields within range geometry');
assert.deepEqual(Array.from(wrapped.result.lines,line=>line.text.length),[...Array(25).fill(80),48]);
assert.ok(wrapped.ranges < 1024, 'wrapped mapping groups same-line ranges');
console.log('extraction bounds, exact boundary, cancellation and cooperative work passed');

const words=await extract(['abc '.repeat(1000)],{wrapped:true});
assert.deepEqual(Array.from(words.result.lines,line=>line.text),Array(50).fill('abc '.repeat(20).trimEnd()));
assert.ok(words.ranges<1000,'grouped tokens reduce geometry calls below word count');
const breaks=await extract(['one\n\ntwo\tthree']);
assert.deepEqual(Array.from(breaks.result.lines,line=>line.text),['one','','two\tthree']);
console.log('token grouping preserves visual lines, empty lines and tabs');
