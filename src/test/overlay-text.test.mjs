import assert from 'node:assert/strict';
import {byteOffsetToIndex, boundChunks, chunksText} from '../../dist/core/ui-text.js';
import {commandText, wrapHighlighted} from '../../dist/renderer/overlay-text.js';
const text='A文😀é';
for(const [byte,index] of [[0,0],[1,1],[2,1],[4,2],[7,2],[8,4],[9,5],[11,6],[999,6]]) {
 assert.equal(byteOffsetToIndex(text,byte),index,`byte ${byte}`);
}
const line={content:text,chunks:[{highlightId:2,text}],firstChar:':',prompt:'',indent:0,position:8,specialChar:'',specialShift:false};
assert.equal(commandText(line).cursorIndex,5);
assert.equal(chunksText(commandText({...line,position:4,specialChar:'?',specialShift:false}).chunks),':A文?é');
assert.equal(chunksText(commandText({...line,position:4,specialChar:'?',specialShift:true}).chunks),':A文?😀é');
const wrapped=wrapHighlighted([{highlightId:2,text:'文😀'},{highlightId:3,text:'éx\nlast'}],4,
 s=>s==='文'||s==='😀'?2:1);
assert.deepEqual(wrapped.map(chunksText),['文😀','éx','last']);
assert.equal(wrapped[1][0].highlightId,3);
const tail=boundChunks([{highlightId:2,text:'x文😀'}],5);
assert.equal(chunksText(tail.chunks),'😀');assert.equal(tail.truncated,true);
const fragmented=boundChunks(Array.from({length:5000},(_,i)=>({highlightId:i%2,text:'x'})),99999);
assert.ok(fragmented.chunks.length<=4096);assert.ok(fragmented.truncated);
console.log('UTF-8 command offsets, special chars, highlighted grapheme wrapping and bounded text passed');
