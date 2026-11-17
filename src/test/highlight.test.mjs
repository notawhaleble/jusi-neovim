import assert from 'node:assert/strict';
import {styleForHighlight} from '../../dist/renderer/highlight.js';
const defaults={foreground:'#eeeeee',background:'#111111'};
for(const [attr,style] of [['underline','solid'],['undercurl','wavy'],['underdouble','double'],['underdotted','dotted'],['underdashed','dashed']]) {
  const css=styleForHighlight({[attr]:true,strikethrough:true,special:'#ff3366'},defaults);
  assert.ok(css.includes('text-decoration-line:underline line-through'));
  assert.ok(css.includes(`text-decoration-style:${style}`));
  assert.ok(css.includes('text-decoration-color:#ff3366'));
}
assert.ok(styleForHighlight({reverse:true,strikethrough:true},defaults).includes('color:#111111;background-color:#eeeeee'));
assert.equal(styleForHighlight(undefined,defaults),'');
assert.equal(styleForHighlight({},defaults),'');
console.log('Highlight decoration styles passed');
