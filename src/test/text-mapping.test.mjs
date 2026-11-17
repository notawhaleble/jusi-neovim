import assert from 'node:assert/strict';
import { columnOffset, offsetColumn, selectionOffsets, selectionRanges } from '../../dist/backends/web/text-mapping.js';
import { browserIndex, browserPosition } from '../../dist/backends/web/interaction.js';
const text='A😀e\u0301文 אב';
const boundaries=[0,1,3,4,5,6,7,8,9];
for(let col=0;col<boundaries.length;col++) {
 assert.equal(columnOffset(text,col),boundaries[col]);
 assert.equal(offsetColumn(text,boundaries[col]),col);
}
assert.equal(offsetColumn(text,2),1,'surrogate interior snaps to code-point start');
const mirror={version:1,totalTextLength:text.length,lines:[{lineNumber:0,text,startIndex:0,endIndex:text.length,spans:[]}]};
assert.equal(browserIndex(mirror,{row:0,col:4}),5);
assert.deepEqual(browserPosition(mirror,5),{row:0,col:4});
for(const [a,b,range] of [[1,1,{from:1,to:3}],[2,2,{from:3,to:5}],[4,1,{from:1,to:6}],[6,7,{from:7,to:9}]])
 assert.deepEqual(selectionOffsets(mirror,{start:{row:0,col:a},end:{row:0,col:b}}),range);
assert.deepEqual(selectionOffsets(mirror,{start:{row:0,col:4},end:{row:0,col:1},linewise:true}),{from:0,to:9});
assert.deepEqual(selectionOffsets(mirror,{start:{row:0,col:99},end:{row:0,col:99}}),{from:9,to:9});
assert.equal(selectionOffsets(mirror,{start:{row:1,col:0},end:{row:1,col:0}}),null);
assert.equal(columnOffset('',100),0);
console.log('Unicode code-point/UTF-16 and inclusive selection mapping tests passed');

const resolved = {start:{row:0,col:1},end:{row:0,col:4},spans:[{row:0,startCol:1,endCol:4}]};
assert.deepEqual(selectionRanges(mirror,resolved),[{from:1,to:5}]);
assert.deepEqual(selectionRanges(mirror,{...resolved,spans:[]}),[]);
assert.equal(selectionRanges(mirror,{...resolved,spans:[{row:8,startCol:0,endCol:1}]}),null);
assert.equal(selectionRanges(mirror,{...resolved,spans:[{row:0,startCol:0,endCol:99}]}),null);
